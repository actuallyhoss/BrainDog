/**
 * A forecast that knows what an ordinary month costs: the `spent` and `known` rows the web writes from a walk whose
 * everyday spending the record measured (`forecastRows`, `measuredRows`), and what today's renderer makes of them.
 *
 * THE WALK IS SHAPED AS THE KERNEL ANSWERS IT (`Runway`, `Everyday`, `Step.kind`): money in on the first of the month,
 * a week's share of pounds spent every seventh day, and what the leg measured beside it. It goes through `blockOf`
 * whole, which is how the live page reads it, so the measure reaching `forecastRows` is the one `walkOf` keeps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forecastModel, forecastPlan, scenario, baseKnobs } from 'braindog-render';
import './fixtures/fill.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';

const NOW = Date.UTC(2026, 9, 13, 12);
const TODAY = '2026-10-13';

type Step = { day: string; label: string; delta: number; balance: number; source: string; spoken: string; kind?: 'everyday' };
type Measured = { currency: string | null; months: string[]; spent: number; planned: number; monthly: number; why?: string };

/** £5,000.00 coming in on 1 November and £300.00 of everyday spending each week to the horizon. */
function stepsOf(everyday = true): Step[] {
  const steps: Step[] = [{ day: '2026-11-01', label: 'Invoice paid', delta: 500_000, balance: 0, source: 'lines', spoken: 'lines#1' }];
  if (everyday)
    for (let week = 1; week <= 12; week++) {
      const day = new Date(NOW + week * 7 * 86_400_000).toISOString().slice(0, 10);
      steps.push({ day, label: 'Everyday spending', delta: -30_000, balance: 0, source: 'moves', spoken: 'everyday', kind: 'everyday' });
    }
  steps.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  let balance = 200_000;
  for (const s of steps) s.balance = balance += s.delta;
  return steps;
}

const MEASURED: Measured = { currency: 'GBP', months: ['2026-07', '2026-08', '2026-09'], spent: 130_000, planned: 0, monthly: 130_000 };

const walkOf = (steps: Step[], everyday?: Measured[], currency = 'GBP') => ({
  from: 200_000, currency, mixed: [], steps, crossed: null, days: null, horizon: 90, refusals: [], ...(everyday ? { everyday } : {}),
});

/** The block the live page draws, with the walk as the record sent it. */
function forecastOf(walk: ReturnType<typeof walkOf>) {
  const b = blockOf(
    { kind: 'forecast', source: 'forecast.runway', heading: 'Cash ahead', horizon: 90, knobs: ['spend'], rows: [], matched: 1, refusals: [], walk },
    new Map(),
    NOW,
  );
  return b;
}

/** Every row the forecast fence holds, as the renderer reads them, and the segments beside it. */
function drawn(block: Parameters<typeof toSegments>[0]) {
  const segments = toSegments(block);
  const forecasts = segments.filter((s) => s.type === 'block' && s.kind === 'forecast') as unknown as { rows: { cells: string[] }[] }[];
  return { segments, forecasts, rows: forecasts.flatMap((f) => f.rows.map((r) => r.cells.map((c) => c.trim()))) };
}

const marked = (rows: string[][], mark: string) => rows.filter((r) => r[0] === mark);

test('THE LIVE PAGE KEEPS WHAT THE EVERYDAY LEG MEASURED ON THE WALK', () => {
  assert.deepEqual(forecastOf(walkOf(stepsOf(), [MEASURED])).walk?.everyday, [MEASURED]);
  assert.equal(forecastOf(walkOf(stepsOf(false))).walk?.everyday, undefined);
});

test('A MEASURED WALK WRITES `spent` WITH THE MONTHS COUNTED AND `known` AS THE LAST DATED MOVEMENT', () => {
  const { rows } = drawn(forecastOf(walkOf(stepsOf(), [MEASURED])));
  const [spent] = marked(rows, 'spent');
  assert.ok(spent, 'a spent row');
  assert.deepEqual(spent.slice(0, 3), ['spent', '3', '2026-07..2026-09']);
  assert.match(spent[3]!, /1,300\.00/u);
  assert.deepEqual(marked(rows, 'known'), [['known', '2026-11-01', '', '']], 'the money coming in, not the last week of spending');
  /* NO OTHER ROW MOVES: every step is still written, the everyday ones with it. */
  assert.equal(marked(rows, 'step').length, 13);
});

