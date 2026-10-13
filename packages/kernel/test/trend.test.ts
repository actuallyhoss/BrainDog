/**
 * A measured trend over a bucketed figure: `trendOf(buckets, ahead)` answers compound growth with a band, or flat, and
 * the buckets ahead capped at ten times the last full one with the cap said (docs/32-PARITY.md, the `trend` row).
 *
 * WHAT WAS MEASURED BEFORE IT: nothing read a trend. `trend` was a published shape refused by name, so the money a
 * person took in each month could be drawn and never said to be growing, and no forecast of it was measured.
 *
 * WHAT WAS MEASURED BEFORE `steady`: one more every month, 1 2 3 up to 8, answered a growth of about a third a month
 * with a band clear of nought, and ran ahead compounding (13.0, 17.1 and 22.5 for the three months after 8). Sitting on
 * a line exactly answered a t of `Infinity`, which is written down as `null`.
 *
 * THE FITS ARE WORKED BY HAND. Six buckets sit at x = 0..5, so the mean of x is 2.5 and the spread of x about it is
 * 6.25 + 2.25 + 0.25 + 0.25 + 2.25 + 6.25 = 17.5. Each test says its own sums beside the numbers it asserts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TREND_BAND, TREND_CAP, TREND_POINTS, TREND_T_MOST, trendOf, type TrendBucket } from '../src/trend.ts';

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

/** Full buckets, a month each from January, one for each value. */
const full = (values: (number | null)[]): TrendBucket[] =>
  values.map((value, i) => ({ key: MONTHS[i]!, value, state: 'full' as const }));

const near = (got: number, want: number, say: string): void =>
  assert.ok(Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want)), `${say}: ${got} is not ${want}`);

function steady(t: ReturnType<typeof trendOf>) {
  assert.equal(t.kind, 'steady', JSON.stringify(t));
  if (t.kind !== 'steady') throw new Error('unreachable');
  return t;
}

function growth(t: ReturnType<typeof trendOf>) {
  assert.equal(t.kind, 'growth', JSON.stringify(t));
  if (t.kind !== 'growth') throw new Error('unreachable');
  return t;
}

/* Logs 1 2 2 3 4 4. Their mean is 16/6. The cross sum is -2.5 - 3 - 1 + 1.5 + 6 + 10 = 11, so the slope is 11/17.5.
   The spread of the logs is 50 - 256/6 = 22/3, the part the line leaves is 22/3 - 121/17.5, over four degrees of
   freedom, and the slope's error is the root of that over 17.5. t is about 8.12. */
const LOGS = [1, 2, 2, 3, 4, 4];
const SLOPE = 11 / 17.5;
const ERROR = Math.sqrt((22 / 3 - 121 / 17.5) / 4 / 17.5);

test('the numbers the gate stands on are the published ones', () => {
  assert.equal(TREND_POINTS, 6);
  assert.equal(TREND_BAND, 2.1);
  assert.equal(TREND_CAP, 10);
  assert.equal(TREND_T_MOST, 1e6);
});

test('six full buckets above nought with a sure slope answer growth, with its rate and its band', () => {
  const t = growth(trendOf(full(LOGS.map(Math.exp)), 0));
  assert.equal(t.n, 6);
  near(t.rate, Math.exp(SLOPE) - 1, 'rate');
  near(t.low, Math.exp(SLOPE - 2.1 * ERROR) - 1, 'low');
  near(t.high, Math.exp(SLOPE + 2.1 * ERROR) - 1, 'high');
  near(t.t, SLOPE / ERROR, 't');
  assert.ok(t.low > 0 && t.low < t.rate && t.rate < t.high, 'the band holds the rate and leaves nought out');
  assert.deepEqual(t.ahead, []);
  assert.equal(t.capped, false);
});

