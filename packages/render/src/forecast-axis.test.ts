/**
 * Where a forecast's value axis starts (REC-B08 jobs 4 to 6): fitted to the walk unless the block says `axis: zero`,
 * and a fitted axis that leaves zero out says so, with a break at its end nearest zero beside the real amount and the
 * words in the chart's name. And the what-if is held in memory only, so a page come back to draws the host's walk.
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

test('FITTED WITH ZERO OFF THE AXIS IS CUT: the lowest label is the real amount, and the name says where it starts', () => {
  const m = forecastModel(HIGH)!;
  const plan = planOf(HIGH);
  assert.ok(plan.lo > 0, `the axis starts above zero, at ${plan.lo}`);
  assert.equal(plan.cut, true);
  assert.ok(plan.axis.every((a) => !a.zero), 'no level is zero');
  const foot = plan.axis.at(-1)!;
  assert.equal(foot.cut, true, 'the foot carries the break');
  assert.equal(foot.label, forecastFigure(m, plan.lo, 'axis'), 'and its label is the amount the axis starts at, not nought');
  assert.equal(foot.at, '1', 'at the very bottom');
  assert.equal(plan.axis.filter((a) => a.cut).length, 1, 'one end only');
  assert.equal(plan.foot, `The axis starts at ${forecastFigure(m, plan.lo, 'read')}.`);
  assert.ok(plan.sentence.endsWith(` ${plan.foot}`), 'the chart\'s name ends on it');
  assert.doesNotMatch(plan.foot, /—/u, 'no em dash');
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

test('a walk under zero throughout is cut at its top, the end nearest zero, unless the block holds zero', () => {
  const m = forecastModel(UNDER)!;
  const plan = planOf(UNDER);
  assert.ok(plan.hi < 0);
  assert.equal(plan.cut, true);
  assert.equal(plan.axis[0]!.cut, true, 'the top carries the break');
  assert.equal(plan.axis[0]!.label, forecastFigure(m, plan.hi, 'axis'));
  assert.equal(plan.foot, `The axis stops at ${forecastFigure(m, plan.hi, 'read')}.`);
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

test('THE STRING DRAWER AND THE MODEL AGREE ON `cut`: a break at the cut end, the words in the chart\'s name', () => {
  for (const rows of [HIGH, [...HIGH, axisRow('zero')], CROSSING, UNDER]) {
    const plan = planOf(rows);
    const html = htmlOf(rows);
    const cuts = html.match(/data-cut=""/gu)?.length ?? 0;
    assert.equal(cuts, plan.cut ? 1 : 0, `one cut tick where the model is cut, none where it is not (${rows[0]![3]})`);
    assert.equal(html.includes(`>${FORECAST_AXIS_BREAK}</span>`), plan.cut, 'the break is drawn exactly where the model says');
    if (plan.cut) assert.ok(html.includes(`aria-label="${plan.sentence.replace(/&/gu, '&amp;')}"`) && html.includes(plan.foot), 'the chart\'s name says where the axis starts');
  }
  /* THE BREAK SITS IN THE CUT TICK, BEFORE THE REAL AMOUNT, and is never a colour alone: there is a mark and a figure. */
  const m = forecastModel(HIGH)!;
  const plan = planOf(HIGH);
  const tick = /<li class="forecast-axis-tick" data-cut="" style="--at:1"><span class="forecast-axis-break" style="[^"]+">([^<]+)<\/span>([^<]+)<\/li>/u.exec(htmlOf(HIGH));
  assert.ok(tick, 'the foot tick holds the break and then its label');
  assert.equal(tick[2], forecastFigure(m, plan.lo, 'axis'));
  assert.doesNotMatch(tick[0], /color|#[0-9a-f]{3}/iu, 'the break takes the label\'s own ink');
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
