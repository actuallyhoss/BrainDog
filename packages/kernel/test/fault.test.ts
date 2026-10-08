/**
 * `fault.ts` (AGT-C06): a fault is one line a cause, counted, cleared, and read as a plain sentence.
 *
 * Over migration 30's own SQL on a bare database, with only the three tables its script touches, so this file holds
 * whatever the rest of the ledger is doing: the record-wide behaviour is `outbox.test.ts` and `schedule-fault.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import faults0030 from '../src/migrations/0030_faults.ts';
import { FAULT_FAMILIES, SAID, SAID_KIND, clearFault, familyOf, openFaults, raiseFault, saidOf } from '../src/fault.ts';
import { openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 3);
const HOUR = 3_600_000;
const iso = (ms: number): string => new Date(ms).toISOString();

function bare(): NodeSql {
  const sql = openSqlite();
  sql.exec(`
    CREATE TABLE dog_section (table_name TEXT PRIMARY KEY, section TEXT NOT NULL);
    CREATE TABLE suggestion (id TEXT PRIMARY KEY, body_kind TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL,
      opened_by TEXT NOT NULL, opened_at TEXT NOT NULL, resolved_as TEXT);
    CREATE TABLE event (id TEXT PRIMARY KEY, ts TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, target TEXT,
      target_kind TEXT, to_v TEXT, note TEXT);
  `);
  sql.exec(faults0030);
  return sql;
}

test('A FAULT IS ONE LINE A CAUSE: raised again it counts, moves its last time and keeps its first', () => {
  const sql = bare();
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'No model answered', NOW);
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'No model answered, again', NOW + HOUR);

  const [f, ...rest] = openFaults(sql);
  assert.equal(rest.length, 0);
  assert.deepEqual(f, {
    cause: 'outbox#infer.resolve',
    kind: 'infer.resolve',
    family: 'infer',
    said: 'BrainDog could not check for people who are here twice. It tries again tonight.',
    count: 2,
    first_at: iso(NOW),
    last_at: iso(NOW + HOUR),
    error: 'No model answered, again',
  });
  sql.close();
});

test('CLEARED, IT LEAVES THE OPEN ONES; raised again it opens with its count and first time kept', () => {
  const sql = bare();
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'No model answered', NOW);
  raiseFault(sql, 'schedule#pull', 'pull', 'Nothing handles it', NOW + HOUR);

  assert.equal(clearFault(sql, 'outbox#infer.resolve', NOW + 2 * HOUR), true);
  assert.equal(clearFault(sql, 'outbox#infer.resolve', NOW + 3 * HOUR), false, 'a fault already clear cleared again');
  assert.equal(clearFault(sql, 'outbox#notify.email', NOW), false, 'a fault never raised cleared');
  assert.deepEqual(openFaults(sql).map((f) => f.cause), ['schedule#pull']);
  assert.equal(sql.one<{ c: string }>("SELECT cleared_at AS c FROM fault WHERE cause = 'outbox#infer.resolve'")!.c, iso(NOW + 2 * HOUR));

  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'No model answered', NOW + 24 * HOUR);
  const back = openFaults(sql).find((f) => f.cause === 'outbox#infer.resolve')!;
  assert.equal(back.count, 2);
  assert.equal(back.first_at, iso(NOW));
  // The one that failed last comes first.
  assert.deepEqual(openFaults(sql).map((f) => f.cause), ['outbox#infer.resolve', 'schedule#pull']);
  sql.close();
});

test('THE SENTENCE IS THE FAMILY\'S: no job name, no model id, no count of attempts, no em dash', () => {
  assert.equal(familyOf('outbox#infer.resolve'), 'infer');
  assert.equal(familyOf('outbox#infer.embed'), 'infer');
  assert.equal(familyOf('outbox#notify.push'), 'notify');
  assert.equal(familyOf('outbox#pull.fetch'), 'pull');
  assert.equal(familyOf('outbox#export.r2'), 'export');
  assert.equal(familyOf('outbox#erase.r2'), 'export');
  assert.equal(familyOf('outbox#script.run'), 'script');
  assert.equal(familyOf('schedule#digest'), 'schedule');
  assert.equal(familyOf('schedule#pull'), 'schedule');
  assert.equal(familyOf('outbox#something.new'), 'other');

  for (const [name, said] of [...FAULT_FAMILIES.map((f) => [f, SAID[f]] as const), ...Object.entries(SAID_KIND)]) {
    assert.match(said, /^BrainDog could not .+\. It tries again .+\.$/, name);
    assert.doesNotMatch(said, /infer|notify|\.(r2|run|fetch|email|push|resolve|embed|draft|prose)\b|claude|gpt|model|attempt|\d|—/i, name);
  }
});

test('A MODEL JOB THAT IS NOT THE PAIRING NEVER SAYS HIS PEOPLE WERE NOT CHECKED: one line each, each its own', () => {
  const sql = bare();
  raiseFault(sql, 'outbox#infer.resolve', 'infer.resolve', 'No model answered', NOW);
  raiseFault(sql, 'outbox#infer.embed', 'infer.embed', 'No model answered', NOW + HOUR);
  raiseFault(sql, 'outbox#infer.draft', 'infer.draft', 'No model answered', NOW + 2 * HOUR);
  const said = openFaults(sql).map((f) => f.said);
  assert.equal(new Set(said).size, 3, 'two faults read the same sentence');
  assert.equal(said.filter((s) => /here twice/.test(s)).length, 1);
  assert.equal(saidOf('outbox#infer.embed'), SAID_KIND['infer.embed']);
  assert.equal(saidOf('outbox#infer.resolve'), SAID.infer);
  sql.close();
});

test('A LONG ERROR IS KEPT SHORT, and the sentence never carries it', () => {
  const sql = bare();
  raiseFault(sql, 'outbox#notify.email', 'notify.email', 'x'.repeat(5000), NOW);
  const [f] = openFaults(sql);
  assert.equal(f!.error.length, 500);
  assert.doesNotMatch(f!.said, /x{3}/);
  sql.close();
});

test('THE TABLE IS LOCAL: a fault does not travel in an export', () => {
  const sql = bare();
  assert.equal(sql.one<{ s: string }>("SELECT section AS s FROM dog_section WHERE table_name = 'fault'")!.s, 'local');
  sql.close();
});
