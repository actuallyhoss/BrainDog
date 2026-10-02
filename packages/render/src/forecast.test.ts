import { test } from 'node:test';
import assert from 'node:assert/strict';

import { against, baseKnobs, countsOf, forecastAverage, forecastModel, forecastPlan, horizonChoices, knobsIn, knobsMoved, largest, pairsOf, readoutAt, scenario, streamsOf, underNote, type ForecastModel } from './forecast.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';

const ROWS = [
  ['opening', '2026-09-17', 'Cash now', '£1,000.00'],
  ['past', '2026-09-14', '', '£700.00'],
  ['past', '2026-09-16', '', '£900.00'],
  ['step', '2026-09-19', 'Invoice', '£500.00'],
  ['step', '2026-09-20', 'Tax', '−£1,200.00'],
  ['step', '2026-10-20', 'Tax', '−£1,200.00'],
  ['step', '2026-12-30', 'Late one', '−£50.00'],
  ['horizon', '60', '', ''],
  ['knobs', 'horizon late spend leave', '', ''],
];

const model = (): ForecastModel => forecastModel(ROWS)!;

test('the rows become a model, and a walk with no opening is no model', () => {
  const m = model();
  assert.equal(m.today, '2026-09-17');
  assert.equal(m.opening, 1000);
  assert.equal(m.horizon, 60);
  assert.deepEqual(m.knobs, ['horizon', 'late', 'spend', 'leave']);
  assert.deepEqual(m.past.map((p) => p.value), [700, 900]);
  assert.equal(m.steps.length, 4);
  assert.equal(forecastModel([['step', '2026-09-19', 'x', '£1.00']]), null);
  assert.equal(m.lateName, null, 'no name sent, the renderer says its own');
  assert.equal(forecastModel([...ROWS, ['late', '3', 'Pay comes in late by', '']])!.lateName, 'Pay comes in late by');
  assert.equal(forecastModel([...ROWS, ['late', '', 'Pay comes in late by', '']])!.late, null, 'a name with no reading marks nothing');
});

test('the baseline walks the steps day by day, and says where it goes under and its lowest', () => {
  const s = scenario(model(), baseKnobs(model()));
  assert.equal(s.days.length, 61);
  assert.equal(s.days[2]!.balance, 1500);
  assert.equal(s.days[3]!.balance, 300);
  assert.equal(s.crossed?.day, '2026-10-20');
  assert.equal(s.crossed?.balance, -900);
  assert.equal(s.steps.at(-1)!.day, '2026-10-20', 'a step past the horizon is not walked');
  assert.equal(s.lowest.balance, -900);
});

test('clients paying late move every incoming step and nothing going out', () => {
  const s = scenario(model(), { ...baseKnobs(model()), late: 10 });
  assert.equal(s.steps.find((x) => x.label === 'Invoice')!.day, '2026-09-29');
  assert.equal(s.steps.find((x) => x.label === 'Tax')!.day, '2026-09-20');
  assert.equal(s.crossed?.day, '2026-09-20');
  assert.equal(s.crossed?.balance, -200);
});

test('spending the record does not know takes a little every day', () => {
  const s = scenario(model(), { ...baseKnobs(model()), spend: 304.375 });
  assert.equal(s.days[0]!.balance, 1000);
  assert.equal(s.days[10]!.balance, 1000 + 500 - 1200 - 100);
});

test('leaving a movement out leaves every occurrence of it out, and the horizon cuts the walk', () => {
  const m = model();
  const s = scenario(m, { ...baseKnobs(m), leave: ['Tax'] });
  assert.equal(s.crossed, null);
  assert.ok(s.steps.every((x) => x.label !== 'Tax'));
  const short = scenario(m, { ...baseKnobs(m), horizon: 2 });
  assert.equal(short.days.length, 3);
  assert.equal(scenario(m, { ...baseKnobs(m), horizon: 400 }).horizon, 60, 'never past the declared horizon');
  assert.equal(knobsMoved(m, baseKnobs(m)), false);
  assert.equal(knobsMoved(m, { ...baseKnobs(m), late: 5 }), true);
});

