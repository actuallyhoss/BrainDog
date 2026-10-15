/**
 * Run now: `nudgeAction` moves one scheduled action's next run to now, and `nudgeRate` holds the presses.
 *
 * WHAT IS HELD HERE: the pending row's `due_at` moves to now and one event names the action and who pressed; nothing is
 * queued by the press itself; a paused, held, finished, rule-only or busy action answers its own sentence and its row
 * does not move; one press an action a minute and twenty a record an hour, with `retry_after` in whole seconds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { NUDGE_FIELD, nudgeAction, nudgeRate } from '../src/nudge.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { PEOPLE } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const PRESSER = `person:${PEOPLE[1]!.handle ?? 'p_2'}`;

const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** A poll that sends no key, so the vault holds nothing a test must bind. */
const POLL = (name: string, over: Record<string, unknown> = {}): Declaration => ({
  id: `ingest.${name}`,
  kind: 'ingest',
  body: {
    ingest: name,
    channel: 'poll',
    url: `https://api.example.test/v1/${name}`,
    every: '6h',
    extract: { what: { after: 'rate ' } },
    writes: { register: 'notes' },
    ...over,
  } as never,
});

let minted = 0;
const mint = () => `ev_${String(++minted).padStart(6, '0')}`;

async function record(...more: Declaration[]): Promise<{ sql: NodeSql; kernel: Kernel; row: () => { state: string; due_at: string } | undefined }> {
  const sql = openSqlite();
  const kernel = await openRecord(sql, fixedClock(NOW));
  const out = await kernel.install([NOTES, POLL('tide'), ...more]);
  assert.ok(out.ok, JSON.stringify(out));
  const row = () => sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'poll' AND key = 'tide'");
  assert.equal(row()?.state, 'pending');
  /* A NEW ACTION IS ARMED FOR NOW, so its first run is the one the install promised; this one has run and waits six hours. */
  sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'poll'", new Date(NOW + 6 * 3_600_000).toISOString());
  return { sql, kernel, row };
}

const press = (sql: NodeSql, at: number, name = 'tide') => nudgeAction({ sql, nowMs: at, mint }, name, PRESSER);
const presses = (sql: NodeSql) => sql.all<{ actor: string; note: string }>("SELECT actor, note FROM event WHERE kind = 'pull' AND field = ?", NUDGE_FIELD).map((e) => ({ ...e }));
const refusal = <T>(r: { ok: boolean; refusal?: T }): T => {
  assert.ok(!r.ok, 'the press was taken');
  return r.refusal!;
};

test('A PRESS MOVES THE NEXT RUN TO NOW, writes one event naming the action and who pressed, and queues nothing', async () => {
  const { sql, row } = await record();
  const out = press(sql, NOW);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value, { ingest: 'tide', due_at: new Date(NOW).toISOString() });
  assert.equal(row()?.due_at, new Date(NOW).toISOString());
  assert.equal(row()?.state, 'pending');
  assert.deepEqual(presses(sql), [{ actor: PRESSER, note: 'tide was asked to run now.' }]);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'pull.fetch'")?.n, 0, 'the press made a request itself');
});

test('THE ALARM THEN RUNS IT LIKE ANY OTHER DUE RUN, and that run is the one on the meter', async () => {
  const { sql, kernel } = await record();
  assert.equal((await kernel.runActions(async () => ({ status: 200, body: 'rate 4', bytes: 6, ms: 3, requests: 1 }))).ran, 0, 'it ran before the press');
  assert.ok(press(sql, NOW).ok);
  const pass = await kernel.runActions(async () => ({ status: 200, body: 'rate 4', bytes: 6, ms: 3, requests: 1 }));
  assert.equal(pass.ran, 1);
  assert.deepEqual(pass.usage.map((u) => [u.ingest, u.usage.runs]), [['tide', 1]]);
});

test('A PAUSED ACTION ANSWERS ITS OWN SENTENCE AND DOES NOT MOVE', async () => {
  const { sql, row } = await record();
  sql.exec("UPDATE schedule SET state = 'paused' WHERE kind = 'poll' AND key = 'tide'");
  const before = row()?.due_at;
  const r = refusal(press(sql, NOW));
  assert.equal(r.code, 'OUT_OF_BOUNDS');
  assert.match(r.fix, /^tide is paused, so it does not run now\. Resume it/);
  assert.equal(row()?.due_at, before);
  assert.deepEqual(presses(sql), [], 'a refused press counted');
});

