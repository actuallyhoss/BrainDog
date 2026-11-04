import { test } from 'node:test';
import assert from 'node:assert/strict';

import { against, axisFit, baseKnobs, countsOf, forecastAverage, forecastWeeks, forecastModel, forecastPlan, horizonChoices, knobsIn, knobsMoved, largest, pairsOf, readoutAt, scenario, streamsOf, underNote, type ForecastModel } from './forecast.ts';
import { walkKnobs, pairsAcross, sellRows, soldName, type Group } from '../svelte/forecast-group.svelte.ts';
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

test('a length of whole weeks from two to twelve is said in weeks: ten weeks is 10 weeks, not 70 days', () => {
  assert.deepEqual(horizonChoices({ ...model(), horizon: 365, horizons: [70, 90, 45] }), [
    { days: 70, label: '10 weeks' },
    { days: 90, label: '3 months' },
    { days: 45, label: '45 days' },
  ]);
  assert.equal(forecastWeeks(1), '1 week');
});

test('the plan holds the zero it crosses in view, gaps in the past, a wash, a round axis and the crossing', () => {
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
  assert.deepEqual(plan.ticks.map((t) => t.label), ['Today', 'Oct', 'Nov'], 'today among the months, in the place of a month too near it (3d1cd2f8a), then each month');
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
  /* TODAY IS NAMED UNDER THE CHART SINCE 3d1cd2f8a, and the years too near it give way to it. */
  assert.deepEqual(plan.ticks.map((t) => t.label), ['Today', '2028', '2029', '2030', '2031']);
  assert.equal(plan.ticks[0]!.edge, true);
  assert.equal(plan.ticks[0]!.now, true);
  assert.ok(plan.ticks.every((t) => !/^[A-Z][a-z]{2}$/u.test(t.label)), 'not a month that reads as the next year\'s');
  /* From 14 Sep the first January is too near the edge for a name before it, at a phone's width. */
  const near = forecastModel(five)!;
  assert.deepEqual(forecastPlan(near, scenario(near, baseKnobs(near)), null).ticks.map((t) => t.label), ['Today', '2028', '2029', '2030', '2031']);
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

/** A walk of two years that opens on three months: a salary every month, a lease that starts in the spring, one bonus. */
const LONG = [
  ['opening', '2026-09-17', 'Cash now', '£1,000.00'],
  ...Array.from({ length: 24 }, (_, i) => ['step', `${2026 + Math.floor((9 + i) / 12)}-${String(((9 + i) % 12) + 1).padStart(2, '0')}-01`, 'Salary', '£2,000.00']),
  ['step', '2027-03-01', 'Lease', '−£900.00'],
  ['step', '2027-04-01', 'Lease', '−£900.00'],
  ['step', '2027-06-01', 'Bonus', '£5,000.00'],
  ['step', '2026-09-10', 'Overdue invoice', '£300.00'],
  ['horizon', '90', '', ''],
  ['reach', '730', '', ''],
  ['knobs', 'horizon count', '', ''],
];

test('WHAT COUNTS IS COUNTED INSIDE THE HORIZON ON SCREEN, not over the whole walk the host sent past it', () => {
  const m = forecastModel(LONG)!;
  assert.equal(m.reach, 730);
  /* THREE MONTHS OPEN: three salaries, and nothing of the lease or the bonus, which move only past the chart. */
  assert.deepEqual(streamsOf(m), { in: [{ label: 'Salary', amount: '£6,000.00' }], out: [] });
  assert.deepEqual(countsOf(m), { in: [{ label: 'Salary', amount: '£6,000' }, { label: 'Overdue invoice', amount: '£300' }], out: [] }, 'an overdue one is walked today, so it is on screen');
  /* A YEAR CHOSEN: the lease is a stream now, and the bonus a one-off. */
  const year = countsOf(m, 365);
  assert.deepEqual(year.in.map((c) => c.label), ['Salary', 'Bonus', 'Overdue invoice']);
  assert.deepEqual(year.out, [{ label: 'Lease', amount: '−£1,800' }]);
  assert.deepEqual(streamsOf(m, 365).out, [{ label: 'Lease', amount: '−£1,800.00' }]);
  /* NO FURTHER THAN THE WALK, as `scenario` holds the horizon to it, and never less than a day. */
  assert.deepEqual(countsOf(m, 5_000), countsOf(m, 730));
  assert.deepEqual(countsOf(m, 0), countsOf(m, 1));
  /* AND WHAT IT OFFERS IS WHAT THE TABLE UNDER THE CHART LISTS, the steps `scenario` walks inside the same horizon. */
  for (const h of [90, 365, 730]) {
    const walked = new Set(scenario(m, { ...baseKnobs(m), horizon: h }).steps.map((s) => s.of ?? s.label));
    const offered = countsOf(m, h);
    assert.deepEqual([...offered.in, ...offered.out].map((c) => c.label).filter((l) => !walked.has(l)), [], `${h} days`);
  }
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
  /* The walk runs from −£900 to £1,500, so the steps are five hundred, from £1.5k down to −£1k, top first: steps of a
     thousand reached £2k, a band of £500 over the line that nothing was drawn in. */
  assert.deepEqual(plan.axis.map((a) => a.label), ['£1.5k', '£1k', '£500', '£0', '−£500', '−£1k']);
  assert.deepEqual(plan.axis.map((a) => a.at), ['0', '0.2', '0.4', '0.6', '0.8', '1']);
  assert.deepEqual(plan.axis.filter((a) => a.zero).map((a) => a.label), ['£0']);
  assert.equal(plan.zero, '60', 'the zero rule is where the axis says £0');
  assert.equal(plan.grid, 'M0 0H1000 M0 20H1000 M0 40H1000 M0 80H1000 M0 100H1000', 'a faint rule at every other step');
  assert.deepEqual([plan.lo, plan.hi], [-1000, 1500]);
});

test('axisFit: ROUND LEVELS AROUND THE LOWEST AND THE HIGHEST, on the step that leaves the least empty band', () => {
  assert.deepEqual(axisFit(-900, 1500), { lo: -1000, hi: 1500, step: 500, levels: [1500, 1000, 500, 0, -500, -1000] });
  /* Steps of two thousand reached 6,000 over a walk that stops at 4,500. */
  assert.deepEqual(axisFit(0, 4500).levels, [5000, 4000, 3000, 2000, 1000, 0]);
  /* Two steps span the same: the larger is taken, for fewer names down the side. */
  assert.deepEqual(axisFit(0, 4000).levels, [4000, 2000, 0]);
  /* Never more than six names, whatever the range. */
  for (const [a, b] of [[0, 1], [3, 977], [-41_250.5, 88_100], [12, 13.5], [990, 3010], [1e9, 7.3e9]] as const) {
    const fit = axisFit(a, b);
    assert.ok(fit.levels.length >= 2 && fit.levels.length <= 6, `${a} to ${b}: ${fit.levels.join(' ')}`);
    assert.ok(fit.lo <= a && fit.hi >= b, `${a} to ${b} is inside ${fit.lo} to ${fit.hi}`);
    assert.deepEqual(fit.levels, [...fit.levels].sort((x, y) => y - x), 'top first');
    assert.ok(fit.levels.every((v) => Number.isInteger(v / fit.step)), 'every level a whole number of steps');
    assert.ok([1, 2, 5].includes(fit.step / 10 ** Math.floor(Math.log10(fit.step))), `a round step: ${fit.step}`);
  }
  /* The two ends in either order, as a caller with one value on each side of nothing might hand them. */
  assert.deepEqual(axisFit(1500, -900), axisFit(-900, 1500));
});

test('axisFit: ZERO IS HELD ONLY WHERE THE BALANCES CROSS IT OR COME NEAR', () => {
  /* Far from zero: the axis is the balances' own band, where it was 0 to 40,000 with the line in its top tenth. */
  assert.deepEqual(axisFit(31_200, 33_900).levels, [34_000, 33_000, 32_000, 31_000]);
  assert.deepEqual(axisFit(-33_900, -31_200).levels, [-31_000, -32_000, -33_000, -34_000], 'and the same under zero');
  /* Crossing it. */
  assert.ok(axisFit(-200, 9000).levels.includes(0));
  /* Near it: the lowest is within half the range of zero, so zero costs a third of the height at most. */
  assert.deepEqual(axisFit(2000, 10_000).levels, [10_000, 5000, 0]);
  assert.deepEqual(axisFit(-10_000, -2000).levels, [0, -5000, -10_000]);
  /* Just past near: 5,000 to 10,000 is half its height empty with zero in it, and is drawn without. */
  assert.equal(axisFit(5000, 10_000).lo, 5000);
  assert.equal(axisFit(4000, 10_000).lo, 4000);
  assert.equal(axisFit(3000, 9000).lo, 0, 'exactly half the range away is near');
  /* Near, but the round steps from zero would run to 150,000 and leave the line under half the height: its own band. */
  assert.deepEqual(axisFit(33_600, 101_800).levels, [120_000, 100_000, 80_000, 60_000, 40_000, 20_000]);
  assert.deepEqual(axisFit(330, 1020).levels, [1200, 1000, 800, 600, 400, 200]);
  assert.deepEqual(axisFit(-101_800, -33_600).levels, [-20_000, -40_000, -60_000, -80_000, -100_000, -120_000]);
  /* Touching zero is zero, and it is 0 and not -0. */
  assert.ok(axisFit(-3000, 0).levels.some((v) => Object.is(v, 0)));
  assert.ok(!axisFit(-3000, 0).levels.some((v) => Object.is(v, -0)));
});

test('axisFit: A FLAT WALK IS NOT DRAWN AS A CLIFF, and a walk with nothing in it still has an axis', () => {
  /* £50 on £31,000 is flat: the axis spans a twentieth of the balance at least, so the line stays a line. */
  const still = axisFit(31_000, 31_050);
  assert.ok(still.hi - still.lo >= 1550, `${still.lo} to ${still.hi}`);
  assert.ok(still.lo > 0, 'and it does not go back to zero for it');
  const one = axisFit(5000, 5000);
  assert.ok(one.lo < 5000 && one.hi > 5000 && one.lo > 0, 'one balance sits inside its axis, not on its edge');
  assert.deepEqual(axisFit(0, 0), { lo: 0, hi: 1, step: 1, levels: [1, 0] });
  assert.deepEqual(axisFit(Number.NaN, 5), { lo: 0, hi: 1, step: 1, levels: [1, 0] }, 'a balance that is no number draws no scale of its own');
  /* Never finer than one of the money's units: pence of movement is an axis of two whole pounds. */
  assert.deepEqual(axisFit(0.4, 0.6).levels, [1, 0]);
});

test('axisFit: A STEP WHOSE LEVELS THE AXIS CANNOT SAY IS PASSED OVER for the next rounder one', () => {
  const whole = (v: number): boolean => Number.isInteger(v / 1000);
  /* Five hundreds fit 31,200 to 33,400 tighter, and an axis that says thousands would name 31,500 and 32,000 alike. */
  assert.deepEqual(axisFit(31_200, 33_400).levels, [33_500, 33_000, 32_500, 32_000, 31_500, 31_000]);
  assert.deepEqual(axisFit(31_200, 33_400, whole).levels, [34_000, 33_000, 32_000, 31_000]);
  /* And where nothing passes, the axis is still drawn. */
  assert.ok(axisFit(31_200, 33_400, () => false).levels.length >= 2);
});

test('A WALK FAR FROM ZERO STILL STANDS ON ZERO (3d1cd2f8a): zero on the axis, the rule at its foot, and the wash down to it', () => {
  const m = forecastModel([
    ['opening', '2026-09-17', 'Cash now', '£32,400.00'],
    ['past', '2026-09-15', '', '£31,200.00'],
    ['past', '2026-09-16', '', '£31,900.00'],
    ['step', '2026-09-25', 'Invoice', '£1,500.00'],
    ['step', '2026-10-05', 'Rent', '−£900.00'],
    ['horizon', '30', '', ''],
  ])!;
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.deepEqual(plan.axis.map((a) => a.label), ['£40k', '£20k', '£0']);
  assert.deepEqual(plan.axis.filter((a) => a.zero).map((a) => a.label), ['£0'], 'its foot is zero');
  assert.deepEqual([plan.lo, plan.hi], [0, 40_000]);
  assert.equal(plan.zero, '100', 'the rule is the foot of the axis');
  assert.equal(plan.grid, 'M0 0H1000 M0 50H1000', 'and no faint rule is drawn over it');
  assert.match(plan.area, /^M0 100 L0 /u);
  assert.match(plan.area, /L1000 100Z$/u);
  assert.equal(plan.below, '', 'nothing is under zero, so nothing is tinted');
  const ys = [...`${plan.area} ${plan.past} ${plan.walk} ${plan.future}`.matchAll(/[ML][\d.]+ (-?[\d.]+)/gu)].map((x) => Number(x[1]));
  assert.ok(ys.every((v) => v >= 0 && v <= 100), 'every point is inside the box');
  /* The same walk overdrawn by 33k: the rule is the top of the axis, and all of the wash is the part under zero. */
  const under = forecastModel([['opening', '2026-09-17', 'Cash now', '−£32,400.00'], ['step', '2026-09-25', 'Rent', '−£900.00'], ['horizon', '30', '', '']])!;
  const red = forecastPlan(under, scenario(under, baseKnobs(under)), null);
  assert.equal(red.zero, '0');
  assert.equal(red.area, '');
  assert.match(red.below, /^M0 0 L0 /u);
  assert.deepEqual(red.axis.map((a) => a.label), ['£0', '−£20k', '−£40k'], 'zero at the top, and under it what is owed');
  assert.equal(red.axis[0]!.zero, true);
});

test('THE AXIS NEVER NAMES TWO LEVELS ALIKE, whatever the walk', () => {
  for (const [opening, delta] of [['£31,240.55', '−£1,180.20'], ['£1,040.00', '£130.00'], ['£99,600.00', '£900.00'], ['£12.00', '£1.50'], ['£1,234,000.00', '−£260,000.00'], ['£845.00', '−£1,300.00']] as const) {
    const m = forecastModel([['opening', '2026-09-17', 'Cash now', opening], ['step', '2026-09-25', 'Move', delta], ['horizon', '30', '', '']])!;
    const labels = forecastPlan(m, scenario(m, baseKnobs(m)), null).axis.map((a) => a.label);
    assert.equal(new Set(labels).size, labels.length, `${opening} ${delta}: ${labels.join(' ')}`);
  }
});

test('THE WASH IS ONE CLOSED SHAPE from the zero rule, under the remembered line and the walk', () => {
  const m = model();
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.match(plan.area, new RegExp(`^M0 ${plan.zero} L0 `, 'u'), 'it starts on zero under the first remembered day');
  assert.match(plan.area, new RegExp(`L1000 ${plan.zero}Z$`, 'u'), 'and closes on zero under the horizon');
});

test('A FIGURE A HOST DREW WITH ITS CODE AFTER IT IS SAID SHORT on the axis, by its own sign on the readout and the switches, and is exact in the table', () => {
  const rows = ROWS.map((r) => (/£/u.test(r[3] ?? '') ? [r[0]!, r[1]!, r[2]!, `${r[3]}\u00a0GBP`] : r));
  const m = forecastModel(rows)!;
  const s = scenario(m, baseKnobs(m));
  const plan = forecastPlan(m, s, null);
  assert.deepEqual(plan.axis.map((a) => a.label), ['£1.5k', '£1k', '£500', '£0', '−£500', '−£1k'], 'not £1,500.00 GBP');
  assert.equal(readoutAt(m, s, plan, 1).balance, '−£900', 'a currency the record did not name as its own is said by its own sign (AM15)');
  assert.deepEqual(countsOf(m).out[0], { label: 'Tax', amount: '−£2,400' });
  const src = ['```forecast', ...rows.map((r) => r.join(' | ')), '```'].join('\n');
  assert.match(toHTML(parse(src, { page: true })), /<td class="num">−£1,200\.00<\/td>/u, 'the table keeps every penny, by its sign since edbe8c9de');
});

test('toHTML draws the wash, the axis down one side and no stems', () => {
  const src = ['```forecast', ...ROWS.map((r) => r.join(' | ')), '```'].join('\n');
  const html = toHTML(parse(src, { page: true }));
  assert.match(html, /<path class="forecast-area" fill="currentColor" fill-opacity="0\.06" stroke="none" d="M0 /u);
  assert.match(html, /<ol class="forecast-axis" aria-hidden="true"><li class="forecast-axis-tick" style="--at:0">£1\.5k<\/li>/u);
  assert.match(html, /<li class="forecast-axis-tick" data-zero="" style="--at:0\.6">£0<\/li>/u);
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
  /* "TODAY" IS THE AXIS'S WORD SINCE 3d1cd2f8a: no box on the line over the stretch it names, its balance is the summary's. */
  assert.doesNotMatch(html, /forecast-now-label|forecast-now-figure/u);
  assert.match(html, /<li class="forecast-tick"(?: data-edge="")? data-now="" style="--at:[\d.]+">Today<\/li>/u);
  assert.match(html, /from £1,000 today/u);
  assert.equal(plan.now.rule, `M${/^M([\d.]+)/u.exec(plan.now.d)![1]} 0V100`, 'and a hairline down the chart at today');
  assert.match(html, /<path class="forecast-walk" [^>]*style="stroke:url\(#[^)]+-under\)"/u, 'the line is cut at zero: ink above, red under');
});

test('THE SENTENCE IS LEFT OFF WHERE THE HEADLINE SAYS HOW LONG IT LASTS, the flag kept, and back once a knob moves the walk', () => {
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
  assert.equal(forecastPlan(above, scenario(above, baseKnobs(above)), null).legend, false, 'a walk that never goes under leaves the horizon to the page');
  assert.equal(forecastPlan(above, scenario(above, { ...baseKnobs(above), late: 5 }), scenario(above, baseKnobs(above))).legend, true, 'until a knob moves it');
  const html = toHTML(parse(['```forecast', ...ROWS.map((r) => r.join(' | ')), 'headline | under |  | ', '```'].join('\n'), { page: true }));
  assert.doesNotMatch(html, /forecast-said/u);
  assert.match(html, /class="forecast-pin"/u);
});

/* Cash fell to
   today and the walk steps up three days on, and "Today" over "EGP 752,841.68", set over the dot to the end side, was drawn
   across the line that climbs there. The label goes to a corner the line leaves free, inside the plot. */
test('TODAY\'S LABEL SITS IN A CORNER THE LINE LEAVES FREE, so a walk that climbs the day after never runs through it', () => {
  const fell = Array.from({ length: 30 }, (_, i) => ['past', new Date(Date.UTC(2026, 8, 24 + i)).toISOString().slice(0, 10), '', `£${900 - i * 5}.00`]);
  const rows = [
    ['opening', '2026-10-24', 'Cash now', '£752.84'],
    ...fell,
    ['step', '2026-10-27', 'Salary', '£300.00'],
    ['step', '2026-11-10', 'Invoice', '£400.00'],
    ['step', '2026-12-03', 'Tax', '−£900.00'],
    ['horizon', '60', '', ''],
  ];
  const m = forecastModel(rows)!;
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.notEqual(plan.now.place, 'above', 'over the dot to the end side is where the walk climbs');
  const html = toHTML(parse(['```forecast', ...rows.map((r) => r.join(' | ')), '```'].join('\n'), { page: true }));
  /* NOTHING STANDS BESIDE THE DOT TO RUN INTO THE WALK NOW (3d1cd2f8a): Today is under the chart. The model still finds the corner. */
  assert.doesNotMatch(html, /forecast-now-label|data-place=/u);
  assert.match(html, /data-now="" style="--at:[\d.]+">Today<\/li>/u);
  assert.equal(plan.now.place, 'under', 'under the dot, where the walk runs above it');
  /* AND A WALK THAT LEAVES THE CORNER OVER THE DOT FREE KEEPS THE LABEL WHERE IT ALWAYS SAT, with no mark. */
  const level = forecastModel([['opening', '2026-10-24', 'Cash now', '£1,000.00'], ['step', '2026-12-10', 'Invoice', '£500.00'], ['horizon', '60', '', '']])!;
  const kept = forecastPlan(level, scenario(level, baseKnobs(level)), null);
  assert.equal(kept.now.place, 'above');
  assert.doesNotMatch(toHTML(parse(['```forecast', 'opening | 2026-10-24 | Cash now | £1,000.00', 'step | 2026-12-10 | Invoice | £500.00', 'horizon | 60 |  | ', '```'].join('\n'), { page: true })), /data-place=/u);
});

test('A CROSSING NEAR TODAY SETS THE LABELS APART: the balance marked near the flag, the flag\'s day after its rule', () => {
  const rows = [['opening', '2026-09-17', 'Cash now', '£1,000.00'], ['step', '2026-09-27', 'Rent', '−£2,000.00'], ['horizon', '180', '', '']];
  const m = forecastModel(rows)!;
  const plan = forecastPlan(m, scenario(m, baseKnobs(m)), null);
  assert.equal(plan.cross?.near, true, 'ten days of a hundred and eighty');
  const far = model();
  assert.equal(forecastPlan(far, scenario(far, baseKnobs(far)), null).cross?.near, false);
  const html = toHTML(parse(['```forecast', ...rows.map((r) => r.join(' | ')), '```'].join('\n'), { page: true }));
  /* THE FLAG STILL STEPS ASIDE, and Today stands at the chart's start, in the start month's place, under the rule. */
  assert.doesNotMatch(html, /forecast-now-label|data-near-flag/u);
  assert.match(html, /<span class="forecast-pin" data-side="end" style=/u);
  assert.match(html, /<li class="forecast-tick" data-edge="" data-now="" style="--at:0">Today<\/li>/u);
});

test('A CHART CAN OPEN ON THREE MONTHS OVER A LONGER WALK, and the knob offers every length up to the walk\'s own reach', () => {
  const rows = [...ROWS.filter((r) => r[0] !== 'horizon'), ['horizon', '90', '', ''], ['reach', '730', '', ''], ['horizons', '90 180 365 730 1825 last', '', '']];
  const m = forecastModel(rows)!;
  assert.equal(m.horizon, 90, 'it opens on the length the block asked for');
  assert.equal(m.reach, 730);
  assert.deepEqual(
    horizonChoices(m).map((c) => c.label),
    ['3 months', '6 months', '1 year', '2 years', 'To the end'],
    'five years is past the walk, and the end is the last dated movement',
  );
  const opened = scenario(m, baseKnobs(m));
  assert.equal(opened.horizon, 90);
  assert.equal(opened.steps.at(-1)!.day, '2026-10-20', 'at rest it walks the three months it opens on');
  assert.equal(scenario(m, { ...baseKnobs(m), horizon: 365 }).steps.at(-1)!.day, '2026-12-30', 'and a year when a person asks for one');
  assert.equal(scenario(m, { ...baseKnobs(m), horizon: 5000 }).horizon, 730, 'never past the walk');
  assert.equal(knobsMoved(m, baseKnobs(m)), false);
  /* No `reach` row, or one shorter than the opening, is a walk that reaches as far as it opens. */
  assert.equal(model().reach, 60);
  assert.equal(forecastModel([...rows.filter((r) => r[0] !== 'reach'), ['reach', '30', '', '']])!.reach, 90);
});

test('A LENGTH PAST THE WALK IS OFFERED WHERE THE HOST CAN WALK IT, with the length to ask for, and "To the end" asks while the walk may stop short', () => {
  const rows = [...ROWS.filter((r) => r[0] !== 'horizon'), ['horizon', '90', '', ''], ['reach', '731', '', ''], ['horizons', '90 180 365 730 1825 last', '', '']];
  const m = forecastModel(rows)!;
  const walked = horizonChoices(m, true);
  assert.deepEqual(
    walked.map((c) => c.label),
    ['3 months', '6 months', '1 year', '2 years', '5 years', 'To the end'],
  );
  assert.deepEqual(walked.find((c) => c.label === '5 years'), { days: 1825, label: '5 years', walk: 1825 }, 'five years is asked for');
  assert.equal(walked.find((c) => c.label === '2 years')!.walk, undefined, 'two years is walked already');
  assert.deepEqual(walked.at(-1), { days: 104, label: 'To the end', end: true, walk: 'last' }, 'the end asks while a declared length lies past the walk');
  /* Once the longer walk lands, nothing is asked: the plan ends well inside it. */
  const landed = forecastModel([...rows.filter((r) => r[0] !== 'reach'), ['reach', '1825', '', '']])!;
  assert.ok(horizonChoices(landed, true).every((c) => c.walk === undefined));
  /* A walk still moving money in its last month may have been cut off, so the end asks for the rest. */
  const cut = forecastModel([...ROWS.filter((r) => r[0] !== 'horizon'), ['horizon', '90', '', ''], ['reach', '110', '', ''], ['horizons', '90 last', '', '']])!;
  assert.equal(horizonChoices(cut, true).at(-1)!.walk, 'last');
  assert.equal(horizonChoices(cut).at(-1)!.walk, undefined, 'a host that cannot walk further is asked nothing');
});

test('A GROUP OFFERS EVERY WALK’S PAIRS AND HOLDINGS, and selling the first walk’s moves the first walk only', () => {
  const walk = (key: string, extra: string[][]): ForecastModel =>
    forecastModel([...ROWS.filter((r) => r[0] !== 'knobs'), ['knobs', 'horizon drift sell', '', ''], ['group', 'cash-ahead', key, ''], ...extra])!;
  /* Two walks the record could not convert between, a holding in each under ONE name, and a bill converted into the first. */
  const first = walk('GBP', [['sell', '', 'Gold', '£2,000.00'], ['step', '2026-10-01', 'Hosting', '−£80.00'], ['of', '', 'USD to GBP', '']]);
  const second = walk('EGP', [['sell', '', 'Gold', '£900.00'], ['sell', '', 'Bonds', '£100.00']]);
  assert.deepEqual(pairsOf(first), ['USD to GBP']);
  assert.deepEqual(pairsOf(second), []);
  const told = ([first, second] as const).map((m) => [m.group!.key, { pairs: pairsOf(m), sells: m.sells.map((x) => x.label) }] as const);
  /* The controls sit under the second walk, and list what both walks told them. */
  assert.deepEqual(pairsAcross(told), ['USD to GBP'], 'the one pair, though the walk the controls sit under has none');
  const rows = sellRows(told);
  assert.deepEqual(rows, [{ key: 'GBP', names: ['Gold'] }, { key: 'EGP', names: ['Gold', 'Bonds'] }], 'one name in two currencies stays two controls');
  assert.deepEqual(rows.map((r) => soldName(r, rows.length > 1)), ['Gold (British pound) sold on', 'Gold, Bonds (Egyptian pound) sold on']);
  assert.equal(soldName(rows[0]!, false), 'Gold sold on', 'a lone control needs no currency');
  assert.deepEqual(sellRows([['EGP', { pairs: [], sells: [] }]]), [], 'a walk with nothing to sell is no control');

  const group: Pick<Group, 'knobs' | 'sold'> = { knobs: { horizon: null, late: 0, spend: {}, leave: [] }, sold: {} };
  const balances = (m: ForecastModel): number[] => scenario(m, walkKnobs(m, group, m.group!.key)).days.map((d) => d.balance);
  const rest = [balances(first), balances(second)];
  assert.equal(knobsMoved(first, walkKnobs(first, group, 'GBP')), false, 'nothing sold, nothing moved');
  group.sold.GBP = '2026-10-05';
  assert.notDeepEqual(balances(first), rest[0], 'the first walk has its gold from the day it is sold');
  assert.equal(scenario(first, walkKnobs(first, group, 'GBP')).steps.find((s) => s.label === 'Gold')?.delta, 2_000);
  assert.deepEqual(balances(second), rest[1], 'and the second walk, holding gold of its own, does not move');
  assert.equal(knobsMoved(second, walkKnobs(second, group, 'EGP')), false);
  /* A day held by the group's shared knobs from before is not read by a walk of a group: its own key's day is. */
  assert.equal(walkKnobs(second, { knobs: { ...group.knobs, sell: '2026-10-05' }, sold: {} }, 'EGP').sell, null);
});

test('A WALK DRAWN BY ITS SIGN ALONE, OR ITS CODE AFTER, STILL KNOWS ITS CURRENCY with no home row', () => {
  const dollars = forecastModel([['opening', '2026-09-17', 'Cash now', '$1,950'], ['sell', '', 'Bonds', 'USD 900.00'], ['sell', '', 'Gold', '£500.00'], ['spent', '3', '', '$400']])!;
  assert.equal(dollars.currency, 'USD');
  assert.deepEqual(dollars.sells, [{ label: 'Bonds', value: 900 }], 'one money written two ways is one money; pounds stay out');
  assert.equal(dollars.spent, 400);
  assert.equal(forecastModel([['opening', '2026-09-17', 'Cash now', '£1,000.00 GBP']])!.currency, 'GBP');
  assert.equal(forecastModel([['opening', '2026-09-17', 'Cash now', '$1,950'], ['home', 'CAD', '', '']])!.currency, 'CAD');
});
