/**
 * Money on a chart: a bar's value grouped (`£11,200`, never `11200`) and an axis label compact (`£31k`),
 * each keeping the unit and the sign the figure was written with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { axisFigure, barFigure, money, symbolFigure, wholeFigure } from './format.ts';
import { linesPlan } from './lines.ts';
import { writeAmount } from './money.ts';
import { progressLeft, progressOver, progressPlan, progressToGo, rangePlan } from './progress.ts';
import { ringPlan } from './ring.ts';
import { seriesPlan } from './series.ts';
import { tableCellBody } from './table.ts';

test('A BAR\'S VALUE IS GROUPED, and a zero minor part is dropped while any other is kept', () => {
  assert.equal(barFigure('11200'), '11,200');
  assert.equal(barFigure('£11,200.00'), '£11,200');
  assert.equal(barFigure('£11200.50'), '£11,200.50');
  assert.equal(barFigure(money(1_120_000, 'GBP')), 'GBP 11,200');
  assert.equal(barFigure('$4,800.00 USD'), '$4,800', 'one mark of currency, never a symbol and its code');
  assert.equal(barFigure('−£39.00'), '−£39');
  assert.equal(barFigure('+£850.00'), '+£850');
  // A hyphen is the minus it stands for.
  assert.equal(barFigure('-11200'), '−11,200');
  // A figure too large for a float keeps every digit.
  assert.equal(barFigure('12345678901234567890'), '12,345,678,901,234,567,890');
});

test('AN AXIS LABEL IS COMPACT, in the unit the figure was written in', () => {
  assert.equal(axisFigure('£31,240.55'), '£31k');
  assert.equal(axisFigure('£4,200.00'), '£4.2k');
  assert.equal(axisFigure('−£1,600.00'), '−£1.6k');
  assert.equal(axisFigure(money(-160_000, 'GBP')), 'GBP −1.6k');
  assert.equal(axisFigure(symbolFigure(money(250_000_000, 'USD')) ?? ''), '$2.5m');
  assert.equal(axisFigure('CHF 58,185.54'), 'CHF 58k');
  assert.equal(axisFigure('£850.40'), '£850');
  assert.equal(axisFigure('4'), '4');
  assert.equal(axisFigure('3200000000'), '3.2bn');
});

test('THE STEP IS CHOSEN AFTER THE ROUNDING, so no label says a thousand of a step', () => {
  assert.equal(axisFigure('£999.60'), '£1k');
  assert.equal(axisFigure('£999,700.00'), '£1m');
  assert.equal(axisFigure('£9,960.00'), '£10k');
  // Rounded to nothing, the sign goes with it.
  assert.equal(axisFigure('−£0.04'), '£0');
});

test('TEXT THAT IS NOT ONE FIGURE COMES BACK AS IT WAS WRITTEN', () => {
  for (const text of ['', 'Q3', 'about 11200', '12%', '1,2345', '−GBP −5.00', '11 200', 'n/a']) {
    assert.equal(barFigure(text), text, `bar: ${text}`);
    assert.equal(axisFigure(text), text, `axis: ${text}`);
  }
});

/* ---- The one writer, once the host says the record's home currency -------------------------------- */

const NB = ' ';
const SERIES_HEAD = ['Month', 'in: Money in', 'out: Money out'];
/** What the one writer says, so these tests hold the charts to it and not to a spelling of their own. */
const said = (minor: number, currency: string, home: string | null, setting: 'exact' | 'read' | 'axis'): string =>
  writeAmount({ minor, currency }, home, setting)!.text;
const series = (currency: string) => [
  SERIES_HEAD,
  ['Jul 2026', money(800_000_000, currency), money(120_000_000, currency)],
  ['Aug 2026', money(650_000_000, currency), money(400_000_000, currency)],
  ['Sep 2026', money(710_000_000, currency), money(390_000_000, currency)],
];

test('WITH A HOME CURRENCY, AN AXIS IS COMPACT IN THE HOME SIGN: £8m, and what goes out takes a true minus', () => {
  const plan = seriesPlan(series('GBP'), true, 'GBP');
  assert.equal(plan.top, '£8m');
  assert.equal(plan.bottom, '−£4m');
  assert.deepEqual(plan.ticks.map((t) => t.label), ['£8m', '£0', '−£4m'], 'a money axis names its nought with the currency');
  assert.equal(plan.buckets[0]!.net, '£6,800,000', 'a table of months is totals, so a net is whole');
  assert.deepEqual(plan.totals.map((t) => t.value), ['£21,600,000', '£9,100,000']);
  /* The same figures on a record whose home is another currency, or none, say which currency they are in by its own sign. */
  assert.equal(seriesPlan(series('GBP'), true, 'EGP').top, '£8m');
  assert.equal(seriesPlan(series('GBP'), true, null).bottom, '−£4m');
});

