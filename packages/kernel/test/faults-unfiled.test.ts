/**
 * Dead jobs with no line in `fault` are faults at once (audit 36-37, finding 2).
 *
 * Migration 30 closed the old dead-job questions on his record and raised no fault for the jobs behind them, so they
 * were in no list until the next full eight-rung death. What is asserted: a dead outbox kind and a failed schedule kind
 * read as faults straight away, in the table's own shape and sentence with no raw error; `retryFault` takes them by
 * their cause, and they leave the list once the kind works again; a kind already in `fault` is the table's alone, so a
 * cleared fault over old dead jobs stays cleared; a dead job a run was waiting on, and a death the kind has since
 * worked past, are not faults.
 *
 * Over the real kernel, with the rows written straight into the outbox and the schedule as migration 30 left them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import { SAID, SAID_KIND, clearFault, openFaults, raiseFault } from '../src/fault.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.refusal ? `${x.refusal.code}: ${x.refusal.fix}` : 'refused');
  return x.value;
};

const open = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  return { sql, clock, k };
};

const job = (sql: NodeSql, id: string, kind: string, state: string, at: number, payload: unknown = { to: 'someone' }): void =>
  sql.exec('INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES (?, ?, ?, ?, ?, 8)', id, iso(at), kind, JSON.stringify(payload), state);

const planned = (sql: NodeSql, id: string, kind: string, state: string, at: number): void =>
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, ?, ?, '{}', ?, 8)", id, iso(at), kind, id, state);

test('A DEAD OUTBOX KIND AND A FAILED SCHEDULE KIND WITH NO FAULT ROW ARE FAULTS AT ONCE, in the table\'s shape', async () => {
  const { sql, k } = await open();
  job(sql, 'o_1', 'infer.resolve', 'dead', NOW - 3 * DAY);
  job(sql, 'o_2', 'infer.resolve', 'dead', NOW - 2 * DAY);
  planned(sql, 's_1', 'pull', 'failed', NOW - DAY);

  const { faults } = value<{ faults: unknown[] }>(k.faults());
  assert.deepEqual(faults, [
    { cause: 'schedule#pull', kind: 'pull', family: 'schedule', said: SAID.schedule, count: 1, first_at: iso(NOW - DAY), last_at: iso(NOW - DAY), error: '' },
    {
      cause: 'outbox#infer.resolve',
      kind: 'infer.resolve',
      family: 'infer',
      said: SAID.infer,
      count: 2,
      first_at: iso(NOW - 3 * DAY),
      last_at: iso(NOW - 2 * DAY),
      error: '',
    },
  ]);
  sql.close();
});

test('RETRY TAKES THEM BY THEIR CAUSE, and they leave the list once the kind works again', async () => {
  const { sql, k } = await open();
  job(sql, 'o_1', 'notify.email', 'dead', NOW - 3 * DAY);
  job(sql, 'o_2', 'notify.email', 'dead', NOW - 2 * DAY);
  planned(sql, 's_1', 'pull', 'failed', NOW - DAY);

  assert.deepEqual(value(k.retryFault({ actor: 'p_1' }, { cause: 'outbox#notify.email' })), { cause: 'outbox#notify.email', queued: 1 });
  assert.equal(sql.one<{ state: string }>("SELECT state FROM outbox WHERE id = 'o_2'")!.state, 'pending', 'the newest dead job was not queued');
  const left = openFaults(sql).find((f) => f.cause === 'outbox#notify.email');
  assert.equal(left?.count, 1, 'the older dead job stopped being a fault before the kind worked');

  const [again] = k.leaseOutbox(['notify.email'], 1);
  assert.equal(again?.id, 'o_2');
  value(k.ackOutbox({ id: again!.id, state: 'done', leasedUntil: again!.leasedUntil }));
  assert.equal(openFaults(sql).some((f) => f.cause === 'outbox#notify.email'), false, 'a kind that works again is still a fault');

  assert.deepEqual(value(k.retryFault({ actor: 'p_1' }, { cause: 'schedule#pull' })), { cause: 'schedule#pull', queued: 1 });
  assert.deepEqual(openFaults(sql), [], 'a failed schedule row put back is still a fault');
  assert.equal(k.retryFault({ actor: 'p_1' }, { cause: 'schedule#pull' }).ok, false, 'a fault no longer open was tried again');
  sql.close();
});

test('A KIND WITH A FAULT ROW IS THE TABLE\'S: cleared over old dead jobs it stays cleared, open it is one line', async () => {
  const { sql } = await open();
  job(sql, 'o_1', 'export.r2', 'dead', NOW - 2 * DAY);
  raiseFault(sql, 'outbox#export.r2', 'export.r2', 'The bucket is gone', NOW - DAY);
  assert.deepEqual(openFaults(sql).map((f) => [f.cause, f.count, f.error]), [['outbox#export.r2', 1, 'The bucket is gone']]);

  clearFault(sql, 'outbox#export.r2', NOW);
  assert.deepEqual(openFaults(sql), [], 'a cleared fault came back from its old dead job');
  sql.close();
});

test('A DEATH THE KIND HAS WORKED PAST IS HISTORY, and a job a run was waiting on ended its run instead', async () => {
  const { sql } = await open();
  job(sql, 'o_1', 'notify.email', 'dead', NOW - 30 * DAY);
  job(sql, 'o_2', 'notify.email', 'done', NOW - 29 * DAY);
  job(sql, 'o_3', 'infer.ask', 'dead', NOW - DAY, { run: 'r_1', step: 0, question: 'Which one?' });
  job(sql, 'o_4', 'infer.embed', 'dead', NOW - DAY, 'not json');
  job(sql, 'o_5', 'notify.email', 'dead', NOW - 31 * DAY);

  const faults = openFaults(sql);
  assert.deepEqual(faults.map((f) => f.cause), ['outbox#infer.embed'], 'history or a run\'s own death read as a fault');
  assert.equal(faults[0]!.said, SAID_KIND['infer.embed']);
  sql.close();
});
