/**
 * A metric as a DOCUMENT, which is the thing that was missing.
 *
 * `08-METRICS` §2 specifies the whole declaration and the implementation was a twelve-case `switch`
 * with `const KILN = 1` inside it. That is why there was exactly one project page — a second one
 * meant a thirteenth case — and why `stat` was unusable on any page an agent writes: every figure
 * it could show was a branch in a function an agent cannot reach.
 *
 * What is asserted here is that moving them changed no number, that the two required fields really
 * are required, and that the link is derived rather than typed beside the predicate.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { METRICS } from './declared.ts';
import { format, hrefFor, isTemplate, meetsTarget, read, windowMs, withParam, type MetricDecl } from './metrics.ts';
import { applyFilters, metric } from './api.ts';
import { NOW, ROWS } from './data.ts';

/** The documents that are metrics as they stand. A template is one until it has its parameter. */
const CONCRETE = Object.entries(METRICS).filter(([, d]) => !isTemplate(d));

/** The rows a href opens, read the way the register route reads it. */
function opened(href: string): number {
  const url = new URL(href, 'http://x');
  const register = url.pathname.split('/')[2] ?? '';
  const filters = url.searchParams.getAll('f').map((raw) => {
    const [field = '', op = 'is', values = ''] = raw.split(':');
    return { field, op, values: decodeURIComponent(values).split(',') };
  });
  return applyFilters(register, ROWS[register] ?? [], filters).length;
}

/* ── nothing moved ───────────────────────────────────────────────────────── */

test('every declared metric reads, and none of them refuses', () => {
  for (const [id, decl] of CONCRETE) {
    const r = read(decl);
    assert.deepEqual(r.refusals, [], `${id}: ${r.refusals[0]}`);
    assert.notEqual(r.value, null, `${id} read nothing`);
  }
});

test('THE FIGURES ARE THE ONES THE SWITCH PRODUCED', () => {
  // Ported, not rewritten: if a number here changes, a page changed and somebody has to say why.
  for (const [id, want] of [
    ['owed-to-you', 'GBP 28,320.00'],
    ['due-30d', 'GBP 26,690.00'],
    ['overdue', 'GBP 10,540.00'],
    ['renews-30d', '6'],
    ['lapsing', '1'],
    ['estate-year', 'GBP 2,906.80'],
    /* The three project figures, now read through the parameter rather than through three documents
       with the name typed into each. Same numbers as the `kiln-*` documents they replace. */
    ['project-open:Kiln', '5'],
    ['project-owed:Kiln', 'GBP 4,050.00'],
    ['project-cost:Kiln', 'GBP 1,036.00'],
  ] as const) {
    assert.equal(metric(id).value, want, `${id} moved`);
  }
});

test('the annualised ones are annualised, through the lookup and not by hand', () => {
  // `cost` is per CYCLE, so a yearly domain and a monthly bucket are two different units. That
  // factor was written out longhand in one metric and omitted from another, and Kiln's annual cost
  // came out 9.25 times too low — GBP 112.00 against a true GBP 1,036.00, under the word "year".
  const kiln = read(withParam(METRICS['project-cost']!, 'Kiln'));
  const raw = (ROWS.services ?? [])
    .filter((e) => e.fields.thing === 1 && e.fields.state !== 'cancelled')
    .reduce((a, e) => a + Number(e.fields.cost ?? 0), 0);
  assert.ok(kiln.value !== null && kiln.value > raw * 2, `${kiln.value} is not an annualised figure`);
});

/* ── the two required fields ─────────────────────────────────────────────── */

test('A NUMBER WITH NO TARGET IS DECORATION, and one with no window cannot be acted on', () => {
  // 08 §2.2, in bold, and it says every dashboard product makes them optional. Both are refused
  // with that sentence rather than defaulted.
  const base = METRICS.overdue!;
  const noTarget = { ...base, target: undefined } as unknown as MetricDecl;
  const noWindow = { ...base, window: undefined } as unknown as MetricDecl;
  assert.match(read(noTarget).refusals[0] ?? '', /decoration/);
  assert.match(read(noWindow).refusals[0] ?? '', /cannot act on/);
  for (const bad of [noTarget, noWindow]) assert.equal(read(bad).value, null, 'a refused metric still produced a figure');
});

test('a window that is not a window is refused, and says what one looks like', () => {
  const r = read({ ...METRICS.overdue!, window: 'a month' });
  assert.ok(r.refusals.length);
  assert.match(r.refusals[0] ?? '', /30d/);
  assert.equal(windowMs('30d'), 30 * 86_400_000);
  assert.equal(windowMs('4w'), 28 * 86_400_000);
  assert.equal(windowMs('soon'), null);
});

test('a predicate the evaluator cannot read is refused by the metric, not silently emptied', () => {
  const r = read({ ...METRICS.overdue!, where: 'state is nonsense' });
  assert.ok(r.refusals.length);
  assert.match(r.refusals[0] ?? '', /no value nonsense/);
});

