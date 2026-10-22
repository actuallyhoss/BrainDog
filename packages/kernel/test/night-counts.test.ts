/**
 * What the night counts of the record itself (`night-counts.ts`) and the two figures that read it back:
 * `lists-shrunk` (REC-A17 job 3) and `documents-dead-paths` (REC-A13 job 1).
 *
 * A LOSS NOBODY MADE IS THE ONE THING `lists-shrunk` COUNTS: a person's delete is in the log, and the sweep clears only
 * what was deleted long ago, so neither is a shrink. A row gone from the table with no delete is. A PLACEHOLDER THAT NAMES
 * NOTHING is counted the night after it is written, and leaves the count the night after it is mended.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { builtInFigure, countsSeries } from '../src/built-in-figures.ts';
import { evaluateMetric, type Reading } from '../src/metrics.ts';
import { DEAD_PATHS_META, NIGHT_COUNTS_SOURCE, countLists, deadPaths, type DeadPathsDeps } from '../src/night-counts.ts';
import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 8, 10);
const P1 = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.projects',
  kind: 'register',
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'note', type: 'document' },
    ],
  },
} as never;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
} as never;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([PROJECTS, TASKS])).ok);
  return { k, sql, clock };
}

const read = (sql: NodeSql, id: string, nowMs: number): Reading => {
  const r = evaluateMetric(sql, builtInFigure(id)!, { nowMs, tz: 'UTC', schemaOf: () => null });
  assert.ok(r.ok, JSON.stringify(r));
  return r.value;
};

const point = (sql: NodeSql, series: string, day: string) =>
  sql.one<{ value: number; source: string }>("SELECT value, source FROM metric_point WHERE series = ? AND grain = 'day' AND at = ?", series, day);

test('EACH LIST IS COUNTED A NIGHT, live and deleted, and an empty one reads nought rather than no night', async () => {
  const { k, sql } = await record();
  for (const name of ['Oxbow', 'Lantern', 'Orbit']) assert.ok(k.create('projects', { name }, P1).ok);
  assert.ok(k.update('projects', 'projects#3', { deleted_at: '2026-10-08' }, P1).ok);
  const counted = countLists(sql, NOW);
  assert.deepEqual(counted.projects, { live: 2, deleted: 1 });
  assert.deepEqual(counted.tasks, { live: 0, deleted: 0 });
  assert.deepEqual({ ...point(sql, countsSeries('projects', 'live'), '2026-10-08') }, { value: 2, source: NIGHT_COUNTS_SOURCE });
  assert.equal(point(sql, countsSeries('projects', 'deleted'), '2026-10-08')?.value, 1);
  assert.equal(point(sql, countsSeries('tasks', 'live'), '2026-10-08')?.value, 0);
  /* THE SAME NIGHT RUN TWICE IS ONE POINT, written again. */
  countLists(sql, NOW + 60_000);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM metric_point WHERE series = ?", countsSeries('projects', 'live'))?.n, 1);
});

