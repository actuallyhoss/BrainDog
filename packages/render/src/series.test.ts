import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SERIES_AHEAD, SERIES_DUE, SERIES_PARTIAL, amountLike, evenPlaces, seriesNice, seriesPlan, seriesValue } from './series.ts';
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

test('in stands above the zero rule and out hangs under it, on one scale that ends on round figures', () => {
  const plan = seriesPlan([HEAD, ['Apr', '£300.00', '£100.00', ''], ['May', '£100.00', '£300.00', 'partial']]);
  /* £300 each way is a round figure already, so the scale's lines say £300, £0 and −£300. */
  assert.equal(plan.zero, '50');
  const [upA, downA, upB, downB] = plan.bars;
  assert.deepEqual([upA!.dir, upA!.y, upA!.height], ['in', '0', '50']);
  assert.deepEqual([downA!.dir, downA!.y, downA!.height], ['out', '50', '16.67']);
  assert.equal(upB!.state, 'partial');
  assert.equal(downB!.height, '50');
  assert.equal(plan.top, '£300');
  assert.equal(plan.bottom, '−£300');
  assert.deepEqual(plan.ticks.map((t) => [t.y, t.label, t.zero]), [['0', '£300', false], ['50', '0', true], ['100', '−£300', false]]);
  assert.equal(plan.series[1]!.dir, 'out');
});

test('two series one way stack, and a bare header label is money in', () => {
  const plan = seriesPlan([['Q', 'Sales', 'Fees', 'out: Costs'], ['Q1', '10', '5', '3']]);
  assert.deepEqual(plan.series.map((s) => [s.dir, s.step]), [['in', 0], ['in', 1], ['out', 0]]);
  /* 15 up rounds to 20 and 3 down to 4, a scale of 24. */
  assert.equal(plan.bars[1]!.y, String(Math.round((5 / 24) * 10000) / 100));
  assert.equal(plan.bars[0]!.y, String(Math.round((10 / 24) * 10000) / 100));
  assert.deepEqual(plan.bars.map((b) => b.end), [false, true, true], 'the cap is on the top of the stack and the foot of what hangs');
});

test('THE SCALE ENDS ON A ROUND FIGURE, and a count keeps its middle line whole', () => {
  const nice = (v: number, whole = false): number => seriesNice(v, whole);
  assert.deepEqual([nice(2, true), nice(3, true), nice(1, true), nice(7, true)], [2, 4, 2, 8]);
  assert.deepEqual([nice(300), nice(4800), nice(1.2), nice(0)], [300, 5000, 2, 0]);
  /* A MIDDLE LINE PRINTS AS ITSELF: 25 halved is 12.5, printed 13 on a line at 12.5, so a count of 21 ends on 30. */
  assert.deepEqual([nice(21, true), nice(21), nice(2.1), nice(0.3)], [30, 30, 3, 0.4]);
  const run = seriesPlan([['Week', 'in: Done'], ['Week of 20 Jul', '1'], ['Week of 27 Jul', '0'], ['Week of 3 Aug', '2']]);
  assert.deepEqual(run.ticks.map((t) => t.label), ['2', '1', '0']);
});

test('FEWER THAN THREE BUCKETS ARE A FIGURE, NOT A CHART: each series is said as its total', () => {
  const two = seriesPlan([['Week', 'in: Done'], ['Week of 20 Jul', '1'], ['Week of 27 Jul', '2']]);
  assert.equal(two.empty, false);
  assert.equal(two.drawn, false);
  assert.deepEqual(two.totals, [{ label: 'Done', value: '3' }]);
  const gaps = seriesPlan([HEAD, ['Apr', '£300.00', '', ''], ['May', '', '', ''], ['Jun', '£100.00', '£50.00', '']]);
  assert.equal(gaps.drawn, false, 'a bucket of gaps is not a point');
  assert.deepEqual(gaps.totals.map((t) => t.value), ['£400.00', '£50.00']);
  assert.equal(seriesPlan([['Week', 'in: Done'], ['A', '1'], ['B', '0'], ['C', '2']]).drawn, true);
});

