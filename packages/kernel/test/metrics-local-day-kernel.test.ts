/**
 * The local day for the two instants every row has, `created_at` and `updated_at`.
 *
 * `9ba4fcd1` DATED A DECLARED `instant` ON THE RECORD'S LOCAL DAY AND LEFT THE KERNEL'S OWN TWO ON THE UTC ONE.
 * `localInstants` and `endedAt` both asked `schema.fields` whether a field was an instant, and `created_at` and
 * `updated_at` are not in it: they are `KERNEL_FIELDS`, read off `entry`'s columns, and addressable in any `where`
 * without a register declaring them. So `created_at after -30d`, which is "rows added, 30 days" and the figure an owner
 * is most likely to write next, got neither the local bounds nor the as-of end. Measured: the five rows of
 * `metrics-instant-day.test.ts` with each instant in `at` and in `created_at` and measured
 *
 *     America/New_York  at after -30d          2026-09-04 10011
 *     America/New_York  created_at after -30d  2026-09-04 11111
 *     Asia/Tokyo        created_at after -30d  2026-09-04 11111
 *     UTC               created_at after -30d  2026-09-04 11111
 *
 * 11111 is every row, in every zone, including 1000, which was created on the 5th everywhere and so
 * after the day the point is stored under. The figures below are the ones `at` already gives, because
 * the rows are the same instants and the question is the same question.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { openRecord, snapshot, type Declaration, type EvalContext, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* Noon UTC on 5 September, so local yesterday is 4 September in New York, Tokyo and UTC. */
const NOW = Date.UTC(2026, 8, 5, 12);
const YESTERDAY = '2026-09-04';

const DATAPOINTS: Declaration = {
  id: 'register.datapoints',
  kind: 'register',
  body: {
    id: 'datapoints',
    name: 'Datapoints',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'weight', type: 'int', index: true },
    ],
  } as never,
};

/* The declared fields only, as the kernel's `schemaOf` hands them over: the two instants under test are
   not in it, which is the whole of the defect. */
const SCHEMA: Schema = {
  register: 'datapoints',
  fields: { what: { type: 'text' }, weight: { type: 'int' } },
} as Schema;

const metricOver = (field: 'created_at' | 'updated_at', tree = false): MetricDecl => ({
  metric: `added-30d-${field}`,
  name: 'Rows added, 30 days',
  source: 'register.datapoints',
  where: tree ? ({ field, after: '-30d' } as never) : `${field} after -30d`,
  value: { sum: 'weight' },
  format: 'int',
  target: { gte: 1 },
  window: '30d',
  compare: 'none',
});

/* The same five instants as `metrics-instant-day.test.ts`, whose comment works out which fall inside the
   local thirty days to 4 September in each zone: 10011 in New York, 10101 in Tokyo and in UTC. */
const ROWS: ReadonlyArray<[at: string, weight: number]> = [
  ['2026-09-04T13:00:00.000Z', 1],
  ['2026-09-05T02:00:00.000Z', 10],
  ['2026-08-06T02:00:00.000Z', 100],
  ['2026-09-05T05:00:00.000Z', 1_000],
  ['2026-08-06T05:00:00.000Z', 10_000],
];

async function pointFor(tz: string, field: 'created_at' | 'updated_at', tree = false): Promise<{ at: string; value: number } | undefined> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([DATAPOINTS])).ok);
  for (const [at, weight] of ROWS) {
    const made = k.create('datapoints', { what: `added ${at}`, weight }, { actor: 'p_1' });
    assert.ok(made.ok);
    /* The clock cannot write five different creation times in one test, so the column is set directly,
       in the form the kernel writes it (`toISOString`). */
    sql.exec(`UPDATE entry SET ${field} = ? WHERE id = ?`, at, made.value.id);
  }
  const ctx: EvalContext = { nowMs: NOW, schemaOf: (register) => (register === 'datapoints' ? SCHEMA : null) };
  const metric = metricOver(field, tree);
  const out = snapshot(sql, metric, ctx, { nowAt: new Date(NOW).toISOString(), tz }, 0);
  assert.ok(out.ok, JSON.stringify(out));
  const point = sql.one<{ at: string; value: number }>("SELECT at, value FROM metric_point WHERE series = ? AND grain = 'day'", metric.metric);
  sql.close();
  return point && { at: point.at, value: point.value };
}

test('ROWS ADDED WEST OF UTC ARE COUNTED ON THEIR LOCAL DAY, AS A DECLARED INSTANT IS', async () => {
  assert.deepEqual(await pointFor('America/New_York', 'created_at'), { at: YESTERDAY, value: 10_011 });
});

test('and east of UTC, where the local day starts on the UTC date before', async () => {
  assert.deepEqual(await pointFor('Asia/Tokyo', 'created_at'), { at: YESTERDAY, value: 10_101 });
});

test('and on UTC, where only the as-of end was missing: the row created on the 5th is not in the 4th', async () => {
  assert.deepEqual(await pointFor('UTC', 'created_at'), { at: YESTERDAY, value: 10_101 });
});

test('updated_at is the other instant every row has, and follows the same rule', async () => {
  assert.deepEqual(await pointFor('America/New_York', 'updated_at'), { at: YESTERDAY, value: 10_011 });
});

/* THE TREE FORM SKIPPED THEM ONE STEP EARLIER. `resolveRelative` asked `schema.fields` too, so
   `{ field: created_at, after: '-30d' }`, the example `@braindog/where` gives for "rows added this week",
   reached SQL with the word `-30d` in it, and every instant there is sorts after that string: this read
   11111 in New York before the repair, as the sentence did. Repairing `endedAt` alone made it worse, a
   `RangeError: Invalid time value` from dating the unresolved word, so all three lookups go together. */
test('and the tree form, which reached SQL with -30d unresolved', async () => {
  assert.deepEqual(await pointFor('America/New_York', 'created_at', true), { at: YESTERDAY, value: 10_011 });
});

/* AND A FULL TIMESTAMP IS COMPARED AS WRITTEN, on a declared instant as on `created_at`. Once
   `resolveRelative` read the kernel's two, `created_at after 2020-01-01T00:00:00.000Z` went through
   `resolveDay` with the declared ones and was refused `RELATIVE_LITERAL_UNKNOWN` (`pages.test.ts` caught
   it). The declared half was refused already before any of this: measured at HEAD, `list` over
   `{ field: at, after: '2020-01-01T00:00:00.000Z' }` answered that refusal while the same bound on
   `created_at` listed the row. */
test('a full timestamp on any instant is a bound, not a word to resolve', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const STAMPED: Declaration = {
    id: 'register.stamped',
    kind: 'register',
    body: { id: 'stamped', name: 'Stamped', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'at', type: 'instant' }] } as never,
  };
  assert.ok((await k.install([STAMPED])).ok);
  assert.ok(k.create('stamped', { what: 'one', at: '2026-09-04T13:00:00.000Z' }, { actor: 'p_1' }).ok);
  for (const field of ['at', 'created_at'])
    for (const [op, matched] of [['after', 1], ['before', 0]] as const) {
      const out = k.list({ register: 'stamped', where: { field, [op]: '2020-01-01T00:00:00.000Z' } as never });
      assert.ok(out.ok, `${field} ${op}: ${JSON.stringify(out)}`);
      assert.equal(out.value.matched, matched, `${field} ${op}`);
    }
  sql.close();
});
