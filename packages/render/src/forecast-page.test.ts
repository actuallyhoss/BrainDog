/**
 * The forecast as a page reads it: the answer over the chart (the cash at the horizon, the lowest point and what took
 * it there, everyday spending a month), the lowest point said on the line, every movement marked and listed in order,
 * and the walk if income stopped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baseKnobs, forecastModel, forecastNext, forecastPlan, forecastSummary, hasIncome, knobsMoved, lowFoot, scenario, FORECAST_NEXT_MOST } from './forecast.ts';
import { toHTML } from './html.ts';
import { parse } from './parse.ts';

const rows = (src: string) =>
  src
    .trim()
    .split('\n')
    .map((l) => l.split('|').map((c) => c.trim()));

const SOURCE = `
opening | 2026-10-27 | Cash now | EGP 500,000.00
home | EGP |  |
spent | 3 | 2026-07..2026-09 | EGP 40,000.00
step | 2026-10-31 | Salary | EGP 200,000.00
step | 2026-11-03 | Everyday spending | EGP −9,230.77
step | 2026-11-25 | Premium | EGP −15,000.00
step | 2026-11-30 | Salary | EGP 200,000.00
step | 2027-01-13 | House, part 3 of 36 | EGP −531,765.00
of | House |  |
horizon | 91 |  |
`;
const WALK = rows(SOURCE);

test('THE SUMMARY SAYS THE CASH AT THE HORIZON AND ITS CHANGE, THE LOWEST POINT AND WHAT TOOK IT THERE, AND EVERYDAY SPENDING', () => {
  const model = forecastModel(WALK)!;
  const shown = scenario(model, baseKnobs(model));
  const [end, low, everyday] = forecastSummary(model, shown);
  assert.equal(end!.label, 'Cash on 26 Jan 2027', 'the day the chart ends, its year said because it is not this one');
  assert.match(end!.figure.replaceAll(' ', ' '), /344,004/u);
  assert.match(end!.note.replaceAll(' ', ' '), /^from .*500,000 today · −/u, 'the change from today, signed');
  assert.equal(end!.dir, 'out');
  assert.equal(low!.label, 'Lowest');
  assert.equal(low!.note, 'on 13 Jan 2027, after House, part 3 of 36', 'the lowest day and the part of the plan that took it there');
  assert.equal(everyday!.key, 'everyday');
  assert.match(everyday!.figure.replaceAll(' ', ' '), /40,000/u);
  assert.equal(everyday!.note, 'a month, the average of Jul to Sep');
});

test('THE LOWEST POINT IS SAID ON THE LINE, hung under the numbered part beside it, and not where the lowest is today', () => {
  const model = forecastModel(WALK)!;
  const shown = scenario(model, baseKnobs(model));
  const plan = forecastPlan(model, shown);
  assert.ok(plan.lowLabel);
  assert.equal(plan.lowLabel.drop, true, 'the part of the plan is numbered on the same day');
  const rising = forecastModel(rows('opening | 2026-10-27 | Cash now | EGP 1,000.00\nstep | 2026-10-28 | Pay | EGP 500.00\nhorizon | 30 |  |'))!;
  assert.equal(forecastPlan(rising, scenario(rising, baseKnobs(rising))).lowLabel, null, 'the lowest is today, which today says');
  const html = toHTML(parse(`\`\`\`forecast\n${SOURCE.trim()}\n\`\`\``, { page: true }));
  assert.match(html, /<span class="forecast-low-label num" data-side="end" data-drop=""(?: data-foot="")? style="[^"]*" aria-hidden="true"><span class="forecast-low-word">Lowest<\/span>/u);
  assert.match(html, /<dl class="forecast-summary"><div class="forecast-sum" data-key="end">/u);
});

test('EVERY MOVEMENT IS A DOT ON THE LINE AND A ROW OF THE LIST, money in apart from money out, everyday spending one line', () => {
  const model = forecastModel(WALK)!;
  const shown = scenario(model, baseKnobs(model));
  const plan = forecastPlan(model, shown);
  assert.equal(plan.marks.in.split('M').length - 1, 2, 'two salaries');
  assert.equal(plan.marks.out.split('M').length - 1, 1, 'the premium; the part of the plan has its number instead');
  const next = forecastNext(model, shown, plan);
  assert.deepEqual(
    next.rows.map((r) => (r.everyday ? 'everyday' : `${r.n ?? '·'} ${r.label}`)),
    ['everyday', '· Salary', '· Premium', '· Salary', '1 House, part 3 of 36'],
  );
  assert.equal(next.more, 0);
});

test('THE LIST NAMES THE SOONEST FEW AND KEEPS EVERY NUMBERED PART, the rest left to Every movement', () => {
  const fees = Array.from({ length: 12 }, (_, i) => `step | 2026-11-${String(i + 1).padStart(2, '0')} | Fee ${i + 1} | EGP −10.00`).join('\n');
  const model = forecastModel(rows(`opening | 2026-10-27 | Cash now | EGP 9,000.00\n${fees}\nstep | 2026-12-20 | Car, part 2 of 9 | EGP −500.00\nof | Car |  |\nhorizon | 91 |  |`))!;
  const shown = scenario(model, baseKnobs(model));
  const next = forecastNext(model, shown, forecastPlan(model, shown));
  assert.equal(next.rows.length, FORECAST_NEXT_MOST + 1, 'the soonest eight, and the part of the plan the line numbers');
  assert.equal(next.more, 4);
  const last = next.rows.at(-1)!;
  assert.ok(!last.everyday && last.n === 1);
});

test('IF INCOME STOPPED IS THE SAME WALK WITH EVERY MOVEMENT OF MONEY IN LEFT OUT, and is a knob that moved', () => {
  const model = forecastModel(WALK)!;
  assert.ok(hasIncome(model));
  const knobs = { ...baseKnobs(model), noIncome: true };
  assert.ok(knobsMoved(model, knobs));
  const shown = scenario(model, knobs);
  assert.ok(
    shown.steps.every((s) => s.delta <= 0),
    'no salary in the walk',
  );
  assert.ok(shown.crossed, 'and without them the plan takes it under');
  assert.equal(scenario(model, baseKnobs(model)).crossed, null);
  const none = forecastModel(rows('opening | 2026-10-27 | Cash now | EGP 1,000.00\nstep | 2026-11-01 | Rent | EGP −100.00\nhorizon | 30 |  |'))!;
  assert.equal(hasIncome(none), false, 'a walk with nothing coming in has nothing to stop');
});

test('THE LOWEST POINT\'S WORDS THAT HANG PAST THE PLOT\'S FOOT SAY SO, so the month names go under them (audit of 31 October, A23)', () => {
  assert.equal(lowFoot(0.5, false), false, 'a dot halfway down has room under it');
  assert.equal(lowFoot(0.96, false), true, 'a dot at the foot does not');
  assert.equal(lowFoot(0.7, true), true, 'nor one with a numbered disc over its words, near the foot');
  const model = forecastModel(WALK)!;
  const plan = forecastPlan(model, scenario(model, baseKnobs(model)));
  const dot = Number(plan.lowLabel!.y);
  assert.equal(plan.lowLabel!.foot === true, lowFoot(dot, plan.lowLabel!.drop === true));
});
