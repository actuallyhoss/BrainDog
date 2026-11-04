/**
 * Where a forecast's value axis starts: at zero, always, since 3d1cd2f8a (2 Nov). A wash over a fitted axis read as near
 * nothing at its foot, with a break beside the last figure to say it was not, so an axis is no longer cut and nothing
 * draws a break. `axisFit` still fits when it is not told to hold zero, for what else reads it. And the what-if is held
 * in memory only, so a page come back to draws the host's walk.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FORECAST_AXIS_BREAK, axisFit, baseKnobs, forecastFigure, forecastModel, forecastPlan, scenario, type ForecastPlan } from './forecast.ts';
import { parse } from './parse.ts';
import { toHTML } from './html.ts';

/** A walk from E£1,000,000 that stays far above zero: a retainer in and rent out. */
const HIGH = [
  ['opening', '2026-10-14', 'Cash now', 'EGP 1,000,000.00'],
  ['home', 'EGP', '', ''],
  ['step', '2026-10-20', 'Rent', 'EGP −20,000.00'],
  ['step', '2026-11-01', 'Retainer', 'EGP 6,000.00'],
  ['step', '2026-11-20', 'Rent', 'EGP −20,000.00'],
  ['horizon', '70', '', ''],
];
/** One that goes under: E£1,000 and a rent of E£2,000. */
const CROSSING = [
  ['opening', '2026-10-14', 'Cash now', 'EGP 1,000.00'],
  ['home', 'EGP', '', ''],
  ['step', '2026-10-24', 'Rent', 'EGP −2,000.00'],
  ['horizon', '70', '', ''],
];
/** One under zero throughout, whose axis is cut at its top. */
const UNDER = [
  ['opening', '2026-10-14', 'Cash now', 'EGP −500,000.00'],
  ['home', 'EGP', '', ''],
  ['step', '2026-10-24', 'Rent', 'EGP −20,000.00'],
  ['horizon', '70', '', ''],
];

const axisRow = (word: string) => ['axis', word, '', ''];
const planOf = (rows: readonly (readonly string[])[]): ForecastPlan => {
  const m = forecastModel(rows)!;
  return forecastPlan(m, scenario(m, baseKnobs(m)), null);
};
const htmlOf = (rows: readonly (readonly string[])[]): string =>
  toHTML(parse(['```forecast', ...rows.map((r) => r.join(' | ')), '```'].join('\n'), { page: true }));

test('a block that says nothing is fitted, and `zero` is the one other word the model hears', () => {
  assert.equal(forecastModel(HIGH)!.axis, 'fit');
  assert.equal(forecastModel([...HIGH, axisRow('zero')])!.axis, 'zero');
  assert.equal(forecastModel([...HIGH, axisRow('fit')])!.axis, 'fit');
  assert.equal(forecastModel([...HIGH, axisRow('wide')])!.axis, 'fit', 'a word the record would refuse draws the board\'s axis');
});

test('A WALK FAR ABOVE ZERO STILL STANDS ON ZERO: the foot is nought, nothing is cut, and the name says nothing of it', () => {
  const m = forecastModel(HIGH)!;
  const plan = planOf(HIGH);
  assert.equal(plan.lo, 0, 'an area\'s foot is zero or it misleads');
  assert.equal(plan.cut, false);
  const foot = plan.axis.at(-1)!;
  assert.equal(foot.zero, true, 'the foot is zero');
  assert.ok(!foot.cut, 'and carries no break');
  assert.equal(foot.label, forecastFigure(m, 0, 'axis'));
  assert.equal(foot.at, '1', 'at the very bottom');
  assert.ok(plan.axis.every((a) => !a.cut), 'no end is cut');
  assert.equal(plan.foot, '');
  assert.doesNotMatch(plan.sentence, /The axis (starts|stops)/u);
});

test('`axis: zero` holds nought however far the walk is from it, and nothing is cut', () => {
  const plan = planOf([...HIGH, axisRow('zero')]);
  assert.equal(plan.lo, 0);
  assert.ok(plan.axis.some((a) => a.zero), 'zero is a level');
  assert.equal(plan.axis.at(-1)!.zero, true, 'and it is the foot');
  assert.equal(plan.cut, false);
  assert.equal(plan.foot, '');
  assert.ok(plan.axis.every((a) => !a.cut));
  assert.doesNotMatch(plan.sentence, /The axis starts/u);
});

