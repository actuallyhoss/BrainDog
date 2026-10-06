/**
 * Undo and the walk over the past, reached as the record reaches them: `kernel.undoPlan` and `kernel.undoApply` hand
 * `undo.ts` the record's own parts, and `kernel.backfill` and `kernel.undoBackfill` hand `backfill.ts` the same. Each
 * batch put back is a line in `undone`, which the ladder reads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const OWNER: WriteContext = { actor: 'p_owner' };

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

test('AN AGENT’S WRITE IS PUT BACK THROUGH THE KERNEL, shown first in names, and the ladder hears of it once', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  const run: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client: 'claude-code' } };
  const made = value<Entry>(k.create('tasks', { what: 'Glaze the bowls' }, run));
  const batch = sql.one<{ b: string | null; id: string }>("SELECT batch AS b, id FROM event WHERE target = ? AND kind = 'create'", `entry:${made.id}`)!;

  const plan = value<{ hash: string; lines: string[] }>(k.undoPlan({ batch: batch.b ?? batch.id }));
  assert.ok(plan.lines.some((l) => l.includes('Glaze the bowls')), plan.lines.join(' | '));
  assert.ok(!plan.lines.some((l) => l.includes(made.id)), 'a person reads names, never ids');

  const stale = k.undoApply({ batch: batch.b ?? batch.id }, 'not-the-plan', 'p_owner');
  assert.equal(stale.ok, false);
  value(k.undoApply({ batch: batch.b ?? batch.id }, plan.hash, 'p_owner'));
  assert.equal(k.count('tasks'), 0);
  const marks = sql.all<{ actor: string | null; undone_by: string }>('SELECT actor, undone_by FROM undone');
  assert.equal(marks.length, 1);
  assert.equal(marks[0]?.undone_by, 'p_owner');
  sql.close();
});

test('THE WALK OVER THE PAST IS ONE KERNEL CALL, and a record with nothing to walk writes nothing', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([TASKS]));
  const done = k.backfill();
  assert.deepEqual([done.ledger.wrote, done.runs.wrote, done.services.wrote], [0, 0, 0]);
  assert.deepEqual(done.suggestions, []);
  assert.equal(k.undoBackfill('nothing-here', 'p_owner').ok, false, 'a batch the walk never wrote has nothing to put back');
  sql.close();
});