test('the comparison with the baseline is said in words', () => {
  const m = model();
  const base = scenario(m, baseKnobs(m));
  assert.equal(against(base, base, false), '');
  assert.equal(against(base, scenario(m, { ...baseKnobs(m), leave: ['Tax'] }), true), 'No longer goes under');
  const sooner = scenario(m, { ...baseKnobs(m), spend: 20_000 });
  assert.match(against(base, sooner, true), /^\d+ days? sooner than before$/u);
});

test('the horizon offers what fits, and the heaviest movements are summed by label', () => {
  assert.deepEqual(horizonChoices(model()), [], 'a two-month walk has no three-month choice');
  assert.deepEqual(horizonChoices({ ...model(), horizon: 180 }), [
    { days: 91, label: '3 months' },
    { days: 180, label: '6 months' },
  ]);
  assert.deepEqual(horizonChoices({ ...model(), horizon: 365 }), [
    { days: 91, label: '3 months' },
    { days: 183, label: '6 months' },
    { days: 365, label: '1 year' },
  ]);
  assert.deepEqual(largest(model())[0], { label: 'Tax', amount: '−£2,400.00' });
});

test('the plan holds zero in view, gaps in the past, a wash, a round axis and the crossing', () => {
  const m = model();
  const s = scenario(m, baseKnobs(m));
  const plan = forecastPlan(m, s, null);
  assert.match(plan.past, /^M[\d.]+ [\d.]+ M/u, 'a day with no point breaks the remembered line');
  assert.ok(plan.lo <= -900 && plan.hi >= 1500);
  assert.equal(plan.warn, true);
  assert.equal(plan.said, 'Goes under on 20 Oct');
  assert.equal(plan.cross?.day, '20 Oct');
  assert.equal('up' in plan || 'down' in plan, false, 'no stems: a movement is the readout\'s and the table\'s');
  assert.equal(plan.base, '', 'no baseline until a knob moves');
  assert.ok(forecastPlan(m, scenario(m, { ...baseKnobs(m), late: 5 }), s).base.length > 0);
  assert.deepEqual(plan.ticks.map((t) => t.label), ['Sep', 'Oct', 'Nov'], 'the month it starts in, at the edge, then each month');
  assert.deepEqual(plan.ticks.map((t) => t.edge ?? false), [true, false, false]);
  const read = readoutAt(m, s, plan, 1);
  assert.equal(read.flip, true);
  assert.equal(read.day, '16 Nov');
});

test('AN AXIS OF YEARS NAMES THE YEAR IT STARTS IN, and not a month that reads as the next year\'s', () => {
  /* Five years name each January by its year; "Sep" beside "2027" read as September 2027. */
  const five = ROWS.map((r) => (r[0] === 'horizon' ? ['horizon', '1825', '', ''] : r));
  const m = forecastModel([['past', '2026-05-01', '', '£600.00'], ...five])!;
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.deepEqual(plan.ticks.map((t) => t.label), ['2026', '2027', '2028', '2029', '2030', '2031']);
  assert.equal(plan.ticks[0]!.edge, true);
  /* From 14 Sep the first January is too near the edge for a name before it, at a phone's width. */
  const near = forecastModel(five)!;
  assert.deepEqual(forecastPlan(near, scenario(near, baseKnobs(near)), null).ticks.map((t) => t.label), ['2027', '2028', '2029', '2030', '2031']);
});

test('toHTML draws the static walk, no controls, and a sentence without an opening', () => {
  const src = ['```forecast', ...ROWS.map((r) => r.join(' | ')), '```'].join('\n');
  const html = toHTML(parse(src, { page: true }));
  assert.match(html, /class="forecast-future"/u);
  assert.doesNotMatch(html, /<input|<button/u);
  assert.match(html, /Every movement/u);
  assert.match(toHTML(parse('```forecast\nstep | 2026-09-18 | Rent | 1\n```', { page: true })), /forecast-empty/u);
  assert.equal(parse(src)[0]!.type, 'degraded', 'a forecast is page-only');
});