test('a walk that crosses zero holds it under both words, and neither is cut', () => {
  for (const rows of [CROSSING, [...CROSSING, axisRow('zero')]]) {
    const plan = planOf(rows);
    assert.ok(plan.lo < 0 && plan.hi > 0, 'the axis spans the crossing');
    assert.ok(plan.axis.some((a) => a.zero));
    assert.equal(plan.cut, false);
    assert.equal(plan.foot, '');
  }
});

test('a walk under zero throughout has zero at its top, and the block saying zero changes nothing', () => {
  const m = forecastModel(UNDER)!;
  const plan = planOf(UNDER);
  assert.equal(plan.hi, 0);
  assert.equal(plan.cut, false);
  assert.equal(plan.axis[0]!.zero, true, 'the top is zero');
  assert.equal(plan.axis[0]!.label, forecastFigure(m, 0, 'axis'));
  assert.equal(plan.foot, '');
  const held = planOf([...UNDER, axisRow('zero')]);
  assert.equal(held.hi, 0);
  assert.equal(held.cut, false);
});

test('axisFit holds zero when asked, over a band it would otherwise fit', () => {
  assert.ok(axisFit(31_000, 34_000).lo > 0, 'fitted, a band of £31k to £34k starts above zero');
  const held = axisFit(31_000, 34_000, undefined, true);
  assert.equal(held.lo, 0);
  assert.ok(held.levels.includes(0));
  assert.ok(held.hi >= 34_000);
  assert.equal(axisFit(-34_000, -31_000, undefined, true).hi, 0, 'and from under, its top');
});

test('THE STRING DRAWER DRAWS NO BREAK, on any walk: zero is the axis\'s own tick', () => {
  for (const rows of [HIGH, [...HIGH, axisRow('zero')], CROSSING, UNDER]) {
    const plan = planOf(rows);
    const html = htmlOf(rows);
    assert.equal(plan.cut, false, `nothing is cut (${rows[0]![3]})`);
    assert.doesNotMatch(html, /data-cut=""|forecast-axis-break/u);
    assert.equal(html.includes(`>${FORECAST_AXIS_BREAK}</span>`), false);
    assert.match(html, /<li class="forecast-axis-tick" data-zero="" style="--at:[\d.]+">/u, 'zero has its tick');
  }
});

test('THE WHAT-IF IS HELD IN MEMORY ONLY: nothing reaches the address or the browser\'s storage', () => {
  for (const file of ['../svelte/Forecast.svelte', '../svelte/forecast-group.svelte.ts']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|location\.(hash|search|href)|searchParams|goto\(/u, `${file} writes no what-if anywhere`);
  }
});

test('COMING BACK DRAWS THE HOST\'S VALUES: a group goes with its last walk, and the next visit starts at rest', async () => {
  /* `$state` IS SVELTE'S, compiled away in a component; the registry needs only the plain object it wraps here. */
  const g = globalThis as { $state?: <T>(v: T) => T };
  const had = g.$state;
  g.$state = <T>(v: T): T => v;
  try {
    const { groupNamed, leaveGroup } = await import('../svelte/forecast-group.svelte.ts');
    const first = groupNamed('cash-ahead');
    first.knobs.late = 30;
    first.knobs.spend = { EGP: 5_000 };
    first.members.EGP = { heavy: [], pairs: [], sells: [] } as unknown as (typeof first.members)[string];
    assert.equal(groupNamed('cash-ahead'), first, 'while a walk is drawn, its group is held');
    leaveGroup('cash-ahead', 'EGP');
    const again = groupNamed('cash-ahead');
    assert.notEqual(again, first, 'the page left, the group went');
    assert.equal(again.knobs.late, 0, 'and the next visit draws money in on time, as the host walked it');
    assert.deepEqual(again.knobs.spend, {});
    leaveGroup('cash-ahead', 'EGP');
  } finally {
    if (had === undefined) delete g.$state;
    else g.$state = had;
  }
});