test('A PERSON DELETING IS NOT A SHRINK, A SWEEP IS NOT A SHRINK, and a row gone with no delete is', async () => {
  const { k, sql, clock } = await record();
  for (const name of ['Oxbow', 'Lantern', 'Orbit', 'Quay']) assert.ok(k.create('projects', { name }, P1).ok);
  /* ONE NIGHT HAS NOTHING TO FALL FROM. */
  countLists(sql, clock.now());
  assert.equal(read(sql, 'lists-shrunk', clock.now()).value, null);

  /* THE NEXT DAY A PERSON DELETES ONE, and one deleted long ago is swept away: live falls by the delete the log holds. */
  clock.set(NOW + DAY);
  assert.ok(k.update('projects', 'projects#4', { deleted_at: '2026-08-01' }, P1).ok);
  k.purge({ cutoffMs: clock.now() + 1 });
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'projects'")?.n, 3, 'the sweep did not clear the row deleted long ago');
  clock.advance(60_000);
  countLists(sql, clock.now());
  const kept = read(sql, 'lists-shrunk', clock.now());
  assert.equal(kept.value, 0, kept.why);
  assert.equal(kept.met, true);

  /* AND THE DAY AFTER, A ROW LEAVES THE TABLE WITH NOTHING IN THE LOG. */
  clock.set(NOW + 2 * DAY);
  sql.exec("DELETE FROM entry WHERE register = 'projects' AND seq = 2");
  countLists(sql, clock.now());
  const lost = read(sql, 'lists-shrunk', clock.now());
  assert.equal(lost.value, 1);
  assert.equal(lost.met, false);
  assert.match(lost.why, /^Projects holds fewer than the night before with nothing deleted to say why$/u);
  assert.doesNotMatch(lost.why, /\brow|projects#|—/u);
});

const depsOf = (k: Kernel, sql: NodeSql, nowMs: number): DeadPathsDeps => ({
  sql,
  nowMs,
  tz: 'UTC',
  registers: k.registers(),
  unnamed: (block) => k.block(block).unnamed,
});

test('A PLANTED DEAD PATH READS 1 THE NEXT NIGHT, and nought the night after it is mended', async () => {
  const { k, sql, clock } = await record();
  assert.ok(k.create('projects', { name: 'Oxbow', note: 'Plan for {{name}}: {{projects.count}} projects, `{{as.written}}` in a code span.' }, P1).ok);
  assert.ok(k.create('tasks', { what: '{{not.a.document}}' }, P1).ok);
  assert.equal(read(sql, 'documents-dead-paths', clock.now()).value, null, 'read nought before the walk had been over the notes');
  deadPaths(depsOf(k, sql, clock.now()));
  assert.equal(read(sql, 'documents-dead-paths', clock.now()).value, 0, 'a field of its own list, a count and a code span are not dead');

  assert.ok(k.update('projects', 'projects#1', { note: 'Revenue is {{revenue.monthly}} for {{name}}.' }, P1).ok);
  clock.set(NOW + DAY);
  const night = deadPaths(depsOf(k, sql, clock.now()));
  assert.equal(night.dead, 1);
  const dead = read(sql, 'documents-dead-paths', clock.now());
  assert.equal(dead.value, 1);
  assert.equal(dead.met, false);
  assert.equal(dead.why, 'one placeholder in the notes names nothing here');

  assert.ok(k.update('projects', 'projects#1', { note: 'Revenue is `{{revenue.monthly}}` for {{name}}.' }, P1).ok);
  clock.set(NOW + 2 * DAY);
  deadPaths(depsOf(k, sql, clock.now()));
  assert.equal(read(sql, 'documents-dead-paths', clock.now()).value, 0);
});

test('THE WALK IS BOUNDED A NIGHT: it says nothing until a pass ends, then keeps what it found across nights', async () => {
  const { k, sql, clock } = await record();
  for (const [i, name] of ['Oxbow', 'Lantern', 'Orbit'].entries()) assert.ok(k.create('projects', { name, note: i === 1 ? '{{gone.one}} and {{gone.two}}' : 'clean' }, P1).ok);
  const first = deadPaths(depsOf(k, sql, clock.now()), null, 2);
  assert.deepEqual([first.read, first.finished, first.next > 0], [2, false, true]);
  assert.equal(read(sql, 'documents-dead-paths', clock.now()).value, null, 'a pass cut short read as the whole record');
  clock.set(NOW + DAY);
  const second = deadPaths(depsOf(k, sql, clock.now()), null, 2);
  assert.deepEqual([second.read, second.finished, second.dead], [1, true, 2]);
  assert.equal(read(sql, 'documents-dead-paths', clock.now()).value, 2);
  /* A ROW DELETED SINCE IT WAS FOUND LEAVES THE COUNT when the pass that did not see it ends. */
  assert.ok(k.update('projects', 'projects#2', { deleted_at: '2026-10-09' }, P1).ok);
  clock.set(NOW + 2 * DAY);
  deadPaths(depsOf(k, sql, clock.now()), null, 2);
  assert.equal(read(sql, 'documents-dead-paths', clock.now()).value, 0);
  assert.ok(sql.one('SELECT value FROM dog_meta WHERE key = ?', DEAD_PATHS_META), 'the walk kept no place');
});