test('the late mark and the under note come from their rows, and the note waits until the crossing is near', () => {
  assert.equal(model().late, null);
  assert.equal(model().under, null);
  assert.equal(underNote(model(), scenario(model(), baseKnobs(model()))), '', 'no under: row, no note');
  const near = forecastModel([...ROWS, ['late', '12', '', ''], ['under', '40', '', '']])!;
  assert.equal(near.late, 12);
  assert.equal(underNote(near, scenario(near, baseKnobs(near))), 'Cash goes under in 33 days');
  const far = forecastModel([...ROWS, ['under', '30', '', '']])!;
  assert.equal(underNote(far, scenario(far, baseKnobs(far))), '', 'thirty-three days is further than thirty');
  assert.equal(forecastModel([...ROWS, ['under', '0', '', '']])!.under, null, 'a reach of nothing is no reach');
  assert.equal(forecastAverage(12), 'on average so far: 12 days');
  assert.equal(forecastAverage(-3), 'on average so far: on time');
  const src = ['```forecast', ...[...ROWS, ['under', '40', '', '']].map((r) => r.join(' | ')), '```'].join('\n');
  assert.match(toHTML(parse(src, { page: true })), /class="forecast-soon">Cash goes under in 33 days</u);
});

test('WALKS OF ONE GROUP READ ONE SET OF KNOBS: the horizon, lateness and what is left out shared, spending each its own', () => {
  assert.equal(model().group, null, 'a walk on its own is in no group');
  const egp = forecastModel([...ROWS.filter((r) => r[0] !== 'knobs'), ['group', 'cash-ahead', 'EGP', '']])!;
  const usd = forecastModel([...ROWS, ['group', 'cash-ahead', 'USD', '']])!;
  assert.deepEqual(egp.group, { id: 'cash-ahead', key: 'EGP' });
  assert.deepEqual(egp.knobs, [], 'only the walk that draws the knobs names them');
  assert.deepEqual(usd.knobs, ['horizon', 'late', 'spend', 'leave']);
  assert.equal(forecastModel([...ROWS, ['group', '', 'USD', '']])!.group, null, 'a group with no id is none');
  const held = { horizon: 30, late: 10, spend: { USD: 500 }, leave: ['Tax'] };
  assert.deepEqual(knobsIn(egp, held, 'EGP'), { horizon: 30, late: 10, spend: 0, leave: ['Tax'] });
  assert.deepEqual(knobsIn(usd, held, 'USD'), { horizon: 30, late: 10, spend: 500, leave: ['Tax'] });
  assert.equal(knobsIn(usd, { ...held, horizon: null }, 'USD').horizon, 60, 'no horizon chosen is the walk’s own');
});

/* ── the longer-range controls: growth, a rate drift, what counts, holdings sold ──────────────────────────────── */

/**
 * A USD salary walked into EGP beside EGP rent, the case these controls exist for: EGP 5,000.00 today, the salary worth
 * EGP 48,500.00 on the 1st and rent of EGP 50,000.00 on the 2nd, a year of each. EGP 1,500.00 short a month, so the
 * walk goes under on the fourth rent, 2 January. Each salary step says it was USD converted into EGP (`of`); rent says
 * nothing, because it was never converted.
 */
const MONTHS_AHEAD = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09'];
const DRIFTING = [
  ['opening', '2026-09-17', 'Cash now', 'EGP 5,000.00'],
  ...MONTHS_AHEAD.flatMap((m) => [
    ['step', `${m}-01`, 'Salary', 'EGP 48,500.00'],
    ['of', '', 'USD to EGP', ''],
    ['step', `${m}-02`, 'Rent', 'EGP −50,000.00'],
  ]),
  ['horizon', '365', '', ''],
  ['knobs', 'horizon grow drift count sell', '', ''],
];