test('A HOME OF EGYPTIAN POUNDS READS AS THE WRITER WRITES IT, compact on the axis and never a second way', () => {
  const plan = seriesPlan(series('EGP'), true, 'EGP');
  assert.equal(plan.top, said(800_000_000, 'EGP', 'EGP', 'axis'));
  assert.match(plan.top, /8m$/u);
  assert.equal(plan.bottom, said(-400_000_000, 'EGP', 'EGP', 'axis'));
  assert.equal(plan.bottom.codePointAt(0), 0x2212, 'a true minus in front, never a hyphen');
  assert.deepEqual(plan.ticks.map((t) => t.label), [800_000_000, 0, -400_000_000].map((m) => said(m, 'EGP', 'EGP', 'axis')));
  assert.equal(plan.buckets[1]!.net, wholeFigure(said(250_000_000, 'EGP', 'EGP', 'exact')));
});

test('A LINE CHART\'S AXIS THE SAME, and a currency with no sign keeps its code in front', () => {
  const gbp = linesPlan([['Day', 'Balance'], ['1 Sep', money(3_124_055, 'GBP')], ['2 Sep', money(-160_000, 'GBP')], ['3 Sep', money(420_000, 'GBP')]], 'GBP');
  assert.equal(gbp.top, '£31k');
  assert.equal(gbp.bottom, '−£1.6k');
  const chf = linesPlan([['Day', 'Balance'], ['1 Sep', money(5_818_554, 'CHF')], ['2 Sep', money(-120_000, 'CHF')], ['3 Sep', money(0, 'CHF')]], 'EGP');
  assert.equal(chf.top, `CHF${NB}58k`);
  assert.equal(chf.bottom, `−CHF${NB}1.2k`);
  const usd = linesPlan([['Day', 'Balance'], ['1 Sep', money(250_000_000, 'USD')], ['2 Sep', money(100_000, 'USD')], ['3 Sep', money(0, 'USD')]], 'EGP');
  assert.equal(usd.top, '$2.5m');
});

test('WHAT IS LEFT, A TOTAL AND A DIAL\'S CENTRE ARE AMOUNTS: never compact, a fraction of zeros dropped', () => {
  const [goal] = progressPlan([{ value: money(120_000, 'GBP'), target: money(300_000, 'GBP') }], 'goal', 'GBP');
  assert.equal(goal!.left, progressToGo('£1,800'));
  const [over] = progressPlan([{ value: money(394_795, 'USD'), target: money(100_000, 'USD') }], 'budget', 'EGP');
  assert.equal(over!.left, progressOver('$2,947.95'));
  const [egp] = progressPlan([{ value: money(120_000, 'EGP'), target: money(300_000, 'EGP') }], 'budget', 'EGP');
  assert.equal(egp!.left, progressLeft(said(180_000, 'EGP', 'EGP', 'read')));
  const range = rangePlan([
    { spent: money(1_200_000, 'GBP'), low: money(1_000_000, 'GBP'), high: money(1_500_000, 'GBP') },
    { spent: money(49_726, 'GBP'), low: money(40_000, 'GBP'), high: money(60_000, 'GBP') },
  ], 'GBP');
  assert.deepEqual(range.total, { spent: '£12,497.26', low: '£10,400', high: '£15,600' });
  const ring = ringPlan([{ label: 'Rent', value: money(1_200_000, 'GBP'), third: '' }, { label: 'Food', value: money(49_726, 'GBP'), third: '' }], 'GBP');
  assert.equal(ring.centre, '£12,497.26');
  const one = ringPlan([{ label: 'Holiday', value: money(120_000, 'GBP'), third: money(300_000, 'GBP') }], 'GBP');
  assert.equal(one.left, progressToGo('£1,800'));
});

