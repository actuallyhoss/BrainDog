/**
 * A question can close the ones it covers (scope D13): SG286 and SG287 said "Covers SG242 too" in words, and SG242
 * stayed open after they were answered. Filed with `covers`, accepting the newer one closes the older as moot, names it
 * in Handled, and the decision's Undo asks it again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const START = Date.UTC(2026, 9, 24, 7);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => START } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Tidy the scripts' } }, owner));
  return { sql, api, task };
}

const status = (sql: Awaited<ReturnType<typeof record>>['sql'], id: string) => sql.one<{ s: string; r: string | null }>('SELECT status AS s, resolved_as AS r FROM suggestion WHERE id = ?', id);

test('ACCEPTING A QUESTION THAT COVERS ANOTHER CLOSES THE OTHER AS MOOT, NAMED IN HANDLED, AND ITS UNDO ASKS IT AGAIN', async () => {
  const { sql, api, task } = await record();
  const rows = (patch: Record<string, unknown>) => ({ register: 'tasks', rows: [{ at: `tasks#${task.seq}`, version: task.version, patch }] });
  const older = value<{ id: string }>(
    await api.propose({ question: 'Note that the script is stale?', body_kind: 'rowset', body: rows({ note: 'Stale' }), cause: 'script-a' } as never, owner),
  );
  const newer = value<{ id: string }>(
    await api.propose({ question: 'Close the script task?', body_kind: 'rowset', body: rows({ state: 'done' }), cause: 'script-b', covers: [older.id] } as never, owner),
  );
  assert.equal(status(sql, older.id)?.s, 'open', 'filing covers closes nothing');

  const decided = value<{ decision: string; covered?: string[] }>(await api.decide({ id: newer.id, decide: { option: 'accept' } } as never, owner));
  assert.deepEqual(decided.covered, [older.id]);
  assert.deepEqual({ ...status(sql, older.id) }, { s: 'resolved', r: 'moot' });

  const handled = value<{ rows: { decision: string; line: string; why: string }[] }>(await api.handled({}, owner));
  const line = handled.rows.find((r) => r.line === 'Note that the script is stale');
  assert.ok(line, JSON.stringify(handled.rows));
  assert.equal(line.why, 'Settled by “Close the script task”.');
  assert.equal(line.decision, decided.decision);

  const plan = value<{ hash: string }>(api.kernel.undoPlan({ decision: decided.decision }));
  value(api.kernel.undoApply({ decision: decided.decision }, plan.hash, 'p_1'));
  assert.equal(status(sql, older.id)?.s, 'open', 'the Undo asks the covered question again');
  assert.equal(status(sql, newer.id)?.s, 'open');
  sql.close();
});

test('A NO LEAVES WHAT IT COVERS OPEN, AND COVERS NAMES ONLY OPEN QUESTIONS', async () => {
  const { sql, api, task } = await record();
  const rows = (patch: Record<string, unknown>) => ({ register: 'tasks', rows: [{ at: `tasks#${task.seq}`, version: task.version, patch }] });
  const older = value<{ id: string }>(await api.propose({ question: 'Note it?', body_kind: 'rowset', body: rows({ note: 'Stale' }), cause: 'c-a' } as never, owner));
  const newer = value<{ id: string }>(await api.propose({ question: 'Close it?', body_kind: 'rowset', body: rows({ state: 'done' }), cause: 'c-b', covers: [older.id] } as never, owner));
  value(await api.decide({ id: newer.id, decide: { option: 'reject' } } as never, owner));
  assert.equal(status(sql, older.id)?.s, 'open');

  const wrong = (await api.propose({ question: 'Again?', body_kind: 'rowset', body: rows({ state: 'done' }), cause: 'c-c', covers: [newer.id] } as never, owner)) as {
    ok: boolean;
    refusal?: { at?: string };
  };
  assert.equal(wrong.ok, false);
  assert.equal(wrong.refusal?.at, 'covers');
  sql.close();
});