test('A 10% YEARLY DRIFT IN USD TO EGP MOVES THE RUNWAY of a USD income beside EGP spending, and leaves the EGP alone', () => {
  const m = forecastModel(DRIFTING)!;
  const base = scenario(m, baseKnobs(m));
  assert.equal(base.crossed?.day, '2027-01-02', 'EGP 1,500.00 short a month from EGP 5,000.00 goes under on the fourth rent');
  const drifted = scenario(m, { ...baseKnobs(m), drift: { 'USD to EGP': 10 } });
  /* A DOLLAR THAT BUYS MORE POUNDS EACH MONTH: 48,500 × 1.1 ^ (14 / 365.25) on 1 October, and past 50,000 by February. */
  assert.equal(drifted.steps.find((s) => s.day === '2026-10-01')!.delta, Math.round(48_500 * 1.1 ** (14 / 365.25) * 100) / 100);
  assert.ok(drifted.steps.filter((s) => s.label === 'Rent').every((s) => s.delta === -50_000), 'rent was never in dollars');
  assert.equal(drifted.crossed, null, 'the drift carries the walk over the months it was short');
  assert.equal(against(base, drifted, knobsMoved(m, { ...baseKnobs(m), drift: { 'USD to EGP': 10 } })), 'No longer goes under');
  /* AND THE OTHER WAY: a pound that buys more dollars makes every salary smaller, and the walk goes under sooner. */
  const weaker = scenario(m, { ...baseKnobs(m), drift: { 'USD to EGP': -10 } });
  assert.ok(weaker.crossed && weaker.crossed.day < '2027-01-02', JSON.stringify(weaker.crossed));
  /* A PAIR NO STEP WAS CONVERTED THROUGH MOVES NOTHING. */
  assert.deepEqual(scenario(m, { ...baseKnobs(m), drift: { 'GBP to EGP': 50 } }).days, base.days);
  assert.deepEqual(pairsOf(m), ['USD to EGP']);
});

test('SPENDING AND MONEY IN GROW BY THE YEAR FROM TODAY, each on its own side, and spending the record does not know grows too', () => {
  const m = forecastModel(DRIFTING)!;
  const out = scenario(m, { ...baseKnobs(m), grow: { in: 0, out: 10 } });
  const rent = out.steps.find((s) => s.day === '2027-09-02')!;
  assert.equal(rent.delta, -Math.round(50_000 * 1.1 ** (350 / 365.25) * 100) / 100);
  assert.ok(out.steps.filter((s) => s.label === 'Salary').every((s) => s.delta === 48_500), 'spending growth leaves money in alone');
  const pay = scenario(m, { ...baseKnobs(m), grow: { in: 10, out: 0 } });
  assert.equal(pay.steps.find((s) => s.day === '2027-09-01')!.delta, Math.round(48_500 * 1.1 ** (349 / 365.25) * 100) / 100);
  assert.ok(pay.steps.filter((s) => s.label === 'Rent').every((s) => s.delta === -50_000));
  /* THE DRIP GROWS DAY BY DAY: EGP 10.00 a day at 20% a year is the sum of each day's ten pounds grown, not ten a day. */
  const quiet = forecastModel([['opening', '2026-09-17', 'Cash now', 'EGP 5,000.00'], ['horizon', '365', '', '']])!;
  const drip = scenario(quiet, { ...baseKnobs(quiet), spend: 304.375, grow: { in: 0, out: 20 } });
  let spent = 0;
  for (let d = 1; d <= 365; d++) spent += 10 * 1.2 ** (d / 365.25);
  assert.equal(drip.days[365]!.balance, Math.round((5_000 - spent) * 100) / 100);
  assert.equal(scenario(quiet, { ...baseKnobs(quiet), spend: 304.375 }).days[365]!.balance, 5_000 - 3_650, 'no growth is the drip it was');
  /* AN OVERDUE STEP IS TODAY'S MONEY, and today has not grown. */
  const late = forecastModel([['opening', '2026-09-17', 'Cash now', '£100.00'], ['step', '2026-09-01', 'Old bill', '−£50.00'], ['horizon', '30', '', '']])!;
  assert.equal(scenario(late, { ...baseKnobs(late), grow: { in: 0, out: 50 } }).steps[0]!.delta, -50);
});

