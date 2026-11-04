/**
 * Migration 36: a run never heard from here holds no next step unless it ended in `handoff` (the data step).
 *
 * MEASURED BEFORE: on the owner's record 295 runs came in by the import, 291 abandoned, and the import kept whatever
 * step the adapter gave each, so a run written off in the old system could be offered as the next thing to pick up.
 * Each case makes such a record by writing the runs in as the import left them, then runs migration 36 again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';

import { applyMigrations } from '../src/migrate.ts';
import { openRecord } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MADE = '2026-09-29T08:00:00.000Z';
const SEEN = '2026-10-08T09:00:00.000Z';

type Run = { seq: number; state: string; next: string; last_seen?: string };

/** A record holding the runs given, each with the line that wrote its step, as the import leaves them. */
async function withRuns(runs: Run[]) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await openRecord(sql, clock);
  for (const run of runs) {
    const id = `01K0000000000000000000000${String(run.seq)}`;
    const fields = { doing: `Run ${String(run.seq)}`, state: run.state, next: run.next, started: MADE, ...(run.last_seen === undefined ? {} : { last_seen: run.last_seen }) };
    sql.exec(
      "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, 'session', ?, ?, ?, 3, ?, ?)",
      id, run.seq, JSON.stringify(fields), run.state, MADE, MADE,
    );
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v) VALUES (?, ?, 'p_1', 'edit', ?, 'entry', 'next', ?)",
      `01K00000000000000000000E0${String(run.seq)}`, MADE, `entry:${id}`, JSON.stringify(run.next),
    );
  }
  return { sql, clock };
}

/** Run migration 36 again over the record, as a deploy over an older one does. */
async function migrate36(r: Awaited<ReturnType<typeof withRuns>>): Promise<void> {
  r.sql.exec('DELETE FROM migration WHERE version >= 36');
  const { result } = await applyMigrations(r.sql, r.clock);
  assert.ok(result.ok, fixOf(result));
  assert.deepEqual(result.value.applied, [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48]);
}

const runs = (r: Awaited<ReturnType<typeof withRuns>>) =>
  r.sql
    .all<{ seq: number; fields: string; version: number; updated_at: string }>("SELECT seq, fields, version, updated_at FROM entry WHERE register = 'session' ORDER BY seq")
    .map((row) => ({ seq: row.seq, next: (JSON.parse(row.fields) as { next?: string }).next, version: row.version, updated_at: row.updated_at }));

const history = (r: Awaited<ReturnType<typeof withRuns>>) => r.sql.all('SELECT * FROM event ORDER BY rowid').map((row) => ({ ...row }));

test('A RUN NEVER HEARD FROM HERE LOSES ITS STEP, done or abandoned, and keeps its words in its history', async () => {
  const r = await withRuns([
    { seq: 1, state: 'done', next: 'Ship the invoice page' },
    { seq: 2, state: 'abandoned', next: 'Try the other key', last_seen: '' },
  ]);
  const was = history(r);
  await migrate36(r);
  /* IN PLACE: the step is gone and nothing else moved, not the version and not when the run last changed. */
  assert.deepEqual(runs(r), [
    { seq: 1, next: undefined, version: 3, updated_at: MADE },
    { seq: 2, next: undefined, version: 3, updated_at: MADE },
  ]);
  /* AND NO LINE IS WRITTEN OR TAKEN AWAY: the line that set each step still says it. */
  assert.deepEqual(history(r), was);
  assert.deepEqual(
    r.sql.all<{ to_v: string }>("SELECT to_v FROM event WHERE field = 'next' ORDER BY rowid").map((e) => JSON.parse(e.to_v) as string),
    ['Ship the invoice page', 'Try the other key'],
  );
  r.sql.close();
});

test('A RUN THAT ENDED IN handoff KEEPS ITS STEP, though it was never heard from here', async () => {
  const r = await withRuns([{ seq: 1, state: 'handoff', next: 'Pick up the migration' }]);
  await migrate36(r);
  assert.equal(runs(r)[0]!.next, 'Pick up the migration');
  r.sql.close();
});

test('A RUN HEARD FROM HERE KEEPS ITS STEP, whatever its state', async () => {
  const r = await withRuns([
    { seq: 1, state: 'abandoned', next: 'Finish the tests', last_seen: SEEN },
    { seq: 2, state: 'idle', next: 'Read the review', last_seen: SEEN },
  ]);
  await migrate36(r);
  assert.deepEqual(runs(r).map((run) => run.next), ['Finish the tests', 'Read the review']);
  r.sql.close();
});

test('A SECOND RUN CHANGES NOTHING, not a run and not a line', async () => {
  const r = await withRuns([
    { seq: 1, state: 'done', next: 'Ship the invoice page' },
    { seq: 2, state: 'handoff', next: 'Pick up the migration' },
    { seq: 3, state: 'active', next: 'Finish the tests', last_seen: SEEN },
  ]);
  await migrate36(r);
  const once = { entry: r.sql.all('SELECT * FROM entry ORDER BY id').map((row) => ({ ...row })), event: history(r) };
  await migrate36(r);
  assert.deepEqual({ entry: r.sql.all('SELECT * FROM entry ORDER BY id').map((row) => ({ ...row })), event: history(r) }, once);
  assert.deepEqual(runs(r).map((run) => run.next), [undefined, 'Pick up the migration', 'Finish the tests']);
  r.sql.close();
});