test('A TABLE CELL OF MONEY IS READ ONCE AND WRITTEN ONCE: the home by its sign, another by its own sign', () => {
  const cell = (text: string, home: string | null = 'GBP') => tableCellBody(text, home).body;
  const usd = cell(money(294_795, 'USD'));
  assert.equal(usd.kind === 'symbol' && usd.text, '$2,947.95');
  assert.equal(usd.kind === 'symbol' && usd.amount?.codePlace, null);
  assert.deepEqual(cell(money(294_795, 'USD'), 'EGP'), usd, 'the dollar reads the same on a record kept in Egyptian pounds');
  const home = cell(money(5_818_500, 'GBP'));
  assert.equal(home.kind === 'symbol' && home.text, '£58,185.00', 'a table is exact: every minor unit');
  const owed = cell(money(-7_361_527, 'GBP'));
  assert.equal(owed.kind === 'symbol' && owed.text, '−£73,615.27');
  assert.equal(owed.kind === 'symbol' && owed.text.codePointAt(0), 0x2212, 'a true minus, never a hyphen');
  /* No sign of its own: the code leads, and the minus stands in front of the code. */
  assert.deepEqual(cell(money(-120_000, 'CHF')), { kind: 'coded', sign: '−', currency: 'CHF', rest: '1,200.00', amount: writeAmount({ minor: -120_000, currency: 'CHF' }, 'GBP', 'exact') });
  /* No home told: every currency is written as another's. */
  assert.equal((cell(money(129_900, 'GBP'), null) as { text: string }).text, '£1,299.00');
  /* The Egyptian pound, home or not, is whatever the writer writes, in the kind a drawer already draws. */
  for (const h of ['EGP', 'GBP', null]) {
    const written = writeAmount({ minor: -7_361_527, currency: 'EGP' }, h, 'exact')!;
    const body = cell(money(-7_361_527, 'EGP'), h);
    const drawn = body.kind === 'coded' ? `${body.sign}${body.currency}${NB}${body.rest}` : body.kind === 'symbol' ? body.text : '';
    assert.equal(drawn, written.text, `home ${h}`);
    assert.equal(drawn.codePointAt(0), 0x2212);
  }
  /* The working dot is still taken off the front first. */
  assert.equal(tableCellBody(`● ${money(100, 'GBP')}`, 'GBP').working, tableCellBody(`● ${money(100, 'GBP')}`).working);
});

test('A CELL THAT IS NOT STORED MONEY IS LEFT ALONE, and so is every caller that names no home', () => {
  for (const text of ['Q3', '12%', 'E£1,299', '$31k', 'EGP 1,299', '1,299.00', 'THE 100', 'about EGP 1,299.00']) {
    assert.deepEqual(tableCellBody(text, 'EGP').body, tableCellBody(text).body, text);
  }
  /* MONEY COMING IN, WRITTEN WITH ITS PLUS, is one whole figure and the writer's too (`writeFigure`): the plus stays in
     front of everything, where a minus stands. A caller that names no home still leaves it as it came. */
  assert.equal((tableCellBody('+GBP 850.00', 'EGP').body as { text: string }).text, '+£850.00');
  assert.equal((tableCellBody('+GBP 850.00', 'GBP').body as { text: string }).text, '+£850.00');
  assert.deepEqual(tableCellBody('+GBP 850.00').body, { kind: 'symbol', text: '+£850.00' });
  assert.deepEqual(tableCellBody(money(129_900, 'GBP')).body, { kind: 'symbol', text: '£1,299.00' });
  /* Hours and counts are not money: the writer does not touch them. */
  const hours = [['Week', 'Hours'], ['W1', '12h'], ['W2', '31h'], ['W3', '40h']];
  assert.deepEqual(seriesPlan(hours, false, 'EGP'), seriesPlan(hours));
  const drawn = [SERIES_HEAD, ['Apr', '£300.00', '£100.00'], ['May', '£100.00', '£300.00']];
  assert.equal(seriesPlan(drawn).top, '£300');
  /* A FIGURE DRAWN BY ITS SIGN ALONE IS READ BY ITS CURRENCY SINCE f0cee160e, so told the home its total is a total, said
     as one. Nothing else of the plan moves. */
  const told = seriesPlan(drawn, false, 'GBP');
  const untold = seriesPlan(drawn);
  assert.deepEqual(told.totals.map((t) => t.value), ['£400', '£400']);
  assert.deepEqual(untold.totals.map((t) => t.value), ['£400.00', '£400.00']);
  assert.deepEqual({ ...told, totals: [] }, { ...untold, totals: [] }, 'nothing else of the plan moves');
  const count = [{ label: 'Bike', value: '3', third: '7' }];
  assert.deepEqual(ringPlan(count, 'GBP'), ringPlan(count));
});

test('A RING TOWARD A TARGET IN ANOTHER CURRENCY SAYS NOTHING IS LEFT: one currency is never taken from another', () => {
  const mixed = ringPlan([{ label: 'Fund', value: money(294_795, 'USD'), third: money(70_231_800, 'EGP') }], 'EGP');
  assert.equal(mixed.left, '');
  const one = ringPlan([{ label: 'Fund', value: money(294_795, 'EGP'), third: money(70_231_800, 'EGP') }], 'EGP');
  assert.equal(one.left, `EGP${NB}699,370.05 to go`);
});