test('WHAT COUNTS: every stream and every plan, in and out, and a plan counted out is every part of it', () => {
  const rows = [
    ['opening', '2026-09-17', 'Cash now', '£1,000.00'],
    ['step', '2026-10-01', 'Salary', '£2,000.00'],
    ['step', '2026-11-01', 'Salary', '£2,000.00'],
    ['step', '2026-10-05', 'Proofing press, 1 of 2', '−£1,875.00'],
    ['of', 'Proofing press', '', ''],
    ['step', '2026-11-05', 'Proofing press, 2 of 2', '−£1,875.00'],
    ['of', 'Proofing press', '', ''],
    ['step', '2026-10-09', 'One-off refund', '£40.00'],
    ['horizon', '90', '', ''],
  ];
  const m = forecastModel(rows)!;
  assert.deepEqual(m.steps.map((s) => s.of ?? null), [null, null, 'Proofing press', 'Proofing press', null]);
  assert.deepEqual(
    streamsOf(m),
    { in: [{ label: 'Salary', amount: '£4,000.00' }], out: [{ label: 'Proofing press', amount: '−£3,750.00' }] },
    'a movement that happens once is not a stream; the heaviest five still offer it under What counts',
  );
  const without = scenario(m, { ...baseKnobs(m), leave: ['Proofing press'] });
  assert.ok(without.steps.every((s) => !s.label.startsWith('Proofing press')));
  assert.equal(without.days.at(-1)!.balance, 1_000 + 4_000 + 40);
  /* AN `of` ROW WITH NO STEP ABOVE IT BELONGS TO NOTHING, and a pair that is not two codes is not a pair. */
  const stray = forecastModel([['opening', '2026-09-17', 'Cash now', '£1.00'], ['of', 'Nothing', 'USD to GBP', ''], ['step', '2026-10-01', 'A', '£1.00'], ['of', '', 'dollars', '']])!;
  assert.deepEqual(stray.steps, [{ day: '2026-10-01', label: 'A', delta: 1 }]);
});

test('HOLDINGS COUNTED AS SOLD ON A DAY ARRIVE THAT DAY, in the walk’s own money and never in another', () => {
  const rows = [...ROWS, ['sell', '', 'Gold', '£2,000.00'], ['sell', '', 'Dollar bonds', '$900.00']];
  const m = forecastModel(rows)!;
  assert.deepEqual(m.sells, [{ label: 'Gold', value: 2_000 }], 'a figure written in dollars is not added to a walk in pounds');
  const base = scenario(m, baseKnobs(m));
  assert.equal(base.crossed?.day, '2026-10-20', 'unsold, nothing moves');
  const sold = scenario(m, { ...baseKnobs(m), sell: '2026-10-01' });
  assert.deepEqual(sold.steps.find((s) => s.label === 'Gold'), { day: '2026-10-01', label: 'Gold', delta: 2_000, balance: 2_300 });
  assert.equal(sold.crossed, null);
  assert.equal(scenario(m, { ...baseKnobs(m), sell: '2026-09-01' }).steps.find((s) => s.label === 'Gold')!.day, '2026-09-17', 'a day already gone is today');
  assert.equal(scenario(m, { ...baseKnobs(m), sell: '2027-01-01' }).steps.find((s) => s.label === 'Gold'), undefined, 'past the horizon is not in the walk');
  assert.equal(knobsMoved(m, { ...baseKnobs(m), sell: '2026-10-01' }), true);
});