test('TODAY`S RENDERER OPENS THE SPEND CONTROL ON THE MEASURED MONTH AND DASHES THE LINE AFTER THE LAST KNOWN DAY', () => {
  const { rows } = drawn(forecastOf(walkOf(stepsOf(), [MEASURED])));
  const model = forecastModel(rows)!;
  /* THE SPEND CONTROL IS SET BY THE MEASURED MONTH (`spendRange`), not by the first three months ahead. */
  assert.equal(model.spent, 1300);
  assert.equal(model.known, '2026-11-01');
  const plan = forecastPlan(model, scenario(model, baseKnobs(model)));
  /* THE SOLID LINE ENDS WHERE THE DASHED ONE STARTS, on 1 November. */
  const points = (path: string) => path.split(/[ML]/u).filter((p) => p.trim()).map((p) => p.trim());
  assert.ok(points(plan.future).length > 1, 'what lies past 1 November is dashed');
  assert.equal(points(plan.walk).at(-1)?.split(' ')[0], points(plan.future)[0]?.split(' ')[0]);
  /* WITHOUT THE ROW THE LAST WEEK OF SPENDING WAS READ AS KNOWN, and only the days after it were dashed. */
  const unknown = forecastModel(rows.filter((r) => r[0] !== 'known'))!;
  const guessed = forecastPlan(unknown, scenario(unknown, baseKnobs(unknown)));
  assert.ok(points(guessed.future).length < points(plan.future).length);
});

test('A WALK WITH NO EVERYDAY LEG WRITES NEITHER ROW', () => {
  const { rows } = drawn(forecastOf(walkOf(stepsOf(false))));
  assert.deepEqual([marked(rows, 'spent'), marked(rows, 'known')], [[], []]);
});

test('A MEASURE THAT SAYS WHY IT MOVED NOTHING WRITES NEITHER ROW', () => {
  const covered = { ...MEASURED, planned: 130_000, monthly: 0, why: 'What is already planned covers the spending measured.' };
  const none = { ...MEASURED, months: [], spent: 0, monthly: 0, why: 'There is no full month to measure yet.' };
  for (const m of [covered, none]) {
    const { rows } = drawn(forecastOf(walkOf(stepsOf(false), [m])));
    assert.deepEqual([marked(rows, 'spent'), marked(rows, 'known')], [[], []], m.why);
  }
});

test('A MEASURE IN ANOTHER CURRENCY THAN THE WALK`S WRITES NEITHER ROW', () => {
  const { rows } = drawn(forecastOf(walkOf(stepsOf(), [{ ...MEASURED, currency: 'USD' }])));
  assert.deepEqual([marked(rows, 'spent'), marked(rows, 'known')], [[], []]);
});

test('ONE WALK OF A GROUP WRITES NEITHER ROW', () => {
  const pounds = walkOf(stepsOf(), [MEASURED]);
  const dollars = walkOf(stepsOf(), [{ ...MEASURED, currency: 'USD' }], 'USD');
  const block = { ...forecastOf(pounds), walk: undefined, walks: [pounds, dollars] } as unknown as Parameters<typeof toSegments>[0];
  const { forecasts, rows } = drawn(block);
  assert.equal(forecasts.length, 2);
  assert.ok(marked(rows, 'group').length === 2, 'drawn as a group');
  assert.deepEqual([marked(rows, 'spent'), marked(rows, 'known')], [[], []]);
});

test('THE BLOCK STAYS A FORECAST AND NO FENCE DEGRADES', () => {
  const { segments, forecasts } = drawn(forecastOf(walkOf(stepsOf(), [MEASURED])));
  assert.equal(forecasts.length, 1);
  assert.ok(!segments.some((s) => s.type === 'degraded'), 'a fence degraded to its source text');
  assert.ok(forecastModel(forecasts[0]!.rows.map((r) => r.cells)), 'the renderer reads the rows as a forecast');
  assert.equal(forecastModel(forecasts[0]!.rows.map((r) => r.cells))!.today, TODAY);
});
