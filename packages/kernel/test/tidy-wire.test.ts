/**
 * The tidy inside the hourly sweep (AGT-C18 job b's tick).
 *
 * WHAT WAS MEASURED BEFORE THIS. `tidyHour` was exported by nothing and called by nothing, so `tidy_line` was never
 * made on any record and "how good is BrainDog at cleaning up stale things" had no number to read. The sweep now runs
 * it once an hour, after its own cleaning, so a line says what is still stale and what the sweep just cleared.
 *
 * IT COUNTS AND ASKS NOTHING. No question signed by the record is wired on, so the sweep's pass keeps each finder's
 * line and files none of their questions. And a finder that throws costs its own line only: the books are still kept.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, staleNow, tidied, tidyDays, tidyHour, type Kernel, type TidyDay, type TidyLine } from '../src/index.ts';
import { registerFinder } from '../src/tidy.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 9);
const DAY = 86_400_000;
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  return { k, sql };
}

let planted = 9000;
/** One run, written straight into the table the sweep reads. `heard` is how long ago it was last heard from. */
function run(sql: NodeSql, state: string, heard: number, fields: Record<string, unknown> = {}): string {
  const seq = ++planted;
  const id = `RUN${seq}`;
  const at = ago(heard);
  sql.exec(
    "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, 'session', ?, ?, ?, 1, ?, ?)",
    id,
    seq,
    JSON.stringify({ doing: `Run ${seq}`, state, started: at, last_seen: at, ...fields }),
    state,
    at,
    at,
  );
  return id;
}

const kept = (sql: NodeSql): TidyDay[] => tidyDays(sql, NOW, 7);
const asked = (sql: NodeSql): number => Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause LIKE 'tidy#%'")!.n);

test('the names a host reads the tidy by are the kernel\'s own exports', () => {
  assert.equal(typeof tidyHour, 'function');
  for (const read of [tidyDays, staleNow, tidied]) assert.equal(typeof read, 'function');
  const line: TidyLine = { finder: 'steps-old', stale: 0, did: 0, asked: null };
  assert.equal(line.asked, null);
});

test('a record never swept holds no line, and the first sweep keeps one a finder', async () => {
  const { k, sql } = await record();
  assert.deepEqual(kept(sql), []);
  k.purge();
  assert.deepEqual(
    kept(sql).map((l) => [l.finder, l.stale, l.did]),
    [
      ['faults-open', 0, 0],
      ['questions-moot', 0, 0],
      ['questions-old', 0, 0],
      ['runs-empty', 0, 0],
      ['runs-stopped', 0, 0],
      ['steps-old', 0, 0],
    ],
  );
  sql.close();
});

test('a step passed over for thirty-one days: the sweep closes it and the steps line says so, and a second sweep inside the hour adds none', async () => {
  const { k, sql } = await record();
  run(sql, 'handoff', 31 * DAY, { next: 'Ship it', next_at: ago(31 * DAY), project: 'PRJ3' });
  /* A step two days old that a later run in the same place passed over: still stale after the sweep, which leaves it. */
  run(sql, 'handoff', 2 * DAY, { next: 'Write it up', next_at: ago(2 * DAY), project: 'PRJ1' });
  run(sql, 'done', DAY, { project: 'PRJ1', wrote: 2, started: ago(DAY + 3_600_000), last_seen: ago(DAY) });
  k.purge();
  const first = kept(sql);
  const steps = first.find((l) => l.finder === 'steps-old');
  assert.ok(steps, 'no line for the steps finder');
  /* The tidy runs after the sweep's own cleaning, so the old step reads as cleared and not as still stale. */
  assert.deepEqual([steps.stale, steps.did, steps.low, steps.day], [1, 1, 1, '2026-10-13']);
  /* AND THE TWO NUMBERS A FIGURE READS agree with the lines: what every finder still counts, and one cleared this week.
     The step the sweep closed is now a run that ended long ago and wrote nothing, so the empty runs count it too. */
  assert.equal(first.find((l) => l.finder === 'runs-empty')?.stale, 1);
  assert.equal(staleNow(sql, NOW), 2);
  assert.equal(staleNow(sql, NOW), first.reduce((n, l) => n + l.stale, 0));
  assert.equal(tidied(sql, NOW, 7), 1);
  k.purge();
  assert.deepEqual(kept(sql), first);
  assert.equal(Number(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM tidy_line')!.n), first.length);
  sql.close();
});

test('the sweep counts and asks nothing: a finder with a question to ask keeps its line and files none', async () => {
  const { k, sql } = await record();
  run(sql, 'done', 40 * DAY, { wrote: 0 });
  run(sql, 'done', 45 * DAY, { wrote: 0 });
  k.purge();
  assert.equal(kept(sql).find((l) => l.finder === 'runs-empty')?.stale, 2);
  assert.equal(asked(sql), 0);
  k.purge();
  assert.equal(asked(sql), 0);
  sql.close();
});

test('a finder that throws: the sweep still finishes, the other finders keep their lines, and it throws again next hour without harm', async () => {
  const { k, sql } = await record();
  registerFinder({
    id: 'wire-broken',
    find() {
      throw new Error('a finder that cannot count');
    },
  });
  run(sql, 'handoff', 31 * DAY, { next: 'Ship it', next_at: ago(31 * DAY), project: 'PRJ3' });
  const out = k.purge();
  assert.equal(typeof out, 'object');
  const lines = kept(sql);
  assert.equal(lines.find((l) => l.finder === 'wire-broken'), undefined);
  assert.equal(lines.find((l) => l.finder === 'steps-old')?.did, 1);
  assert.equal(lines.length, 6);
  /* THE BOOKS WERE KEPT: the step the sweep is for was closed, in the same call. */
  assert.equal(sql.one<{ state: string }>("SELECT state FROM entry WHERE register = 'session' AND json_extract(fields, '$.next') = 'Ship it'")?.state, 'done');
  assert.doesNotThrow(() => k.purge());
  sql.close();
});