test('THE NEW KNOBS ARE READ FROM THE ROW, SHARED BY A GROUP, AND UNTOUCHED THEY ARE THE WALK THE HOST MADE', () => {
  const m = forecastModel(DRIFTING)!;
  assert.deepEqual(m.knobs, ['horizon', 'grow', 'drift', 'count', 'sell']);
  assert.equal(knobsMoved(m, baseKnobs(m)), false);
  assert.equal(knobsMoved(m, { ...baseKnobs(m), grow: { in: 0, out: 0 }, drift: { 'USD to EGP': 0 }, sell: null }), false, 'a knob at nothing has not moved');
  assert.equal(knobsMoved(m, { ...baseKnobs(m), grow: { in: 3, out: 0 } }), true);
  const held = { horizon: null, late: 0, spend: {}, leave: [], grow: { in: 5, out: 2 }, drift: { 'USD to EGP': 10 }, sell: '2026-12-01' };
  assert.deepEqual(knobsIn(m, held, 'EGP'), { horizon: 365, late: 0, spend: 0, leave: [], grow: { in: 5, out: 2 }, drift: { 'USD to EGP': 10 }, sell: '2026-12-01' });
  assert.deepEqual(knobsIn(m, { horizon: null, late: 0, spend: {}, leave: [] }, 'EGP'), { horizon: 365, late: 0, spend: 0, leave: [] }, 'a group made before these knobs holds none of them');
});

/* MUTATIONS SURVIVED BOTH OF THESE: drift taken by the day money was due, and an `of` row attached to a
   step with another row between them, each left every test above green. */
test('PAID LATE, A CONVERTED STEP GROWS BY THE DAY IT WAS DUE AND DRIFTS BY THE DAY IT ARRIVES', () => {
  const m = forecastModel(DRIFTING)!;
  const late = scenario(m, { ...baseKnobs(m), late: 10, grow: { in: 10, out: 0 }, drift: { 'USD to EGP': 10 } });
  const salary = late.steps.find((s) => s.day === '2026-10-11')!;
  assert.equal(salary.delta, Math.round(48_500 * (1.1 ** (14 / 365.25) * 1.1 ** (24 / 365.25)) * 100) / 100);
});

test('AN `of` ROW SPEAKS FOR THE STEP DIRECTLY ABOVE IT ONLY, and not for a step with another row between them', () => {
  const m = forecastModel([
    ['opening', '2026-09-17', 'Cash now', '£1.00'],
    ['step', '2026-10-01', 'A', '£1.00'],
    ['past', '2026-09-01', '', '£1.00'],
    ['of', 'Plan', 'USD to GBP', ''],
    ['step', 'not a day', 'B', '£1.00'],
    ['of', 'Plan', 'USD to GBP', ''],
  ])!;
  assert.deepEqual(m.steps, [{ day: '2026-10-01', label: 'A', delta: 1 }]);
});

test('THE AXIS IS ROUND STEPS DOWN ONE SIDE, zero among them, said short, and the scale is the balances\' alone', () => {
  const m = model();
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  /* The walk runs from −£900 to £1,500, so the steps are a thousand: £2k, £1k, £0, −£1k, top first. */
  assert.deepEqual(plan.axis.map((a) => a.label), ['£2k', '£1k', '£0', '−£1k']);
  assert.deepEqual(plan.axis.map((a) => a.at), ['0', '0.3333', '0.6667', '1']);
  assert.deepEqual(plan.axis.filter((a) => a.zero).map((a) => a.label), ['£0']);
  assert.equal(plan.zero, '66.67', 'the zero rule is where the axis says £0');
  assert.equal(plan.grid, 'M0 0H1000 M0 33.33H1000 M0 100H1000', 'a faint rule at every other step');
  assert.deepEqual([plan.lo, plan.hi], [-1000, 2000]);
});

test('THE WASH IS ONE CLOSED SHAPE from the zero rule, under the remembered line and the walk', () => {
  const m = model();
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.match(plan.area, new RegExp(`^M0 ${plan.zero} L0 `, 'u'), 'it starts on zero under the first remembered day');
  assert.match(plan.area, new RegExp(`L1000 ${plan.zero}Z$`, 'u'), 'and closes on zero under the horizon');
});

