/**
 * A snapshot of a record's local yesterday, over an `instant` field rather than a `day`.
 *
 * `d254715a` ASKED THE QUESTION AT NOON UTC OF THE LOCAL DATE, which is exactly the record's day for a
 * `day` field, and left an `instant` one on the UTC day. The window's bounds are bare dates
 * (`at after -30d` resolves to `after 2026-08-05`, the as-of end to `before 2026-09-05`), and the
 * compiler compares a bare date with the first ten characters of the instant, which is its UTC date.
 * So in `America/New_York` the point stored under 4 September counted a row from ten at night on the
 * 4th (02:00 UTC on the 5th) as the 5th and dropped it, and counted a row from ten at night on 5 August
 * (02:00 UTC on the 6th) as the 6th and kept it. The audit (`loop/research-batch-twenty-audit.md` §5)
 * measured
 *
 *     {"at":"2026-09-04","value":10101}
 *
 * where the local thirty days to the 4th hold 10011. Solo founder's `datapoints-30d` is
 * `at after -30d` over an `instant`, which is the declaration this copies.
 *
 * TOKYO IS HELD because the repair resolves a day to the instant it starts at in the zone, and east of
 * UTC that instant is on the UTC date before, so the bounds it writes there are nothing like the bare
 * dates they replace. Tokyo was already right, and its figure happens to equal UTC's (the arithmetic
 * is under the rows); this holds it there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { openRecord, snapshot, type Declaration, type EvalContext, type MetricDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* Noon UTC on 5 September: eight in the morning in New York and nine at night in Tokyo, so local
   yesterday is 4 September in all three zones. */
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
      { id: 'at', type: 'instant', index: true },
    ],
  } as never,
};

const SCHEMA: Schema = {
  register: 'datapoints',
  fields: { what: { type: 'text' }, weight: { type: 'int' }, at: { type: 'instant' } },
} as Schema;

/* The founder figure's window, summing a weight rather than counting rows so the figure names the rows
   it counted. */
const REPORTED: MetricDecl = {
  metric: 'datapoints-30d',
  name: 'Numbers reported, 30 days',
  source: 'register.datapoints',
  where: 'at after -30d',
  value: { sum: 'weight' },
  format: 'int',
  target: { gte: 1 },
  window: '30d',
  compare: 'none',
};

/* The audit's five rows, written in UTC. The New York times are EDT (UTC-4), and the local thirty days
   to 4 September are 6 August to 4 September:
     1      09:00 on 4 Sep      inside
     10     22:00 on 4 Sep      inside, and the 5th by UTC
     100    22:00 on 5 Aug      outside, and the 6th by UTC
     1000   01:00 on 5 Sep      outside
     10000  01:00 on 6 Aug      inside
   In Tokyo (UTC+9) the same instants fall on 4 Sep, 5 Sep, 6 Aug, 5 Sep and 6 Aug, which is 10101, the
   set the UTC dates name too. */
const ROWS: ReadonlyArray<[at: string, weight: number]> = [
  ['2026-09-04T13:00:00Z', 1],
  ['2026-09-05T02:00:00Z', 10],
  ['2026-08-06T02:00:00Z', 100],
  ['2026-09-05T05:00:00Z', 1_000],
  ['2026-08-06T05:00:00Z', 10_000],
];

async function pointFor(tz: string): Promise<{ at: string; value: number } | undefined> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([DATAPOINTS])).ok);
  for (const [at, weight] of ROWS) assert.ok(k.create('datapoints', { what: `reported ${at}`, weight, at }, { actor: 'p_1' }).ok);
  const ctx: EvalContext = { nowMs: NOW, schemaOf: (register) => (register === 'datapoints' ? SCHEMA : null) };
  const out = snapshot(sql, REPORTED, ctx, { nowAt: new Date(NOW).toISOString(), tz }, 0);
  assert.ok(out.ok, JSON.stringify(out));
  const point = sql.one<{ at: string; value: number }>("SELECT at, value FROM metric_point WHERE series = 'datapoints-30d' AND grain = 'day'");
  sql.close();
  /* A plain object, because the row comes back without Object's prototype and `deepEqual` counts that. */
  return point && { at: point.at, value: point.value };
}

test('AN INSTANT WEST OF UTC IS COUNTED ON ITS LOCAL DAY, NOT ITS UTC ONE', async () => {
  assert.deepEqual(await pointFor('America/New_York'), { at: YESTERDAY, value: 10_011 });
});

test('and east of UTC, where the local day starts on the UTC date before', async () => {
  assert.deepEqual(await pointFor('Asia/Tokyo'), { at: YESTERDAY, value: 10_101 });
});

test('and on UTC, where the local day and the UTC day are one', async () => {
  assert.deepEqual(await pointFor('UTC'), { at: YESTERDAY, value: 10_101 });
});