test('eight months each 5% above the last answer a rate of 5% and a band that is the rate', () => {
  const t = growth(trendOf(full([0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1000 * 1.05 ** i)), 0));
  assert.equal(t.n, 8);
  near(t.rate, 0.05, 'rate');
  assert.ok(Math.abs(t.low - 0.05) < 1e-9 && Math.abs(t.high - 0.05) < 1e-9, JSON.stringify(t));
});

test('a sure fall is said as a rate below nought, with the band below nought too', () => {
  const t = growth(trendOf(full([...LOGS].reverse().map(Math.exp)), 0));
  near(t.rate, Math.exp(-SLOPE) - 1, 'rate');
  assert.ok(t.low < t.rate && t.rate < t.high && t.high < 0, JSON.stringify(t));
});

test('fewer than six full buckets answer flat, and say it is too few', () => {
  assert.deepEqual(trendOf(full([100, 105, 110, 116, 122]), 3), { kind: 'flat', n: 5, why: 'few' });
  assert.deepEqual(trendOf([], 3), { kind: 'flat', n: 0, why: 'few' });
});

test('a bucket of nought or less answers flat, however sure the rest is', () => {
  assert.deepEqual(trendOf(full([1, 2, 4, 0, 16, 32, 64]), 2), { kind: 'flat', n: 7, why: 'nought' });
  assert.deepEqual(trendOf(full([1, 2, 4, -8, 16, 32]), 2), { kind: 'flat', n: 6, why: 'nought' });
});

test('a bucket with no single number, as two currencies give, answers flat', () => {
  assert.deepEqual(trendOf(full([1, 2, 4, null, 16, 32]), 2), { kind: 'flat', n: 6, why: 'nought' });
  assert.deepEqual(trendOf(full([1, 2, 4, Number.NaN, 16, 32]), 2), { kind: 'flat', n: 6, why: 'nought' });
});

/* Logs 1 3 1 3 1 3. The cross sum is -2.5 - 4.5 - 0.5 + 1.5 + 1.5 + 7.5 = 3, the slope 3/17.5, the spread of the logs
   60 - 54 = 6, and t comes to about 0.61. */
test('a slope the numbers cannot tell from nought answers flat', () => {
  assert.deepEqual(trendOf(full([1, 3, 1, 3, 1, 3].map(Math.exp)), 3), { kind: 'flat', n: 6, why: 'unsure' });
});

test('the same amount every month is flat, never a growth of nothing', () => {
  assert.deepEqual(trendOf(full([137.31, 137.31, 137.31, 137.31, 137.31, 137.31, 137.31]), 3), { kind: 'flat', n: 7, why: 'unsure' });
});

test('only full buckets are fitted: the unfinished month and the empty one are left out and keep their place', () => {
  const six = full(LOGS.map(Math.exp));
  const open: TrendBucket[] = [...six, { key: '2026-07', value: 1, state: 'partial' }];
  const t = growth(trendOf(open, 0));
  assert.equal(t.n, 6);
  near(t.rate, Math.exp(SLOPE) - 1, 'rate');

  /* 1 2 4 . 16 32 64: a month with nothing in it is not a nought, and the months after it stay a month further on. */
  const gap: TrendBucket[] = full([1, 2, 4, null, 16, 32, 64]);
  gap[3] = { key: '2026-04', value: 0, state: 'empty' };
  const g = growth(trendOf(gap, 0));
  assert.equal(g.n, 6);
  near(g.rate, 1, 'doubling');

  const five: TrendBucket[] = [...full([1, 2, 4, 8, 16]), { key: '2026-06', value: 32, state: 'partial' }];
  assert.deepEqual(trendOf(five, 1), { kind: 'flat', n: 5, why: 'few' });
});

/* 1 3 9 27 81 243: three times the month before, exactly. The line gives 729, 2187 and 6561 for the three months
   ahead, and ten times the last full month is 2430, so only the third is held. */