test('A FIGURE A HOST DREW WITH ITS CODE AFTER IT IS SAID SHORT on the axis, the readout and the switches, and exact in the table', () => {
  const rows = ROWS.map((r) => (/£/u.test(r[3] ?? '') ? [r[0]!, r[1]!, r[2]!, `${r[3]}\u00a0GBP`] : r));
  const m = forecastModel(rows)!;
  const s = scenario(m, baseKnobs(m));
  const plan = forecastPlan(m, s, null);
  assert.deepEqual(plan.axis.map((a) => a.label), ['£2k', '£1k', '£0', '−£1k'], 'not £2,000.00 GBP');
  assert.equal(readoutAt(m, s, plan, 1).balance, '−£900');
  assert.deepEqual(countsOf(m).out[0], { label: 'Tax', amount: '−£2,400' });
  const src = ['```forecast', ...rows.map((r) => r.join(' | ')), '```'].join('\n');
  assert.match(toHTML(parse(src, { page: true })), /<td class="num">−£1,200\.00\u00a0GBP<\/td>/u, 'the table keeps every penny and the code');
});

test('toHTML draws the wash, the axis down one side and no stems', () => {
  const src = ['```forecast', ...ROWS.map((r) => r.join(' | ')), '```'].join('\n');
  const html = toHTML(parse(src, { page: true }));
  assert.match(html, /<path class="forecast-area" fill="currentColor" fill-opacity="0\.06" stroke="none" d="M0 /u);
  assert.match(html, /<ol class="forecast-axis" aria-hidden="true"><li class="forecast-axis-tick" style="--at:0">£2k<\/li>/u);
  assert.match(html, /<li class="forecast-axis-tick" data-zero="" style="--at:0\.6667">£0<\/li>/u);
  assert.doesNotMatch(html, /forecast-stem|forecast-top|forecast-bottom/u);
});

test('THE LINE IS SOLID AS FAR AS THE RECORD KNOWS THE MOVEMENTS, and dashed only beyond, or beyond a `known` day', () => {
  const m = model();
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  /* The last movement inside the sixty days is 20 Oct, so the walk is solid to it and dashed from it to 16 Nov. */
  const xOf = (d: string) => /^M([\d.]+) /u.exec(d)?.[1];
  assert.equal(xOf(plan.walk), xOf(plan.now.d), 'the solid walk starts at today');
  assert.equal(`M${plan.walk.split(' L').at(-1)}`, plan.future.split(' L')[0], 'and the dashed one starts where it ends');
  assert.match(plan.future, / L1000 /u, 'the dashed walk runs to the horizon');
  const told = forecastModel([...ROWS, ['known', '2026-11-30', '', '']])!;
  assert.equal(told.known, '2026-11-30');
  const all = forecastPlan(told, scenario(told, baseKnobs(told)), null);
  assert.equal(all.future, '', 'known past the horizon, nothing is dashed');
  const none = forecastModel([['opening', '2026-09-17', 'Cash now', '£1,000.00'], ['horizon', '30', '', '']])!;
  const flat = forecastPlan(none, scenario(none, baseKnobs(none)), null);
  assert.equal(flat.walk, '', 'with no movement ahead, nothing ahead of today is known');
  assert.ok(flat.future.length > 0);
  assert.equal(forecastModel([...ROWS, ['known', '2026-09-01', '', '']])!.known, null, 'a known day before today is no day');
});

test('THE WASH IS CUT AT ZERO into the part above and the part under, and the cut sits on the crossing itself', () => {
  const m = model();
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.ok(plan.area.endsWith('Z') && plan.below.endsWith('Z'));
  /* £300 on 19 Oct to −£900 on 20 Oct crosses a quarter of the way through the day: 35.25 of 63 days in. */
  assert.ok(plan.area.includes(`L559.52 ${plan.zero}`), plan.area);
  assert.ok(plan.below.includes(`L559.52 ${plan.zero}`), plan.below);
  const ys = (d: string) => [...d.matchAll(/[ML][\d.]+ ([\d.]+)/gu)].map((x) => Number(x[1]));
  assert.ok(ys(plan.area).every((v) => v <= Number(plan.zero)), 'above never reaches under zero');
  assert.ok(ys(plan.below).every((v) => v >= Number(plan.zero)), 'under never reaches above it');
  const up = forecastModel([['opening', '2026-09-17', 'Cash now', '£1,000.00'], ['horizon', '30', '', '']])!;
  assert.equal(forecastPlan(up, scenario(up, baseKnobs(up)), null).below, '', 'a walk that never goes under has nothing to tint');
});

test('TODAY IS A DOT WITH ITS BALANCE, and the crossing flag is tied to the line by a rule', () => {
  const m = model();
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.equal(plan.now.label, '£1,000');
  assert.equal(plan.now.at, String(Math.round((3 / 63) * 100) / 100));
  assert.match(plan.now.d, /h0$/u);
  const dot = /^M([\d.]+) ([\d.]+)h0$/u.exec(plan.cross!.d)!;
  assert.equal(plan.cross!.rule, `M${dot[1]} 0V${dot[2]}`, 'from the chart top, where the flag sits, down to the dot');
  const html = toHTML(parse(['```forecast', ...ROWS.map((r) => r.join(' | ')), '```'].join('\n'), { page: true }));
  assert.match(html, /<path class="forecast-area" data-below="" fill="currentColor"/u);
  assert.match(html, /<path class="forecast-walk" fill="none" stroke="currentColor" stroke-width="2"/u);
  assert.match(html, /<path class="forecast-cross-rule" /u);
  assert.match(html, /<span class="forecast-now-label num" style="--at:[\d.]+;--y:[\d.]+" aria-hidden="true">£1,000<\/span>/u);
});

test('THE SENTENCE IS LEFT OFF WHERE THE HEADLINE SAYS WHEN IT RUNS OUT, the flag kept, and back once a knob moves the walk', () => {
  const plain = model();
  assert.equal(forecastPlan(plain, scenario(plain, baseKnobs(plain)), null).legend, true, 'no headline row, the sentence stays');
  const m = forecastModel([...ROWS, ['headline', 'under', '', '']])!;
  assert.equal(m.headline, true);
  const s = scenario(m, baseKnobs(m));
  const plan = forecastPlan(m, s, null);
  assert.equal(plan.legend, false);
  assert.ok(plan.cross, 'the flag stays');
  assert.match(plan.sentence, /Goes under on 20 Oct/u, 'and the chart\'s name still says it');
  assert.equal(forecastPlan(m, scenario(m, { ...baseKnobs(m), late: 5 }), s).legend, true, 'a moved walk is not the one the headline read');
  const above = forecastModel([['opening', '2026-09-17', 'Cash now', '£1,000.00'], ['horizon', '30', '', ''], ['headline', 'under', '', '']])!;
  assert.equal(forecastPlan(above, scenario(above, baseKnobs(above)), null).legend, true, 'a walk that never goes under still says so');
  const html = toHTML(parse(['```forecast', ...ROWS.map((r) => r.join(' | ')), 'headline | under |  | ', '```'].join('\n'), { page: true }));
  assert.doesNotMatch(html, /forecast-said/u);
  assert.match(html, /class="forecast-pin"/u);
});

test('A CROSSING NEAR TODAY SETS THE LABELS APART: the balance marked near the flag, the flag\'s day after its rule', () => {
  const rows = [['opening', '2026-09-17', 'Cash now', '£1,000.00'], ['step', '2026-09-27', 'Rent', '−£2,000.00'], ['horizon', '180', '', '']];
  const m = forecastModel(rows)!;
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.equal(plan.cross?.near, true, 'ten days of a hundred and eighty');
  const far = model();
  assert.equal(forecastPlan(far, scenario(far, baseKnobs(far)), null).cross?.near, false);
  const html = toHTML(parse(['```forecast', ...rows.map((r) => r.join(' | ')), '```'].join('\n'), { page: true }));
  assert.match(html, /<span class="forecast-now-label num" data-near-flag="" style=/u);
  assert.match(html, /<span class="forecast-pin" data-side="end" style=/u);
  assert.match(html, /<li class="forecast-tick" data-edge="" style="--at:0">Sep<\/li>/u);
});
