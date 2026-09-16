import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SERIES_AHEAD, SERIES_PARTIAL, seriesPlan, seriesValue } from './series.ts';
import { figureLike } from './figure.ts';

const HEAD = ['Month', 'in: Money in', 'out: Money out', 'state'];

test('a gap is a gap and never a zero', () => {
  assert.equal(seriesValue(''), null);
  assert.equal(seriesValue('—'), null);
  assert.equal(seriesValue('£0.00'), 0);
  assert.equal(seriesValue('−£1,600.00'), 1600);
  const plan = seriesPlan([HEAD, ['Apr 2026', '£100.00', '', ''], ['May 2026', '', '', '']], true);
  assert.deepEqual(plan.buckets.map((b) => b.values), [['£100.00', '—'], ['—', '—']]);
  assert.equal(plan.buckets[1]!.net, '—');
  assert.equal(plan.bars.length, 1, 'no bar for a gap');
  assert.doesNotMatch(plan.netLine, /L/u, 'the net line breaks at the gap rather than reading zero');
});

test('in stands above the zero rule and out hangs under it, on one scale', () => {
  const plan = seriesPlan([HEAD, ['Apr', '£300.00', '£100.00', ''], ['May', '£100.00', '£300.00', 'partial']]);
  assert.equal(plan.zero, '50');
  const [upA, downA, upB, downB] = plan.bars;
  assert.deepEqual([upA!.dir, upA!.y, upA!.height], ['in', '0', '50']);
  assert.deepEqual([downA!.dir, downA!.y, downA!.height], ['out', '50', '16.67']);
  assert.equal(upB!.state, 'partial');
  assert.equal(downB!.height, '50');
  assert.equal(plan.top, '£300.00');
  assert.equal(plan.bottom, '−£300.00');
  assert.equal(plan.series[1]!.dir, 'out');
});

test('two series one way stack, and a bare header label is money in', () => {
  const plan = seriesPlan([['Q', 'Sales', 'Fees', 'out: Costs'], ['Q1', '10', '5', '3']]);
  assert.deepEqual(plan.series.map((s) => [s.dir, s.step]), [['in', 0], ['in', 1], ['out', 0]]);
  assert.equal(plan.bars[1]!.y, '0');
  assert.equal(plan.bars[0]!.y, String(Math.round((5 / 18) * 10000) / 100));
});

test('the net is in minus out, written like the cells, and the states are said', () => {
  const plan = seriesPlan([HEAD, ['Sep 2026', '£1,000.00', '£1,900.00', 'partial'], ['Oct 2026', '£2,000.00', '', 'ahead']], true);
  assert.deepEqual(plan.buckets.map((b) => b.net), ['−£900.00', '£2,000.00']);
  assert.deepEqual(plan.buckets.map((b) => b.said), [SERIES_PARTIAL, SERIES_AHEAD]);
  assert.equal(plan.buckets[0]!.short, 'Sep');
  assert.match(plan.sentence, /Sep 2026 so far, Money in £1,000.00, Money out £1,900.00, Net −£900.00/u);
  assert.equal((plan.netDots.match(/h0/gu) ?? []).length, 2);
});

test('nothing but gaps and zeroes is a sentence, not a chart', () => {
  assert.equal(seriesPlan([HEAD, ['Apr', '', '£0.00', '']]).empty, true);
  assert.equal(seriesPlan([HEAD]).empty, true);
});

test('a computed figure is written the way the host wrote its own', () => {
  assert.equal(figureLike('£34,850.00', -2000), '−£2,000.00');
  assert.equal(figureLike('−£1,600.00', 1234.5), '£1,234.50');
  assert.equal(figureLike('USD 12.00', -1234.567), 'USD −1,234.57');
  assert.equal(figureLike('GBP 4,800.00', 0), 'GBP 0.00');
  assert.equal(figureLike('1,200', 3400.4), '3,400');
  assert.equal(figureLike('no number', 12.5), '12.5');
});
