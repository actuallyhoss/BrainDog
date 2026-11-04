/**
 * Everyday spending in a forecast: the record walks a week's share of it every seventh day (`kind: 'everyday'` in the
 * kernel's walk, each step named "Everyday spending"), and sends what it measured on a `spent` row whose third cell
 * names the months (`2026-07..2026-09`). The list of movements says it in one line, the spend control moves it up or
 * down from no change, and a walk with no `spent` row reads as it always did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORECAST_EVERYDAY,
  FORECAST_SPEND,
  FORECAST_SPEND_MEASURED,
  FORECAST_SPEND_NOTE,
  baseKnobs,
  forecastEveryday,
  forecastModel,
  forecastPerMonth,
  forecastPlan,
  listedSteps,
  scenario,
  shortDay,
  shortMonth,
  spendRange,
  spendSaid,
} from './forecast.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';

const TODAY = '2026-10-14';
/** A week's share of E£41,200 a month, as the kernel moves it: twelve months over fifty-two weeks. */
const WEEK = 'EGP −9,507.69';

/** Thirteen weeks of everyday spending from today, and the rent on the first of each month. */
const weeks = (from = TODAY, n = 13): string[][] =>
  Array.from({ length: n }, (_, i) => ['step', new Date(Date.parse(`${from}T12:00:00Z`) + (i + 1) * 7 * 86_400_000).toISOString().slice(0, 10), FORECAST_EVERYDAY, WEEK]);

const rowsOf = (spent: string[] | null, opening = 'EGP 200,000.00', today = TODAY): string[][] => [
  ['opening', today, 'Cash now', opening],
  ['home', 'EGP', '', ''],
  ...(spent ? [spent] : []),
  ...weeks(today),
  ['step', '2026-11-01', 'Rent', 'EGP −20,000.00'],
  ['step', '2026-12-01', 'Rent', 'EGP −20,000.00'],
  ['horizon', '91', '', ''],
  ['knobs', 'horizon spend count', '', ''],
];

const MEASURED = ['spent', '3', '2026-07..2026-09', 'EGP 41,200.00'];
/** Words with the space that joins a code to its figure read as a plain one. */
const plain = (t: string): string => t.replaceAll('\u00a0', ' ');
const said = (rows: string[][]): string => {
  const m = forecastModel(rows)!;
  return plain(forecastEveryday(m, scenario(m, baseKnobs(m))));
};

test('THE SPENT ROW\'S THIRD CELL IS THE MONTHS MEASURED, and anything else there is no months at all', () => {
  assert.deepEqual(forecastModel(rowsOf(MEASURED))!.measured, { from: '2026-07', to: '2026-09' });
  for (const cell of ['', '2026-09..2026-07', '2026-13..2026-14', 'Jul to Sep', '2026-07..2026-08..2026-09']) {
    assert.equal(forecastModel(rowsOf(['spent', '3', cell, 'EGP 41,200.00']))!.measured, null, `"${cell}"`);
  }
  assert.equal(forecastModel(rowsOf(null))!.measured, null, 'no spent row, no months');
  /* MONTHS BESIDE AN AMOUNT THE WALK CANNOT READ say how nothing was measured, so they are not read either. */
  assert.equal(forecastModel(rowsOf(['spent', '3', '2026-07..2026-09', 'USD 900.00']))!.measured, null);
});

test('THE WEEKLY SHARES ARE ONE LINE OF EVERY MOVEMENT, the months said in the reader\'s words', () => {
  assert.equal(said(rowsOf(MEASURED)), 'Everyday spending, measured from Jul to Sep: EGP 41,200 a month');
  assert.equal(said(rowsOf(['spent', '3', '', 'EGP 41,200.00'])), 'Everyday spending: EGP 41,200 a month', 'no months, no measure said');
  assert.equal(said(rowsOf(['spent', '1', '2026-09..2026-09', 'EGP 41,200.00'])), 'Everyday spending, measured in Sep: EGP 41,200 a month');
  /* A YEAR IS WRITTEN WHERE IT IS NOT THIS ONE, and only there. */
  assert.equal(said(rowsOf(['spent', '3', '2025-11..2026-01', 'EGP 41,200.00'])), 'Everyday spending, measured from Nov 2025 to Jan: EGP 41,200 a month');
  assert.equal(shortMonth('2026-12', '2027-01-05'), 'Dec 2026');
  assert.equal(shortMonth('2027-01', '2027-01-05'), 'Jan');
  /* WITH NO SPENT ROW THE LINE IS STILL ONE, its amount the walk's own weekly shares said a month. */
  assert.equal(said(rowsOf(null)), 'Everyday spending: EGP 41,200 a month');
});

test('THE TABLE LISTS EVERY BILL AND ONE EVERYDAY LINE, and the balances still carry every week', () => {
  const m = forecastModel(rowsOf(MEASURED))!;
  const shown = scenario(m, baseKnobs(m));
  assert.equal(shown.steps.filter((s) => s.label === FORECAST_EVERYDAY).length, 13, 'the walk moves every week');
  assert.deepEqual(listedSteps(shown.steps).map((s) => s.label), ['Rent', 'Rent']);
  const html = toHTML(parse('```forecast\n' + rowsOf(MEASURED).map((r) => r.join(' | ')).join('\n') + '\n```', { page: true }));
  const table = plain(/<table class="forecast-table">[\s\S]*?<\/table>/u.exec(html)?.[0] ?? '');
  assert.equal(table.match(/data-everyday=""/gu)?.length, 1, 'one line');
  assert.match(table, /<td colspan="4">Everyday spending, measured from Jul to Sep: EGP 41,200 a month<\/td>/u);
  assert.doesNotMatch(table, /<td>Everyday spending<\/td>/u, 'no row a week');
  /* THE FIRST RENT FALLS AFTER TWO WEEKS OF SPENDING, and its balance says so. */
  const rent = listedSteps(shown.steps)[0]!;
  assert.equal(rent.balance, 200_000 - 2 * 9_507.69 - 20_000);
});

