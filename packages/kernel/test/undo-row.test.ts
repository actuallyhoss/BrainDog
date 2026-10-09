/**
 * "Only this one": an undo narrowed to one row of what a write, a decision or a run changed (`UndoScope.row`).
 *
 * The row is named the way a screen holds it, its list and number, and every step of a plan says its own so the screen
 * can ask for it back. The narrowed plan puts back that row alone, and its hash is that row's alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type WriteContext } from '../src/index.ts';
import { undoApply, undoPlan, type UndoParts } from '../src/undo.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 9);
const MIN = 60_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    one: 'task',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'due', type: 'day', label: 'Due' },
    ],
  } as never,
};

const MARA: WriteContext = { actor: 'p_mara' };
const AGENT: WriteContext = { actor: 'p_agent' };
const B = '01JRUNBATCH000000000000000';

function value<T>(out: Result<T> | { ok: boolean }): T {
  assert.ok(out.ok, fixOf(out as never));
  return (out as { value: T }).value;
}

/** What a refusal says, or `null` when it went through. */
const refused = (out: Result<unknown>): { code: string; at?: string | undefined } | null => (!out.ok && 'refusal' in out ? out.refusal : null);

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS]));
  sql.exec("INSERT INTO person (id, email, name) VALUES ('p_mara', 'mara@example.com', 'Mara'), ('p_agent', NULL, 'Robin')");
  const parts: UndoParts = { sql, clock, mint: ulids(clock.now), transaction: k.transaction, write: k.write };
  const a = value<Entry>(k.create('tasks', { name: 'Fix login', due: '2026-10-08' }, MARA)) as Entry & { seq: number };
  const b = value<Entry>(k.create('tasks', { name: 'Ship the beta', due: '2026-10-09' }, MARA)) as Entry & { seq: number };
  clock.advance(10 * MIN);
  /* ONE WRITE BY AN AGENT that moved both. */
  value(k.update('tasks', a.id, { due: '2026-10-20' }, { ...AGENT, batch: B, version: a.version }));
  value(k.update('tasks', b.id, { due: '2026-10-21' }, { ...AGENT, batch: B, version: b.version }));
  return { k, sql, parts, a, b };
}

test('every step says its list and number, and only this one takes back that row alone', async () => {
  const r = await record();
  const whole = value(undoPlan(r.sql, { batch: B }));
  assert.equal(whole.steps.length, 2);
  assert.deepEqual(
    whole.steps.map((s) => [s.register, s.seq]),
    [
      ['tasks', r.a.seq],
      ['tasks', r.b.seq],
    ],
  );

  const one = value(undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: r.b.seq } }));
  assert.deepEqual(one.lines, ['Sets due on "Ship the beta" back to 9 Oct 2026 (now 21 Oct 2026).']);
  assert.equal(one.say, 'Puts back one change.');
  assert.notEqual(one.hash, whole.hash, "the row's hash is its own");

  /* THE WHOLE PLAN'S HASH DOES NOT TAKE BACK ONE ROW, nor one row's the whole. */
  const stale = undoApply(r.parts, { batch: B, row: { register: 'tasks', seq: r.b.seq } }, whole.hash, 'p_mara');
  assert.equal(refused(stale)?.code, 'PLAN_STALE');
  const stale2 = undoApply(r.parts, { batch: B }, one.hash, 'p_mara');
  assert.equal(refused(stale2)?.code, 'PLAN_STALE');

  const done = value(undoApply(r.parts, { batch: B, row: { register: 'tasks', seq: r.b.seq } }, one.hash, 'p_mara'));
  assert.equal(done.put, 1);
  assert.equal(r.k.get(r.b.id)!.fields.due, '2026-10-09');
  assert.equal(r.k.get(r.a.id)!.fields.due, '2026-10-20', 'the other row is left as the agent left it');
  /* THE LADDER IS TOLD of the batch, by the agent who made it. */
  assert.deepEqual(done.undone, [{ batch: B, actor: 'p_agent', agent: null, kinds: done.undone[0]!.kinds }]);

  /* WHAT IS LEFT OF THE WRITE is the other row, and that row again is undone already. */
  const rest = value(undoPlan(r.sql, { batch: B }));
  assert.deepEqual(rest.lines, ['Sets due on "Fix login" back to 8 Oct 2026 (now 20 Oct 2026).']);
  const again = value(undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: r.b.seq } }));
  assert.equal(again.steps.length, 0);
  assert.equal(again.already, true);
  r.sql.close();
});

