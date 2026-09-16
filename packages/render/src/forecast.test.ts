import { test } from 'node:test';
import assert from 'node:assert/strict';

import { against, baseKnobs, forecastModel, forecastPlan, horizonChoices, knobsMoved, largest, readoutAt, scenario, type ForecastModel } from './forecast.ts';
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
  assert.deepEqual(horizonChoices({ ...model(), horizon: 180 }), [[3, 91], [6, 180]]);
  assert.deepEqual(horizonChoices({ ...model(), horizon: 365 }), [[3, 91], [6, 183], [12, 365]]);
  assert.deepEqual(largest(model())[0], { label: 'Tax', amount: '−£2,400.00' });
});

test('the plan holds zero in view, gaps in the past, stems and the crossing', () => {
  const m = model();
  const s = scenario(m, baseKnobs(m));
  const plan = forecastPlan(m, s, null);
  assert.match(plan.past, /^M[\d.]+ [\d.]+ M/u, 'a day with no point breaks the remembered line');
  assert.ok(plan.lo <= -900 && plan.hi >= 1500);
  assert.ok(plan.up.length > 0 && plan.down.length > 0);
  assert.equal(plan.warn, true);
  assert.equal(plan.said, 'Goes under on 20 Oct');
  assert.equal(plan.cross?.day, '20 Oct');
  assert.equal(plan.base, '', 'no baseline until a knob moves');
  assert.ok(forecastPlan(m, scenario(m, { ...baseKnobs(m), late: 5 }), s).base.length > 0);
  assert.deepEqual(plan.ticks.map((t) => t.label), ['Oct', 'Nov']);
  const read = readoutAt(m, s, plan, 1);
  assert.equal(read.flip, true);
  assert.equal(read.day, '16 Nov');
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