test('A TOTAL IS IN ONE UNIT: each series in its own cells, in whole minor units, and two currencies are never added', () => {
  const own = seriesPlan([['Month', 'in: Billed', 'in: Hours'], ['Jan', '£0.10', '3'], ['Feb', '£0.20', '4']]);
  assert.deepEqual(own.totals, [
    { label: 'Billed', value: '£0.30' },
    { label: 'Hours', value: '7' },
  ]);
  const two = seriesPlan([['Month', 'in: Money in', 'out: Money out'], ['Jan', '£1,200.00', '£300.00'], ['Feb', '€500.00', '£100.00']]);
  assert.deepEqual(two.totals, [{ label: 'Money out', value: '£400.00' }], 'pounds and euros have no total');
  assert.equal(two.drawn, true, 'a series with no total is drawn rather than dropped');
});

test('the net is in minus out, written like the cells, and the states are said', () => {
  const plan = seriesPlan([HEAD, ['Sep 2026', '£1,000.00', '£1,900.00', 'partial'], ['Oct 2026', '£2,000.00', '', 'ahead']], true);
  assert.deepEqual(plan.buckets.map((b) => b.net), ['−£900.00', '£2,000.00']);
  assert.deepEqual(plan.buckets.map((b) => b.said), [SERIES_PARTIAL, SERIES_AHEAD]);
  assert.equal(plan.buckets[0]!.short, 'Sep');
  assert.match(plan.sentence, /Sep 2026 so far, Money in £1,000.00, Money out £1,900.00, Net −£900.00/u);
  assert.equal((plan.netDots.match(/h0/gu) ?? []).length, 2);
});

test('the current bucket with money still due in it is marked due, on its bars and in words', () => {
  const plan = seriesPlan([HEAD, ['Sep 2026', '£1,500.00', '£900.00', 'due']]);
  assert.equal(plan.buckets[0]!.state, 'due');
  assert.equal(plan.buckets[0]!.said, SERIES_DUE);
  assert.ok(plan.bars.every((b) => b.state === 'due'));
  assert.match(plan.sentence, /Sep 2026 so far, and due, Money in £1,500.00/u);
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

test('a series of counts by week says each week by its day on a narrow chart, and its figures are counts', () => {
  const plan = seriesPlan([['Week', 'in: Done, then due', 'state'], ['Week of 20 Jul', '1', ''], ['Week of 7 Sep', '4', 'ahead']]);
  assert.deepEqual(plan.buckets.map((b) => b.short), ['20 Jul', '7 Sep'], 'each a new month, so each says it');
  assert.equal(plan.top, '4');
  const run = seriesPlan([['Week', 'in: Done'], ['Week of 20 Jul', '1'], ['Week of 27 Jul', '2'], ['Week of 3 Aug', '3'], ['Week of 10 Aug', '1']]);
  assert.deepEqual(run.buckets.map((b) => b.short), ['20 Jul', '27', '3 Aug', '10'], 'the month on the first tick and where it changes');
  assert.deepEqual(seriesPlan([['Month', 'in: Paid'], ['Sep 2026', '1'], ['Oct 2026', '2']]).buckets.map((b) => b.short), ['Sep', 'Oct'], 'a month is its name');
});

test('ONE TABLE SAYS ITS MONEY ONE WAY: a table of months is totals, so every amount in it is said whole', () => {
  /* SINCE 2 NOV (polish5, one rule a set): "£389.90" beside "£6,880" is "£390", half a unit rounding away from nought. */
  assert.deepEqual(evenPlaces(['£11,050', '£19,516.90', '−£8,466.90', '—']), ['£11,050', '£19,517', '−£8,467', '—']);
  /* ANOTHER CURRENCY IS ITS OWN FIGURE, and a count is no money at all. */
  assert.deepEqual(evenPlaces(['E£400', '£1.50', '12h']), ['E£400', '£2', '12h']);
});

test('A CELL DRAWN BY ITS SIGN ALONE IS READ BY ITS CURRENCY, never copied as a shape', () => {
  /* "$1,950" on a record kept in pounds is the US dollar, as the writer draws another currency. */
  assert.equal(amountLike('$1,950', 2400.5, 'GBP', 'exact'), '$2,400.50');
  assert.equal(amountLike('$1,950', 2400, 'GBP', 'read'), '$2,400');
  assert.equal(amountLike('£1,000', -250, 'GBP', 'exact'), '−£250.00');
  assert.equal(figureLike('$1,950', 2400, 'EGP', 'read'), '$2,400');
  /* A sign nobody owns keeps the shape it came in. */
  assert.equal(amountLike('E£400', 500, 'GBP', 'read'), 'E£500');
});
