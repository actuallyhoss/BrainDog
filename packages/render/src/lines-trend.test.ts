import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linesPlan } from './lines.ts';
import { LINES_TREND_POINTS, LINES_TREND_T, linesTrend, noTrendSaid } from './lines-trend.ts';

/** A chart's fence as rows: a header, then a day and each line's value a point. `null` is a gap. */
const chart = (values: readonly (number | null)[], was?: readonly number[]): string[][] => [
  ['Day', 'Weekly orders', ...(was ? ['was: Weeks before'] : [])],
  ...values.map((v, i) => [`Week ${i + 1}`, v === null ? '' : String(v), ...(was ? [String(was[i] ?? '')] : [])]),
];

/** A seeded spread, the same every run: a small linear congruential walk from 0 to 1. */
const seeded = (seed: number, n: number): number[] => {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
};

test("the gate is the kernel's: six readings and a t of 2.1", () => {
  /* packages/kernel/src/trend.ts holds TREND_POINTS = 6 and TREND_BAND = 2.1; render imports nothing from it. */
  assert.equal(LINES_TREND_POINTS, 6);
  assert.equal(LINES_TREND_T, 2.1);
});

test('twelve readings that rise steadily draw a path from the first point to the last', () => {
  const plan = linesPlan(chart([10, 12, 13, 15, 16, 18, 19, 21, 23, 24, 26, 27]));
  const trend = linesTrend(plan);
  assert.ok(trend && 'd' in trend, 'a path');
  /* IN THE SAME BOX AS THE LINE: from x 0 to x 1000, and rising, so y falls. */
  const m = /^M0 ([\d.-]+) L1000 ([\d.-]+)$/u.exec(trend.d);
  assert.ok(m, trend.d);
  assert.ok(Number(m[1]) > 90 && Number(m[2]) < 10, 'from near the bottom to near the top');
});

test('twelve readings of seeded noise say there is no clear trend', () => {
  const noise = seeded(7, 12).map((r) => Math.round(100 + (r - 0.5) * 40));
  assert.deepEqual(linesTrend(linesPlan(chart(noise))), { said: 'No clear trend in 12 readings' });
  assert.equal(noTrendSaid(12), 'No clear trend in 12 readings');
});

test('the same value every time is no trend, and five readings say nothing', () => {
  assert.deepEqual(linesTrend(linesPlan(chart(Array(8).fill(40)))), { said: noTrendSaid(8) });
  assert.equal(linesTrend(linesPlan(chart([1, 2, 3, 4, 5]))), null);
  assert.equal(linesTrend(linesPlan([['Day', 'was: Weeks before'], ...[1, 2, 3, 4, 5, 6].map((v) => [`Week ${v}`, String(v)])])), null);
});

test('a gap is skipped: never a zero, and the path still ends at the last reading', () => {
  const values = [10, 12, null, 15, 16, 18, 19, null, 23, 24, 26, 27];
  const trend = linesTrend(linesPlan(chart(values)));
  assert.ok(trend && 'd' in trend);
  assert.match(trend.d, /^M0 [\d.-]+ L1000 [\d.-]+$/u);
  const zeroed = linesTrend(linesPlan(chart(values.map((v) => v ?? 0))));
  assert.ok(zeroed && 'd' in zeroed);
  assert.notEqual(trend.d, zeroed.d, 'a gap is not drawn as a zero');
  /* Ten readings with the two gaps left out, not twelve with two zeros: a zero there would read as noise. */
  const gapped = linesTrend(linesPlan(chart([10, null, 12, null, 13, null, 15, null, 16])));
  assert.equal(gapped, null, 'five readings among nine points are too few');
  /* A gap at the end: the line stops at the last point with a value. */
  const early = linesTrend(linesPlan(chart([10, 12, 13, 15, 16, 18, 19, null, null, null, null])));
  assert.ok(early && 'd' in early);
  assert.match(early.d, /L600 /u);
});

test('the trend is fitted to the current line, and placed between every line', () => {
  const now = [20, 22, 24, 26, 28, 30, 32, 34];
  const before = [0, 5, 40, 10, 50, 3, 45, 8];
  const trend = linesTrend(linesPlan(chart(now, before)));
  assert.ok(trend && 'd' in trend);
  /* Every line runs from 0 to 50, so 20 sits at y 60 and 34 at y 32. */
  assert.equal(trend.d, 'M0 60 L1000 32');
});
