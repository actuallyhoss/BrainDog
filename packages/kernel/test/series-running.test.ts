/**
 * A running line on a `series` block: each bar is what the figure read in its bucket and in every bucket before it, the
 * buckets before the chart's first too, so a plan paid in parts draws what was paid in all by each quarter.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { barsOf } from '../src/series.ts';
import type { MetricDecl } from '../src/metrics.ts';

const PAID: MetricDecl = {
  metric: 'paid-by-quarter',
  name: 'Paid by quarter',
  source: 'register.installments',
  value: { sum: 'amount' },
  group_by: 'due',
  bucket: 'quarter',
  format: 'money',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
};

/** A reading in pounds, one group a quarter, the clock in the fourth quarter of 2026. */
const reading = (groups: { key: string; value: number }[]) => () => ({ ok: true as const, value: { groups, current: '2026-Q4', unit: 'EGP' } });
const metric = (id: string) => (id === PAID.metric ? PAID : null);

test('each bar is the total so far, a quarter with nothing of its own stands at the total before it', () => {
  const read = reading([
    { key: '2025-Q1', value: 600 },
    { key: '2026-Q1', value: 100 },
    { key: '2026-Q3', value: 100 },
  ]);
  const got = barsOf([{ metric: PAID.metric, running: true }], 4, undefined, metric, read);
  assert.ok('bars' in got);
  /* THE QUARTERS BEFORE THE CHART ARE STILL IN IT: 600 paid in 2025 stands under every bar. */
  assert.deepEqual(got.bars.keys, ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
  assert.deepEqual(got.bars.values, [[700, 700, 800, 800]]);
  assert.equal(got.bars.unit, 'EGP');
});

test('without running a line draws each quarter alone, as it did', () => {
  const read = reading([{ key: '2026-Q1', value: 100 }, { key: '2026-Q3', value: 100 }]);
  const got = barsOf([{ metric: PAID.metric }], 4, undefined, metric, read);
  assert.ok('bars' in got);
  assert.deepEqual(got.bars.values, [[100, null, 100, null]]);
});

test('a running line before its first value is a gap, and the chart starts at it', () => {
  const read = reading([{ key: '2026-Q3', value: 250 }]);
  const got = barsOf([{ metric: PAID.metric, running: true }], 6, undefined, metric, read);
  assert.ok('bars' in got);
  assert.deepEqual(got.bars.keys, ['2026-Q3', '2026-Q4']);
  assert.deepEqual(got.bars.values, [[250, 250]]);
});

test('running takes no money due later, and is true or false', () => {
  const read = reading([]);
  const due = barsOf([{ metric: PAID.metric, running: true, then: PAID.metric }], 4, undefined, metric, read);
  assert.ok('refusal' in due);
  assert.equal(due.refusal.code, 'DECLARATION_INVALID');
  const odd = barsOf([{ metric: PAID.metric, running: 'yes' as never }], 4, undefined, metric, read);
  assert.ok('refusal' in odd);
});
