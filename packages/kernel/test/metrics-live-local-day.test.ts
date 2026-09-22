/**
 * The live figure and the list read the record's local day, as the stored night point does.
 *
 * `01d9a93a` SAID EVERY LIST'S OWN TIMESTAMPS ARE READ IN THE LOCAL DAY, AND ONLY THE NIGHT POINT WAS.
 * `localInstants` ran only where `ctx.tz` was set, and only `snapshot` set it: the kernel's `metric`
 * and the page layer's `read` passed an `evalContext()` with no zone, `list` never called
 * `localInstants`, and `resolveDay` dated `today` from the UTC date of the clock. The audit
 * (`loop/research-batch-twenty-eight-audit.md` §4) opened a record in `Asia/Tokyo` at 15:05 UTC on
 * 5 September, which is 00:05 on the 6th there and the moment the night alarm stores the 5th, over
 * four rows created at 14:00Z and 16:00Z on the 4th and 10:00Z and 15:01Z on the 5th, and measured
 *
 *     created_at is today       live 1100 | list sum 1100 | night point 110
 *     created_at is yesterday   live 11   | list sum 11   | night point 1
 *
 * The local 6th holds only the row created at 15:01Z, which is 1000, and the local 5th holds 10 and
 * 100. So the tile that read 100 at 23:59 on the 5th was stored six minutes later as 110, and the list
 * under the same words answered the UTC day with it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Schema } from '@braindog/where';

import { evaluateMetric, openRecord, type Declaration, type EvalContext, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/* 15:05 UTC on 5 September: 00:05 on the 6th in Tokyo. */
const NOW = Date.UTC(2026, 8, 5, 15, 5);

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
      { id: 'on', type: 'day', index: true },
    ],
  } as never,
};

/* The audit's four rows. `on` is the local date each was created on in Tokyo, so the declared `day`
   field and the kernel's `created_at` ask the same question about the same rows. */
const ROWS: ReadonlyArray<[created: string, weight: number, on: string]> = [
  ['2026-09-04T14:00:00.000Z', 1, '2026-09-04'],
  ['2026-09-04T16:00:00.000Z', 10, '2026-09-05'],
  ['2026-09-05T10:00:00.000Z', 100, '2026-09-05'],
  ['2026-09-05T15:01:00.000Z', 1_000, '2026-09-06'],
];

const summed = (where: string): MetricDecl => ({
  metric: 'weight',
  name: 'Weight',
  source: 'register.datapoints',
  where,
  value: { sum: 'weight' },
  format: 'int',
  target: { gte: 1 },
  window: '1d',
  compare: 'none',
});

async function recordIn(tz: string) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: 'rec_01J8ZX0000000000000000CA00', slug: 'local-day', name: 'Local day', tz, locale: 'en', owner: { id: 'p_1', name: 'Ada' } }).ok);
  assert.ok((await k.install([DATAPOINTS])).ok);
  for (const [created, weight, on] of ROWS) {
    const made = k.create('datapoints', { what: `added ${created}`, weight, on }, { actor: 'p_1' });
    assert.ok(made.ok);
    /* One clock cannot write four creation times, so the column is set in the form the kernel writes. */
    sql.exec('UPDATE entry SET created_at = ? WHERE id = ?', created, made.value.id);
  }
  return { k, sql };
}

/* The live tile's figure and the sum of the rows the list hands back for the same words. */
function readBoth(k: Awaited<ReturnType<typeof openRecord>>, where: string): { live: number | null; list: number } {
  const m = k.metric(summed(where)) as { ok: boolean; value: Reading };
  assert.ok(m.ok, JSON.stringify(m));
  const l = k.list({ register: 'datapoints', where, limit: 500 });
  assert.ok(l.ok, JSON.stringify(l));
  return { live: m.value.value, list: l.value.rows.reduce((n, r) => n + Number(r.fields.weight), 0) };
}

for (const [where, want] of [
  ['created_at is today', 1_000],
  ['created_at is yesterday', 110],
  ['on is today', 1_000],
  ['on is yesterday', 110],
] as const)
  test(`in Tokyo at 00:05 on the 6th, ${where} is the local day, live and listed`, async () => {
    const { k, sql } = await recordIn('Asia/Tokyo');
    const got = readBoth(k, where);
    sql.close();
    assert.deepEqual(got, { live: want, list: want });
  });

/* AND A METRIC READ AS OF A PAST DAY IN A ZONE FINDS ITS WINDOW'S FIRST DAY ON THE LOCAL CALENDAR.
   `evaluateMetric` resolves through `resolvedOf` and not the exported `predicateOf`, because `endedAt`
   reads a window's first day off its lower bound, and `predicateOf` now hands back that bound as the
   instant the local day starts at, whose UTC date east of UTC is the day before. `created_at after -1d`
   as of the 4th begins on the 4th, so it is a window that looks ahead and takes no as-of end: 1111, the
   same answer the bare days give. Checked by making `evaluateMetric` call `predicateOf`: every other
   kernel test still passed, and this read gave 1, because the start slipped to the 3rd and the window
   was cut at the 4th. */
test('a metric as of a past day in Tokyo reads its window start as the local day', async () => {
  const { sql } = await recordIn('Asia/Tokyo');
  const schema: Schema = { register: 'datapoints', fields: { what: { type: 'text' }, weight: { type: 'int' }, on: { type: 'day' } } } as Schema;
  const ctx: EvalContext = { nowMs: NOW, asOfMs: Date.UTC(2026, 8, 4, 12), tz: 'Asia/Tokyo', schemaOf: (r) => (r === 'datapoints' ? schema : null) };
  const r = evaluateMetric(sql, { ...summed('created_at after -1d') }, ctx) as { ok: boolean; value: Reading };
  sql.close();
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.value.value, 1_111);
});

/* AND THE BUCKET THE CLOCK IS IN IS THE SAME LOCAL DAY THE WORDS NAMED. `clockOf` moved `today` to
   the local date and `current` was still cut from the UTC date of `nowMs`, so in Tokyo at 00:05 on the
   6th `on after -3d` bucketed by day counted the 6th's row as today and marked the 5th as the bucket
   the clock is in. */
test('a live figure bucketed by day in Tokyo is in the local day', async () => {
  const { k, sql } = await recordIn('Asia/Tokyo');
  const m = k.metric({ ...summed('on after -3d'), group_by: 'on', bucket: 'day' }) as { ok: boolean; value: Reading };
  sql.close();
  assert.ok(m.ok, JSON.stringify(m));
  assert.equal(m.value.current, '2026-09-06');
});

/* The other side: a record in UTC reads what it always read, so the repair moves only a zone that is
   not UTC. 15:05Z on the 5th is the 5th, which holds 100 and 1000. */
test('a UTC record still reads the UTC day', async () => {
  const { k, sql } = await recordIn('UTC');
  const got = readBoth(k, 'created_at is today');
  sql.close();
  assert.deepEqual(got, { live: 1_100, list: 1_100 });
});
