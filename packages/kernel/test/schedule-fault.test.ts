/**
 * The schedule's ladder ends in a fault, never a question (AGT-C06-c).
 *
 * A scheduled thing that cannot run eight times used to open "A pull due ... could not run after 8 attempts: ...
 * Retry it, or change what produces it." in Decide. What is asserted: the eighth failure raises `schedule#<kind>` and
 * files no question, a kind nothing handles fails once into the same fault, a row of the kind that then runs clears it,
 * `retryFailed` puts the newest failed row back, and the guard: neither ladder's file inserts into `suggestion`.
 *
 * Over a bare database holding the two tables the drain touches, so it holds whatever the rest of the ledger is doing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import faults0030 from '../src/migrations/0030_faults.ts';
import { openFaults } from '../src/fault.ts';
import { drainSchedule, retryFailed } from '../src/schedule.ts';
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
    CREATE TABLE schedule (id TEXT PRIMARY KEY, due_at TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}', state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      UNIQUE (kind, key));
  `);
  sql.exec(faults0030);
  return sql;
}

const deps = (nowMs: number) => ({ mint: () => '01ABCDEFGHJKMNPQRSTVWXYZ01', allocate: () => 1, nowMs });

const due = (sql: NodeSql, id: string, kind: string, at: number): void =>
  sql.exec("INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES (?, ?, ?, ?, '{}', 'pending', 0)", id, iso(at), kind, id);

test('THE EIGHTH FAILURE RAISES schedule#<kind>, ONE LINE, AND FILES NO QUESTION', () => {
  const sql = bare();
  due(sql, 's_1', 'digest', NOW - 1);
  let at = NOW;
  const boom = { digest: () => { throw new Error('The digest could not be assembled'); } };
  for (let n = 1; n <= 8; n++) {
    drainSchedule(sql, deps(at), boom);
    if (n < 8) {
      assert.equal(openFaults(sql).length, 0, `a fault raised on rung ${n}`);
      at = Date.parse(sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE id = 's_1'")!.due_at);
    }
  }
  assert.equal(sql.one<{ state: string }>("SELECT state FROM schedule WHERE id = 's_1'")!.state, 'failed');
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0, 'the end of the ladder filed a question');
  assert.equal(sql.all('SELECT 1 FROM event').length, 0, 'the end of the ladder announced a question');

  const [f, ...rest] = openFaults(sql);
  assert.equal(rest.length, 0);
  assert.equal(f!.cause, 'schedule#digest');
  assert.equal(f!.kind, 'digest');
  assert.equal(f!.family, 'schedule');
  assert.equal(f!.count, 1);
  assert.equal(f!.error, 'The digest could not be assembled');
  assert.doesNotMatch(f!.said, /digest|8|attempt/);
  sql.close();
});

test('A KIND NOTHING HANDLES FAILS ONCE INTO ITS FAULT; a row of the kind that runs clears it; another kind does not', () => {
  const sql = bare();
  due(sql, 's_1', 'pull', NOW - 1);
  due(sql, 's_2', 'purge', NOW - 1);
  const out = drainSchedule(sql, deps(NOW), { purge: () => null });
  assert.equal(out.dead, 1);
  assert.deepEqual(openFaults(sql).map((f) => f.cause), ['schedule#pull'], 'a purge that ran touched the pull fault');

  // Put back by `retryFault`, and handled this time.
  assert.equal(retryFailed(sql, 'pull', NOW + HOUR), 1);
  assert.deepEqual(
    { ...sql.one<{ state: string; attempts: number; due_at: string }>('SELECT state, attempts, due_at FROM schedule WHERE id = ?', 's_1') },
    { state: 'pending', attempts: 0, due_at: iso(NOW + HOUR) },
  );
  assert.equal(retryFailed(sql, 'pull', NOW + HOUR), 0, 'a second retry found a row already pending');
  drainSchedule(sql, deps(NOW + HOUR), { pull: () => null });
  assert.equal(openFaults(sql).length, 0);
  assert.equal(sql.one<{ c: string }>("SELECT cleared_at AS c FROM fault WHERE cause = 'schedule#pull'")!.c, iso(NOW + HOUR));
  sql.close();
});

test('THE GUARD: neither ladder inserts into `suggestion`, and the shared question-filer is gone', () => {
  /* "Only govern.ts inserts into suggestion" is not true today (`ingest.ts` files its own), so the guard is the two
     files this unit changed: a dead job or a dead row filing a question again is a fault becoming a question again. */
  for (const file of ['outbox.ts', 'schedule.ts']) {
    const text = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /INSERT\s+(OR\s+\w+\s+)?INTO\s+suggestion\b/i, `${file} inserts into suggestion`);
    assert.doesNotMatch(text, /openChangeSuggestion/, `${file} still names openChangeSuggestion`);
  }
});