test('A WALK THAT MOVES NO EVERYDAY SPENDING HAS NO LINE, whatever the spent row says', () => {
  const rows = rowsOf(MEASURED).filter((r) => r[2] !== FORECAST_EVERYDAY);
  assert.equal(said(rows), '');
  assert.doesNotMatch(toHTML(parse('```forecast\n' + rows.map((r) => r.join(' | ')).join('\n') + '\n```', { page: true })), /data-everyday/u);
});

test('WITH A SPENT ROW THE CONTROL MOVES WHAT WAS MEASURED, from none of it to twice it, opening on no change', () => {
  const m = forecastModel(rowsOf(MEASURED))!;
  const r = spendRange(m);
  assert.equal(r.name, FORECAST_SPEND_MEASURED);
  assert.equal(plain(r.note), 'Everyday spending, measured from Jul to Sep: EGP 41,200 a month');
  assert.equal(r.measured, 41_200);
  assert.equal(r.min, -r.max, 'as far down as up');
  assert.ok(r.max <= 41_200 && r.max > 41_200 - r.step, `to the measured amount in whole steps: ${r.max} by ${r.step}`);
  assert.equal(r.max % r.step, 0, 'no change is a stop');
  assert.equal(baseKnobs(m).spend, 0, 'it opens on no change');
  assert.equal(spendSaid(r, 0, 'EGP 0'), 'No change');
  assert.equal(spendSaid(r, 2_000, 'EGP 2,000'), 'EGP 2,000 more a month');
  assert.equal(spendSaid(r, -2_000, 'EGP 2,000'), 'EGP 2,000 less a month');
  assert.equal(spendRange(m, 'EGP').name, 'Spend more or less each month, in Egyptian pound');
  /* SPENDING NONE OF IT TAKES THE WEEKLY SHARES BACK, a month at a time, and the walk ends higher. */
  const base = scenario(m, baseKnobs(m));
  const less = scenario(m, { ...baseKnobs(m), spend: r.min });
  assert.ok(less.days.at(-1)!.balance > base.days.at(-1)!.balance);
  assert.ok(Math.abs(less.days.at(-1)!.balance - base.days.at(-1)!.balance - 40_000 * (91 / 30.4375)) < 0.01);
});

test('A WALK WITH NO SPENT ROW KEEPS TODAY\'S CONTROL AND WORDS', () => {
  const m = forecastModel(rowsOf(null))!;
  const r = spendRange(m);
  assert.equal(r.min, 0);
  assert.equal(r.name, FORECAST_SPEND);
  assert.equal(r.note, FORECAST_SPEND_NOTE);
  assert.equal(r.measured, null);
  assert.equal(spendSaid(r, 0, 'EGP 0'), forecastPerMonth('EGP 0'));
});

test('A DAY IN ANOTHER YEAR CARRIES ITS YEAR in the sentence over the chart, and a day this year does not', () => {
  assert.equal(shortDay('2027-01-02', TODAY), '2 Jan 2027');
  assert.equal(shortDay('2026-11-02', TODAY), '2 Nov');
  assert.equal(shortDay('2027-01-02'), '2 Jan', 'with no today it is said as before');
  /* E£60,000 lasts into January under the rent and the weeks: the crossing is next year, and the sentence says so. */
  const m = forecastModel(rowsOf(MEASURED, 'EGP 60,000.00'))!;
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.match(plan.said, /^Goes under on \d+ (Nov|Dec)$/u, plan.said);
  const year = forecastModel(rowsOf(MEASURED, 'EGP 900,000.00').map((r) => (r[0] === 'horizon' ? ['horizon', '120', '', ''] : r)))!;
  assert.equal(forecastPlan(year, scenario(year, baseKnobs(year)), null).said, 'Stays above zero to 11 Feb 2027, as far as the chart goes');
});

test('THE DANGER TINT IS ONLY THE PART UNDER ZERO: a walk that never goes under draws none of it', () => {
  const up = forecastModel(rowsOf(MEASURED))!;
  assert.equal(forecastPlan(up, scenario(up, baseKnobs(up)), null).below, '');
  const down = forecastModel(rowsOf(MEASURED, 'EGP 60,000.00'))!;
  const plan = forecastPlan(down, scenario(down, baseKnobs(down)), null);
  assert.notEqual(plan.below, '', 'the part under zero is its own path');
  const html = toHTML(parse('```forecast\n' + rowsOf(MEASURED, 'EGP 60,000.00').map((r) => r.join(' | ')).join('\n') + '\n```', { page: true }));
  /* THE PATH, as the summary's figure of the cash at the end also says it is under (`data-below`, ffa04ea78). */
  assert.equal(html.match(/<path class="forecast-area" data-below=""/gu)?.length, 1, 'one tinted part');
  assert.doesNotMatch(html, /danger/u, 'the line and the sentence wear no danger of their own');
});
