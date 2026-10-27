/**
 * The agent door's marks: one row a run a kind, what adds and what keeps the most, the signs they add up to,
 * and the 30-day sweep.
 *
 * THE DATABASE IS MIGRATION 1'S TEXT AND THEN 29'S, applied as SQLite applies a script. 29 leans on nothing after 1
 * (`dog_section`), and 16 reaches `migrate.ts` through `declare.ts`, which imports every migration a wave may still be
 * writing, so this file stands on the two it needs and reads `door.ts` directly rather than through a verb. The verb,
 * the sweep's hour and the ledger row are `migrate.test.ts`'s and the record's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

import { DOOR_KINDS, doorMarks, markDoor, sweepDoorMarks } from '../src/door.ts';
import { openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const WEEK = 7 * DAY;

const DIR = new URL('../src/migrations/', import.meta.url);

async function migrated(): Promise<NodeSql> {
  const sql = openSqlite();
  const files = readdirSync(DIR).filter((f) => f === '0001_kernel.ts' || f === '0029_door.ts').sort();
  assert.deepEqual(files, ['0001_kernel.ts', '0029_door.ts']);
  for (const f of files) sql.db.exec(((await import(new URL(f, DIR).href)) as { default: string }).default);
  return sql;
}

const rows = (sql: NodeSql) => sql.all<{ run: string; kind: string; n: number; ms: number | null; build: string | null; client: string | null }>(
  'SELECT run, kind, n, ms, build, client FROM door_mark ORDER BY run, kind',
);

test('THE KINDS ARE THE SEVEN THE BRIEF NAMES, and the table takes each and no other', async () => {
  assert.deepEqual([...DOOR_KINDS], ['hello', 'listed', 'called', 'hook', 'resource', 'card', 'internal']);
  const sql = await migrated();
  for (const kind of DOOR_KINDS) markDoor(sql, 'S1', { kind }, NOW);
  assert.equal(rows(sql).length, 7);
  assert.throws(() => sql.exec("INSERT INTO door_mark (run, kind, at) VALUES ('S1', 'other', 'x')"));
  /* A kind off the list from a surface is not kept, and does not throw into the call it rode on. */
  markDoor(sql, 'S1', { kind: 'other' as never }, NOW);
  markDoor(sql, '  ', { kind: 'hello' }, NOW);
  assert.equal(rows(sql).length, 7);
  assert.equal(sql.one<{ section: string }>("SELECT section FROM dog_section WHERE table_name = 'door_mark'")?.section, 'local');
});

test('ONE ROW A RUN A KIND: a count adds, a size keeps the most, a time keeps the slowest, a build the latest', async () => {
  const sql = await migrated();
  markDoor(sql, 'S1', { kind: 'called', n: 3 }, NOW);
  markDoor(sql, 'S1', { kind: 'called', n: 2 }, NOW + MIN);
  markDoor(sql, 'S1', { kind: 'called' }, NOW + 2 * MIN);
  markDoor(sql, 'S1', { kind: 'listed', n: 16 }, NOW);
  markDoor(sql, 'S1', { kind: 'listed', n: 12 }, NOW + MIN);
  markDoor(sql, 'S1', { kind: 'hook', ms: 300 }, NOW);
  markDoor(sql, 'S1', { kind: 'hook', ms: 900 }, NOW + MIN);
  markDoor(sql, 'S1', { kind: 'hook', ms: 100 }, NOW + 2 * MIN);
  markDoor(sql, 'S1', { kind: 'hello', build: '0.9.1', client: 'claude-code 2.1' }, NOW);
  markDoor(sql, 'S1', { kind: 'hello', build: '0.9.2' }, NOW + MIN);
  const by = new Map(rows(sql).map((r) => [r.kind, r]));
  assert.equal(by.get('called')?.n, 6);
  assert.equal(by.get('listed')?.n, 16);
  assert.equal(by.get('hook')?.ms, 900);
  assert.equal(by.get('hello')?.n, 2);
  assert.equal(by.get('hello')?.build, '0.9.2');
  assert.equal(by.get('hello')?.client, 'claude-code 2.1', 'a mark that names no client keeps the one it had');
  /* Junk is clamped, never kept as it came: a negative or fractional count, a paragraph for a build. */
  markDoor(sql, 'S2', { kind: 'called', n: -4, ms: 12.6, build: 'x'.repeat(500) }, NOW);
  const s2 = rows(sql).find((r) => r.run === 'S2');
  assert.equal(s2?.n, 1);
  assert.equal(s2?.ms, 13);
  assert.equal(s2?.build?.length, 80);
});