test('A HELD ACTION SAYS UNTIL WHEN, and does not run before the month turns', async () => {
  const { sql, row } = await record();
  const turn = Date.UTC(2026, 9, 1);
  sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'poll' AND key = 'tide'", new Date(turn).toISOString());
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES ('ev_held', ?, 'ingest:tide', 'pull', 'declaration:ingest.tide', 'declaration', ?, 'Held at the plan limit.')",
    new Date(NOW - 60_000).toISOString(),
    JSON.stringify({ channel: 'poll', outcome: 'held', usage: { runs: 0, held: 1 } }),
  );
  const r = refusal(press(sql, NOW));
  assert.deepEqual([r.code, r.fix], ['OUT_OF_BOUNDS', "tide is held at this plan's limit until 1 October, so it does not run now."]);
  assert.equal(row()?.due_at, new Date(turn).toISOString());
});

test('A HELD RUN WHOSE ROW WAITS THIS MONTH IS NOT THE PLAN\'S, and a row that gave up after its retries has no run waiting', async () => {
  const { sql, row } = await record();
  /* A call a rule sent past its day's share is metered held and leaves the row on its clock, six hours on. */
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES ('ev_rule_held', ?, 'ingest:tide', 'pull', 'declaration:ingest.tide', 'declaration', ?, 'Held for today.')",
    new Date(NOW - 60_000).toISOString(),
    JSON.stringify({ channel: 'poll', outcome: 'held', usage: { runs: 0, held: 1 } }),
  );
  assert.ok(press(sql, NOW).ok, 'a held run that waits this month was read as the plan holding it');
  assert.equal(row()?.due_at, new Date(NOW).toISOString());

  sql.exec("UPDATE schedule SET state = 'failed', due_at = ? WHERE kind = 'poll' AND key = 'tide'", new Date(NOW + 3_600_000).toISOString());
  const r = refusal(press(sql, NOW + 120_000));
  assert.deepEqual([r.code, r.fix], ['OUT_OF_BOUNDS', 'tide has no run waiting, so there is nothing to run now.']);
  assert.equal(row()?.due_at, new Date(NOW + 3_600_000).toISOString(), 'a failed row was moved, and the drain would never fire it');
  assert.equal(presses(sql).length, 1);
});

test('AN ACTION WITH NO RUN WAITING, ONE NOBODY DECLARED, ONE ONLY A RULE RUNS AND ONE ALREADY RUNNING EACH SAY SO', async () => {
  const { sql } = await record(POLL('ferry', { channel: 'call', method: 'POST', trigger: 'rule', every: undefined, grant: 'ferry hook' }));
  assert.equal(refusal(press(sql, NOW, 'lighthouse')).code, 'DECLARATION_UNKNOWN');

  sql.exec("UPDATE schedule SET state = 'firing' WHERE kind = 'poll' AND key = 'tide'");
  assert.match(refusal(press(sql, NOW)).fix, /^tide has a run on its way already/);

  sql.exec("DELETE FROM schedule WHERE kind = 'poll' AND key = 'tide'");
  assert.deepEqual([refusal(press(sql, NOW)).code, refusal(press(sql, NOW)).fix], ['OUT_OF_BOUNDS', 'tide has no run waiting, so there is nothing to run now.']);

  assert.equal(refusal(press(sql, NOW, 'ferry')).fix, 'ferry runs only when its automation sends it, so it has no schedule to run now.');
  assert.deepEqual(presses(sql), []);
});

test('ONE PRESS AN ACTION A MINUTE: the press at 30 seconds waits 30, the one at 61 is taken', async () => {
  const { sql } = await record();
  assert.ok(press(sql, NOW).ok);
  const r = refusal(press(sql, NOW + 30_000));
  assert.deepEqual([r.code, r.retry_after], ['RATE_LIMITED', 30]);
  assert.equal(refusal(press(sql, NOW + 59_500)).retry_after, 1, 'a part second is one whole second');
  assert.ok(press(sql, NOW + 61_000).ok);
  assert.equal(presses(sql).length, 2);
});

test('TWENTY PRESSES A RECORD AN HOUR: the twenty-first waits until the first leaves the hour', async () => {
  const names = Array.from({ length: 21 }, (_, i) => `gauge${i}`);
  const { sql } = await record(...names.map((n) => POLL(n)));
  for (let i = 0; i < 20; i++) assert.ok(press(sql, NOW + i * 1_000, names[i]).ok, `press ${i + 1}`);
  const late = NOW + 20 * 1_000;
  const r = refusal(press(sql, late, names[20]));
  assert.equal(r.code, 'RATE_LIMITED');
  assert.equal(r.retry_after, 3_600 - 20, 'the wait is until the first press of the hour leaves it');
  assert.equal(r.fix, 'Run now was pressed 20 times in the last hour. Press again in 60 minutes; every action still runs on its own schedule.');
  assert.ok(nudgeRate(sql, names[20]!, NOW + 3_600_001).ok, 'the hour turned and the record may press again');
});