test('the buckets ahead follow the line, each held at ten times the last full bucket, and the hold is said', () => {
  const t = growth(trendOf(full([1, 3, 9, 27, 81, 243]), 3, 'month'));
  near(t.rate, 2, 'rate');
  assert.equal(t.ahead.length, 3);
  assert.deepEqual(t.ahead.map((a) => a.step), [1, 2, 3]);
  assert.deepEqual(t.ahead.map((a) => a.key), ['2026-07', '2026-08', '2026-09']);
  near(t.ahead[0]!.value, 729, 'one ahead');
  near(t.ahead[1]!.value, 2187, 'two ahead');
  assert.equal(t.ahead[2]!.value, 2430);
  assert.deepEqual(t.ahead.map((a) => a.capped), [false, false, true]);
  assert.equal(t.capped, true);
  assert.equal(t.cap, 2430);
});

test('nothing ahead reaches past the cap, and a bucket is marked whenever any of its three numbers was held', () => {
  /* The fit of LOGS has a wide band: its top passes ten times the last month before its middle does. */
  const t = growth(trendOf(full(LOGS.map(Math.exp)), 6));
  const cap = 10 * Math.exp(4);
  near(t.cap, cap, 'cap');
  for (const a of t.ahead) {
    assert.ok(a.low <= a.value && a.value <= a.high && a.high <= cap, JSON.stringify(a));
    const held = a.high === cap;
    assert.equal(a.capped, held, `step ${a.step} says ${a.capped} and its top is ${a.high}`);
  }
  const first = t.ahead.find((a) => a.capped)!;
  assert.ok(first.value < cap, 'the top of the band is held before the middle, and that is said too');
  assert.equal(t.ahead.at(-1)!.value, cap);
  assert.equal(t.capped, true);
});

test('a projection the cap never touched says so', () => {
  const t = growth(trendOf(full([0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1000 * 1.05 ** i)), 3, 'month'));
  assert.equal(t.capped, false);
  assert.deepEqual(t.ahead.map((a) => a.capped), [false, false, false]);
  near(t.ahead[2]!.value, 1000 * 1.05 ** 10, 'three ahead');
  assert.deepEqual(t.ahead.map((a) => a.key), ['2026-09', '2026-10', '2026-11']);
});

test('the first bucket ahead is the one after the last full bucket, so an unfinished month is projected, not skipped', () => {
  const open: TrendBucket[] = [...full([1, 3, 9, 27, 81, 243]), { key: '2026-07', value: 5, state: 'partial' }];
  const t = growth(trendOf(open, 1, 'month'));
  assert.equal(t.ahead[0]!.key, '2026-07');
  near(t.ahead[0]!.value, 729, 'the unfinished month');
});

test('with no bucket named the buckets ahead carry their step and no key', () => {
  const t = growth(trendOf(full([1, 3, 9, 27, 81, 243]), 2));
  assert.deepEqual(t.ahead.map((a) => 'key' in a), [false, false]);
});

test('an ahead that is no whole count of buckets is read as the whole part, and less than one as none', () => {
  const six = full([1, 3, 9, 27, 81, 243]);
  assert.equal(growth(trendOf(six, 2.9)).ahead.length, 2);
  assert.equal(growth(trendOf(six, -4)).ahead.length, 0);
  assert.equal(growth(trendOf(six, Number.NaN)).ahead.length, 0);
  assert.equal(growth(trendOf(six, Number.POSITIVE_INFINITY)).ahead.length, 0);
});

test('a fall is projected down and the cap does not bite it', () => {
  const t = growth(trendOf(full([243, 81, 27, 9, 3, 1]), 2));
  near(t.ahead[0]!.value, 1 / 3, 'one ahead');
  near(t.ahead[1]!.value, 1 / 9, 'two ahead');
  assert.equal(t.capped, false);
});

test('the buckets handed in are not changed', () => {
  const six = full([1, 3, 9, 27, 81, 243]);
  const before = JSON.stringify(six);
  trendOf(six, 3, 'month');
  assert.equal(JSON.stringify(six), before);
});