test('a row of a list she cannot read is not in the record, and the other row is not undone already for being in a batch once undone', async () => {
  const r = await record();
  const hidden = undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: r.b.seq } }, { reads: () => false });
  assert.equal(refused(hidden)?.code, 'ROW_UNKNOWN');
  assert.match(fixOf(hidden as never), /not in this record/);

  const b = value(undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: r.b.seq } }));
  value(undoApply(r.parts, { batch: B, row: { register: 'tasks', seq: r.b.seq } }, b.hash, 'p_mara'));
  /* SOMEBODY PUTS THE OTHER BACK BY HAND, so nothing of it is left to undo, and no undo did it. */
  value(r.k.update('tasks', r.a.id, { due: '2026-10-08' }, MARA));
  const a = value(undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: r.a.seq } }));
  assert.equal(a.steps.length, 0);
  assert.equal(a.already, false, 'the batch was undone for the other row, not this one');
  r.sql.close();
});

test('a row that is not a list and a number, not in the record, or not touched by the change is refused at row', async () => {
  const r = await record();
  for (const row of [{ register: 'tasks', seq: 0 }, { register: 'tasks', seq: 1.5 }, { register: '', seq: 1 }, { seq: 1 }, 'tasks#1']) {
    const out = undoPlan(r.sql, { batch: B, row: row as never });
    assert.equal(refused(out)?.code, 'VALUE_MALFORMED', JSON.stringify(row));
    assert.equal(refused(out)?.at, 'row');
  }
  const missing = undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: 99 } });
  assert.equal(refused(missing)?.code, 'ROW_UNKNOWN');
  assert.equal(refused(missing)?.at, 'row');

  const c = value<Entry>(r.k.create('tasks', { name: 'Elsewhere' }, MARA));
  const untouched = undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: c.seq! } });
  assert.equal(refused(untouched)?.code, 'ROW_UNKNOWN');
  assert.equal(refused(untouched)?.at, 'row');
  r.sql.close();
});


test("only this one stops the message that row queued, and leaves the rest of the write's", async () => {
  const r = await record();
  const at = r.sql.one<{ ts: string }>('SELECT ts FROM event WHERE batch = ? ORDER BY rowid DESC LIMIT 1', B)!.ts;
  r.sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('ob_a', ?, 'pull.fetch', ?, 'pending', 0), ('ob_b', ?, 'pull.fetch', ?, 'pending', 0), ('ob_all', ?, 'pull.fetch', ?, 'pending', 0)",
    at,
    JSON.stringify({ channel: 'call', entry: r.a.id }),
    at,
    JSON.stringify({ channel: 'call', entry: r.b.id }),
    at,
    JSON.stringify({ channel: 'call', batch: B }),
  );
  const one = value(undoPlan(r.sql, { batch: B, row: { register: 'tasks', seq: r.b.seq } }));
  assert.deepEqual(one.lines, ['Sets due on "Ship the beta" back to 9 Oct 2026 (now 21 Oct 2026).', 'Stops a call to another app before it goes out.']);
  assert.equal(one.steps[1]!.register, undefined, 'a stopped message is no row');
  value(undoApply(r.parts, { batch: B, row: { register: 'tasks', seq: r.b.seq } }, one.hash, 'p_mara'));
  const state = (id: string): string | undefined => r.sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', id)?.state;
  assert.equal(state('ob_b'), 'done');
  assert.equal(state('ob_a'), 'pending');
  assert.equal(state('ob_all'), 'pending');
  r.sql.close();
});