test('THE SIGNS COUNT SESSIONS IN THE WINDOW and read the line the brief asks for', async () => {
  const sql = await migrated();
  for (const run of ['S1', 'S2', 'S3']) {
    markDoor(sql, run, { kind: 'hello', build: run === 'S3' ? '0.9.1' : '0.9.2' }, NOW - DAY);
    markDoor(sql, run, { kind: 'listed', n: 16 }, NOW - DAY);
  }
  markDoor(sql, 'S1', { kind: 'called', n: 4 }, NOW - DAY);
  markDoor(sql, 'S2', { kind: 'called', n: 1 }, NOW - DAY);
  markDoor(sql, 'S1', { kind: 'hook', ms: 200 }, NOW - DAY);
  markDoor(sql, 'S2', { kind: 'hook', ms: 400 }, NOW - DAY);
  markDoor(sql, 'S3', { kind: 'hook', ms: 1500 }, NOW - DAY);
  markDoor(sql, 'S2', { kind: 'resource', ms: 80 }, NOW - DAY);
  markDoor(sql, 'S1', { kind: 'card', n: 140 }, NOW - DAY);
  markDoor(sql, 'S2', { kind: 'card', n: 210 }, NOW - DAY);
  markDoor(sql, 'token:t1', { kind: 'internal' }, NOW - DAY);
  markDoor(sql, 'token:t1', { kind: 'internal' }, NOW - DAY);
  /* Out of the window: heard eight days ago, so not counted this week. */
  markDoor(sql, 'S9', { kind: 'hello', build: '0.8.0' }, NOW - 8 * DAY);

  const s = doorMarks(sql, NOW - WEEK, NOW, '0.9.2');
  assert.equal(s.days, 7);
  assert.equal(s.hello, 3);
  assert.equal(s.listed, 3);
  assert.equal(s.called, 2);
  assert.equal(s.calls, 5);
  assert.equal(s.internal, 2);
  assert.deepEqual(s.builds, [{ build: '0.9.2', n: 2 }, { build: '0.9.1', n: 1 }]);
  assert.equal(s.behind, 1);
  assert.equal(s.hookMedianMs, 400);
  assert.equal(s.hookSlowestMs, 1500);
  assert.equal(s.resourceSlowestMs, 80);
  assert.equal(s.cardWordsMost, 210);
  assert.equal(s.said, 'Sessions that connected in the last 7 days: 3. Given the tools: 3. Made a call: 2. Builds behind: 1.');
  assert.ok(s.facts.includes('The start hook took 400 ms at the median and 1.5 s at the slowest.'), s.facts.join('\n'));
  assert.ok(s.facts.includes('2 answers failed inside BrainDog.'));
  for (const line of [s.said, ...s.facts]) assert.doesNotMatch(line, /—|S\d|token:/, line);

  /* No build named by the reader: nothing said about builds behind, rather than a guess. */
  assert.equal(doorMarks(sql, NOW - WEEK, NOW).behind, null);
  assert.doesNotMatch(doorMarks(sql, NOW - WEEK, NOW).said, /Builds behind/);
});

test('AN EMPTY DOOR READS ZERO SESSIONS AND NO TIMES, never 0 ms', async () => {
  const sql = await migrated();
  const s = doorMarks(sql, NOW - DAY, NOW);
  assert.equal(s.said, 'Sessions that connected in the last day: 0. Given the tools: 0. Made a call: 0.');
  assert.equal(s.hookMedianMs, null);
  assert.equal(s.hookSlowestMs, null);
  assert.equal(s.resourceSlowestMs, null);
  assert.equal(s.cardWordsMost, null);
  assert.deepEqual(s.builds, []);
  assert.deepEqual(s.facts, []);
});

test('A SESSION GIVEN THE TOOLS THAT NEVER CALLED reads as such: the dead week, in one line', async () => {
  const sql = await migrated();
  markDoor(sql, 'S1', { kind: 'hello' }, NOW);
  markDoor(sql, 'S1', { kind: 'listed', n: 16 }, NOW);
  assert.match(doorMarks(sql, NOW - WEEK, NOW).said, /Given the tools: 1\. Made a call: 0\./);
});

test('A READING AS OF A DAY PAST COUNTS NOTHING MARKED AFTER IT, so a figure read back in time is that day’s', async () => {
  const sql = await migrated();
  markDoor(sql, 'S1', { kind: 'hello', build: '0.9.1' }, NOW - 2 * DAY);
  markDoor(sql, 'S2', { kind: 'hello', build: '0.9.2' }, NOW);
  markDoor(sql, 'S2', { kind: 'called', n: 3 }, NOW);
  const then = doorMarks(sql, NOW - 3 * DAY, NOW - DAY, '0.9.1');
  assert.equal(then.hello, 1);
  assert.equal(then.calls, 0);
  assert.deepEqual(then.builds, [{ build: '0.9.1', n: 1 }]);
  assert.equal(then.behind, 0);
  assert.equal(doorMarks(sql, NOW - 3 * DAY, NOW).hello, 2);
});

test('THE SWEEP DELETES MARKS OLDER THAN 30 DAYS and keeps the rest', async () => {
  const sql = await migrated();
  markDoor(sql, 'S1', { kind: 'hello' }, NOW - 31 * DAY);
  markDoor(sql, 'S1', { kind: 'called' }, NOW - 30 * DAY - MIN);
  markDoor(sql, 'S2', { kind: 'hello' }, NOW - 29 * DAY);
  assert.equal(sweepDoorMarks(sql, NOW), 2);
  assert.deepEqual(rows(sql).map((r) => r.run), ['S2']);
  assert.equal(sweepDoorMarks(sql, NOW), 0);
});