/* ── the link is derived ─────────────────────────────────────────────────── */

test('EVERY TILE OPENS EXACTLY THE ROWS IT COUNTED', () => {
  // The href used to be typed beside the predicate and drifted twice: a tile counting five states
  // whose link listed three, and a figure excluding cancelled services whose link included them.
  // One predicate now produces both, so they cannot disagree.
  for (const [id, decl] of CONCRETE) {
    const r = read(decl);
    assert.equal(opened(r.href), r.rows, `${id} counted ${r.rows} and opens ${opened(r.href)}`);
  }
  // And a resolved template, which is where a parameter could have escaped into the URL unencoded.
  for (const name of ['Kiln', 'Marlow & Co', 'Portage'])
    for (const base of ['project-open', 'project-owed', 'project-cost']) {
      const r = read(withParam(METRICS[base]!, name));
      assert.equal(opened(r.href), r.rows, `${base}:${name} counted ${r.rows} and opens ${opened(r.href)}`);
    }
});

test('a negation survives the URL, because the sentence grammar has one', () => {
  // Without `not-in`, `state is not cancelled` had no link that opened its own rows, and the
  // alternative — writing out the enum's complement — breaks when a pack adds a value.
  const href = hrefFor(METRICS['estate-year']!);
  assert.match(href, /not-in/);
  assert.equal(opened(href), read(METRICS['estate-year']!).rows);
});

/* ── the comparison ──────────────────────────────────────────────────────── */

test('a delta is present only when the two windows can be compared', () => {
  // §2.4's gate. Every absence carries its reason, because a comparison that is missing without one
  // reads as a comparison that came out at zero.
  for (const [id, decl] of CONCRETE) {
    const r = read(decl);
    if (r.delta === null) assert.ok(r.why.length > 8, `${id} has no delta and no reason`);
    else assert.match(r.why, /before/);
  }
});

test('a predicate with no dated clause compares a set with itself, so it reports no delta', () => {
  // The shifted window is the SAME predicate against a moved clock. Without a dated clause the two
  // sets are identical and the delta is structurally zero — a fact about the arithmetic, dressed as
  // a fact about the business.
  const r = read({ ...METRICS.lapsing!, compare: 'previous' });
  assert.equal(r.delta, null);
  assert.match(r.why, /does not mention time/);
});

test('and one that does mention time reports a real movement', () => {
  const r = read(METRICS.overdue!);
  assert.notEqual(r.delta, null, 'overdue moves with the clock and reported no delta');
});

/* ── arithmetic that must not lie ────────────────────────────────────────── */

test('a zero denominator is an em dash, never zero and never infinity', () => {
  // §2.2's last row. Zero, infinity and NaN are all figures somebody would read as a measurement.
  const r = read({
    ...METRICS.overdue!,
    value: { ratio: { of: { sum: 'amount' }, per: { count: 'nothing_here' } } },
  });
  assert.equal(r.value, null);
  assert.equal(r.shown, '—');
});

test('an average of nothing is nothing, and a sum of nothing is zero', () => {
  const empty = { ...METRICS.overdue!, where: 'state is written off, due before -9999d' };
  assert.equal(read({ ...empty, value: { avg: 'amount' } }).value, null, 'an average of no rows is not 0');
  assert.equal(read({ ...empty, value: { sum: 'amount' } }).value, 0, 'a sum of no rows is 0');
});

test('the format is declared, so one number is written the same way everywhere', () => {
  assert.equal(format('money.GBP', 480_000), 'GBP 4,800.00');
  assert.equal(format('int', 1234), '1,234');
  assert.equal(format('pct', 0.185), '18.5%');
  assert.equal(format('days', 92.6), '93 days');
  assert.equal(format('money.GBP', null), '—');
});

test('the target decides the tone, in both directions', () => {
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { lte: 100 } }, 50), true);
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { lte: 100 } }, 150), false);
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { gte: 100 } }, 150), true);
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { lte: 100 } }, null), null);
});

/* ── the point of the exercise ───────────────────────────────────────────── */

test('A SECOND PROJECT PAGE IS A DECLARATION, NOT A THIRTEENTH CASE', () => {
  // The whole argument for the file. Three documents, differing by one clause, and a project page's
  // figures exist without a line of new code.
  const project = (name: string): MetricDecl => ({
    metric: `x-${name}`,
    name: 'Owed to you',
    source: 'register.obligations',
    where: `state is open or part, direction is owed to me, thing is ${name}`,
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 1_000_000 },
    window: '30d',
    compare: 'none',
  });
  for (const name of ['Kiln', 'Portage', 'Tallow']) {
    const r = read(project(name), NOW);
    assert.deepEqual(r.refusals, [], `${name}: ${r.refusals[0]}`);
    assert.equal(opened(r.href), r.rows, `${name} link does not open its own rows`);
  }
  // And a project that does not exist is refused rather than reported as zero.
  const gone = read(project('Atlantis'), NOW);
  assert.ok(gone.refusals.length, 'a metric over a project that does not exist read as nothing');
});