/* 1 2 3 4 5 6 7 8 at x = 0..7: the mean of x is 3.5 and its spread 42. The amounts sit on a straight line exactly, so
   it explains all of their spread, and the curve through their logarithms (0, 0.69, 1.10 ... 2.08) cannot. */
test('one more every month is steady, by one a month, and runs ahead on the straight line', () => {
  const t = steady(trendOf(full([1, 2, 3, 4, 5, 6, 7, 8]), 3, 'month'));
  assert.equal(t.n, 8);
  near(t.step, 1, 'step');
  near(t.low, 1, 'low');
  near(t.high, 1, 'high');
  assert.deepEqual(t.ahead.map((a) => a.key), ['2026-09', '2026-10', '2026-11']);
  [9, 10, 11].forEach((want, i) => near(t.ahead[i]!.value, want, `${i + 1} ahead`));
  assert.equal(t.capped, false);
  assert.equal(t.cap, 80);
});

test('t is a number that can be written down, on an exact fit of either line and either way', () => {
  const lines = [
    trendOf(full([1, 2, 3, 4, 5, 6, 7, 8]), 2),
    trendOf(full([8, 7, 6, 5, 4, 3, 2, 1]), 2),
    trendOf(full([1, 3, 9, 27, 81, 243]), 2),
    trendOf(full([243, 81, 27, 9, 3, 1]), 2),
    trendOf(full([0, 1, 2, 3, 4, 5, 6, 7].map((i) => 1000 * 1.05 ** i)), 2),
  ];
  assert.deepEqual(lines.map((t) => (t.kind === 'flat' ? null : t.t)), [TREND_T_MOST, -TREND_T_MOST, TREND_T_MOST, -TREND_T_MOST, TREND_T_MOST]);
  for (const t of lines) assert.deepEqual(JSON.parse(JSON.stringify(t)), t, 'it comes back from being written down whole');
});

/* 100 205 290 410 500 595. From the first they are 0 105 190 310 400 495, mean 250. The cross sum is
   625 + 217.5 + 30 + 30 + 225 + 612.5 = 1740, so the step is 1740/17.5, about 99.43. The line reads the last month as
   100 + (250 - 2.5 x 1740/17.5) + 5 x 1740/17.5 = 598.57, and the month after as 698 exactly. */
test('about the same amount more each month is steady, with a band about the step that leaves nought out', () => {
  const t = steady(trendOf(full([100, 205, 290, 410, 500, 595]), 2));
  near(t.step, 1740 / 17.5, 'step');
  assert.ok(0 < t.low && t.low < t.step && t.step < t.high, JSON.stringify(t));
  assert.ok(Math.abs(t.t) >= TREND_BAND && t.t < TREND_T_MOST, `t is ${t.t}`);
  near(t.ahead[0]!.value, 698, 'one ahead');
  near(t.ahead[1]!.value, 698 + 1740 / 17.5, 'two ahead');
  for (const a of t.ahead) assert.ok(a.low < a.value && a.value < a.high, JSON.stringify(a));
});

test('a steady fall stops at nought, and the stop is said', () => {
  const t = steady(trendOf(full([8, 7, 6, 5, 4, 3, 2, 1]), 3));
  near(t.step, -1, 'step');
  assert.deepEqual(t.ahead.map((a) => a.value), [0, 0, 0]);
  /* The line reads nought for the first month ahead, which is no hold. The two after it read below nought. */
  assert.deepEqual(t.ahead.map((a) => a.capped), [false, true, true]);
  assert.equal(t.capped, true);
});

test('the same share each month stays growth: the straight line explains less of it than the curve', () => {
  assert.equal(trendOf(full([1, 3, 9, 27, 81, 243]), 0).kind, 'growth');
  assert.equal(trendOf(full([1000, 1050, 1103, 1158, 1216, 1276, 1340, 1407]), 0).kind, 'growth');
  assert.equal(trendOf(full(LOGS.map(Math.exp)), 0).kind, 'growth');
});
