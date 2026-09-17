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
import { mixedFix } from './money.ts';
import { BARE, currenciesRead, format, hrefFor, isTemplate, meetsTarget, read, spokenWindow, targetLine, unreadable, windowMs, withParam, type MetricDecl } from './metrics.ts';
import { applyFilters, metric } from './api.ts';
import { NOW, REGISTERS, ROWS } from './data.ts';
import { amountOf } from './money.ts';

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
    ['owed-to-you', 'GBP 29,250.00'],
    ['due-30d', 'GBP 28,340.00'],
    ['overdue', 'GBP 10,540.00'],
    ['renews-30d', '6'],
    ['lapsing', '1'],
    ['estate-year', 'GBP 2,906.80'],
    /* The three project figures, now read through the parameter rather than through three documents
       with the name typed into each. Same numbers as the `kiln-*` documents they replace. */
    /* Seven since Work split the specimen page into steps, two of them Kiln's. */
    ['project-open:Kiln', '7'],
    ['project-owed:Kiln', 'GBP 4,980.00'],
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
    .reduce((a, e) => a + (amountOf(e.fields.cost) ?? 0), 0);
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

test('A FIXED DATE IS A DATE CLAUSE THAT DOES NOT MOVE, so it is not "no change" either', () => {
  /* The gate asked whether any clause was a DATE clause. `due before 2026-10-01` is one, and it
     resolves to the same day however far the clock is wound back, so the shifted window matched
     the same rows, the delta came out structurally zero, and the tile read GBP 103,430.00 · no
     change on the 30 days before. A set compared with itself, printed as a fact about the
     business. The question is whether the RESOLVED predicate moves, not whether it is dated. */
  const fixed: MetricDecl = {
    metric: 'due-by-october',
    name: 'Due before October',
    source: 'register.obligations',
    where: 'due before 2026-10-01',
    value: { sum: 'amount' },
    format: 'money.GBP',
    target: { lte: 1 },
    window: '30d',
  };
  const r = read(fixed);
  assert.equal(r.value, 10_436_000, 'the figure itself is not what changed');
  assert.equal(r.delta, null, `a fixed date reported a movement of ${r.delta}`);
  assert.match(r.why, /moves nothing/);
  assert.match(r.unmeasured ?? '', /fixed date/, 'the person under the figure is told nothing about why');

  /* AND THE RELATIVE FORM OF THE SAME SENTENCE STILL COMPARES, which is what says the gate has not
     simply been closed on every dated predicate. */
  const relative = read({ ...fixed, metric: 'due-by-today', where: 'due before today' });
  assert.notEqual(relative.delta, null, 'a predicate that does move with the clock lost its delta');
  assert.match(relative.why, /before/);
});

/* ── the comparison is against the window it names ───────────────────────── */

/** A clock, at the noon every temporal literal in this record is measured from. */
const at = (day: string): number => Date.parse(`${day}T12:00:00Z`);

/** The predicate for the two tests below: a moving window, so all three clocks read a different set. */
const WINDOWED: MetricDecl = {
  metric: 'due-in-the-window',
  name: 'Due in the window',
  source: 'register.obligations',
  where: 'due after -400d, due before today',
  value: { sum: 'amount' },
  format: 'money.GBP',
  target: { lte: 1 },
  window: '30d',
};

test('`year_ago` READS LAST YEAR, and it used to read last month', () => {
  /* `08 §2` publishes three comparison words and the record's declaration validator admits all
     three. This build's union carried two, and the branch sent everything that was not `none` down
     the same `now minus window` arm, so a tile labelled *against the same period last year* was
     reading the previous THIRTY DAYS. It said nothing about it either: the comparability gate is
     correctly implemented and passes, so `why` named the comparison, `unmeasured` was `null` and
     `delta` was a number, with nothing on the screen disagreeing with anything else on it. The
     kernel's evaluator carried the same union, so the two engines agreed by both being wrong, which
     is the one kind of disagreement a differential pass cannot see.

     THREE CLOCKS, AND THREE DIFFERENT FIGURES, because two windows cannot tell the two words apart:
     that is how the drift survived a file with a comparison gate in it. The clock is late 2027 so
     that a year before it still lands inside the seed's own ten months of obligations. */
  const now = at('2027-11-15');
  const alone = (clock: number): number | null => read({ ...WINDOWED, compare: 'none' }, clock).value;

  const current = alone(now);
  const lastMonth = alone(now - 30 * 86_400_000);
  const lastYear = alone(at('2026-11-15'));
  assert.ok(current !== null && lastMonth !== null && lastYear !== null, 'a window this test needs read nothing');
  assert.equal(new Set([current, lastMonth, lastYear]).size, 3, 'three windows that are not three figures prove nothing');

  const previous = read({ ...WINDOWED, compare: 'previous' }, now);
  const yearAgo = read({ ...WINDOWED, compare: 'year_ago' }, now);

  assert.equal(previous.value, current, 'the two words read the same current window');
  assert.equal(yearAgo.value, current);
  assert.equal(previous.delta, (current - lastMonth) / Math.abs(lastMonth), '`previous` stopped reading the previous window');
  assert.equal(yearAgo.delta, (current - lastYear) / Math.abs(lastYear), '`year_ago` was computed as `previous`, so it read last month');
  assert.notEqual(yearAgo.delta, previous.delta, 'two comparison words that always agree are one word');

  // And the sentence under the figure says which comparison it is, or the label is the old bug.
  assert.equal(previous.why, 'on the 30 days before');
  assert.equal(yearAgo.why, 'against the same period last year');
  assert.equal(yearAgo.unmeasured, null);
});

test('and a year is calendar arithmetic, so the anniversary of 29 February is the 28th', () => {
  /* A YEAR IS NOT A FIXED NUMBER OF MILLISECONDS. `resolveDay` resolves `+1m` by the calendar and
     clamps the day of the month, because rolling 31 January into 3 March is not what anybody means
     by a month; a year is twelve of those. Noon on 29 February 2028 minus `365 * DAY_MS` is 1 MARCH
     2027, and letting `Date.UTC` roll the impossible 29 February 2027 forward lands there too. The
     record's answer is 28 February 2027.

     `eom` IS WHAT MAKES THE DIFFERENCE VISIBLE in a fixture with no 29 February in it: end of month
     at 28 February 2027 is that day, and at 1 March 2027 it is the 31st, which is three more
     obligations. So the clamped clock reports a movement and both of the wrong ones report none. */
  const leap: MetricDecl = { ...WINDOWED, metric: 'due-by-month-end', where: 'due before eom' };
  const now = at('2028-02-29');

  const anniversary = read({ ...leap, compare: 'none' }, at('2027-02-28')).value;
  const rolled = read({ ...leap, compare: 'none' }, at('2027-03-01')).value;
  const current = read({ ...leap, compare: 'none' }, now).value;
  assert.ok(anniversary !== null && rolled !== null && current !== null);
  assert.notEqual(anniversary, rolled, 'this fixture cannot tell the two candidate days apart, so the test below proves nothing');

  const yearAgo = read({ ...leap, compare: 'year_ago' }, now);
  assert.equal(yearAgo.delta, (current - anniversary) / Math.abs(anniversary), 'the anniversary of 29 February is 28 February, not 1 March');
  assert.notEqual(yearAgo.delta, 0, 'a rolled or 365-day clock reads the same rows twice and reports no change');
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

/* ── what the document asked for and this build cannot do ────────────────── */

test('A TARGET THIS BUILD CANNOT COMPARE IS REFUSED, not compared anyway', () => {
  // `docs/08` writes `target: { lte: { amount, currency } }` three times. An object compared with
  // `<=` is neither true nor false, so the tile printed `target ≤ GBP NaN` under a warn glyph — a
  // tone that is a fact about NaN, not about the business — and refused nothing. That is the exact
  // class this file exists to prevent, happening inside it.
  const r = read({ ...METRICS.overdue!, target: { lte: { amount: 400_000, currency: 'GBP' } } as never });
  assert.ok(r.refusals.length, 'an object target was accepted');
  assert.match(r.refusals[0] ?? '', /number in the figure/);
  assert.equal(r.shown, '—');
});

test('an aggregation this build does not read is NAMED, and does not throw', () => {
  // `08` §2.2 publishes eleven and six are implemented. The other five reached the field picker as
  // `undefined` and threw a TypeError — which a page then reported as "this block's filter was not
  // understood", with the filter perfectly fine.
  for (const value of [{ median: 'amount' }, { last: 'amount' }, { delta: 'amount' }, { running: { sum: 'amount' } }, { trend: 'amount' }]) {
    const r = read({ ...METRICS.overdue!, value: value as never });
    assert.ok(r.refusals.length, `${Object.keys(value)[0]} was accepted`);
    assert.match(r.refusals[0] ?? '', /this build reads/);
  }
});

test('and inside a ratio too, on either side', () => {
  for (const pair of [{ of: { median: 'amount' }, per: { count: 'id' } }, { of: { sum: 'amount' }, per: { trend: 'x' } }]) {
    const r = read({ ...METRICS.overdue!, value: { ratio: pair } as never });
    assert.ok(r.refusals.length);
    assert.match(r.refusals[0] ?? '', /value\.(of|per)/);
  }
});

test('a grouping the register cannot answer is named, and one it can is read', () => {
  // `group_by` and `bucket` are `08` §2.1, read as the record reads them: a field the list does not
  // have, or a bucket with nothing to cut, is said rather than answered with the ungrouped figure.
  for (const extra of [{ group_by: 'kind' }, { bucket: 'month' }, { group_by: 'due' }, { group_by: 'state', bucket: 'month' }]) {
    const r = read({ ...METRICS.overdue!, ...extra } as never);
    assert.ok(r.refusals.length, `${JSON.stringify(extra)} was ignored`);
  }
  const r = read({ ...METRICS.overdue!, group_by: 'due', bucket: 'month' } as never);
  assert.deepEqual(r.refusals, []);
  assert.equal(r.value, read(METRICS.overdue!).value, 'the figure is still the whole');
  assert.equal(r.groups!.reduce((n, g) => n + (g.value ?? 0), 0), r.value);
});

test('SNAPSHOT IS READ, because remembering a figure daily does not change the figure', () => {
  /* `08 §2.6`: `snapshot:` arms a daily schedule that writes the reading into a series. The kernel
     reads it, and `cash-now` ships with one, so refusing it here printed "cannot be worked out" over
     the one figure the Money page leads with. */
  const plain = read(METRICS.overdue!);
  const kept = read({ ...METRICS.overdue!, snapshot: { grain: 'day', into: 'series.overdue' } } as never);
  assert.deepEqual(kept.refusals, []);
  assert.equal(kept.value, plain.value);
});

test('a format this build cannot write is refused rather than printing the bare number', () => {
  const r = read({ ...METRICS.overdue!, format: 'duration' });
  assert.ok(r.refusals.length);
  assert.match(r.refusals[0] ?? '', /money\.<CUR>/);
});

test('and everything the record actually ships still reads', () => {
  for (const [id, decl] of CONCRETE) assert.deepEqual(read(decl).refusals, [], `${id} broke`);
  for (const name of ['Kiln', 'Portage'])
    for (const base of ['project-open', 'project-owed', 'project-cost'])
      assert.deepEqual(read(withParam(METRICS[base]!, name)).refusals, [], `${base}:${name} broke`);
});

/* ── figures that were quietly short ─────────────────────────────────────── */

test('A FACTOR THE TABLE DOES NOT HOLD IS A REFUSAL, not a smaller number', () => {
  /* `operand` answered `null` for a row whose `by` value has no entry, `aggregate` filtered those
     nulls out of the sum, and the tile printed a figure short by however many rows fell through —
     with `rows` still counting them, so nothing on screen disagreed with anything else. A `by`
     naming a field the table knows nothing about read GBP 0.00 over fourteen rows with no refusal
     at all. The kernel refuses the identical declaration with `LOOKUP_MISSING`. */
  const out = read({
    metric: 'yearly',
    name: 'Annualised',
    source: 'register.services',
    where: 'state is live',
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'kind' }] } },
    target: { lte: 500_000 },
    window: '90d',
    compare: 'none',
    format: 'money.GBP',
  });
  assert.equal(out.value, null, 'a figure with no factors read as a number');
  assert.ok(out.refusals.length > 0, 'and said nothing about it');
  assert.match(out.why, /no factor for/);
});

test('and the sentence names the values, because "unreadable" is not actionable', () => {
  const out = read({
    metric: 'yearly',
    name: 'Annualised',
    source: 'register.services',
    where: 'state is live',
    value: { sum: { product: ['cost', { lookup: 'per_year', by: 'kind' }] } },
    target: { lte: 500_000 },
    window: '90d',
    compare: 'none',
  });
  assert.match(out.why, /per_year\./);
});

test('DISTINCT COUNTS VALUES, not the string `[object Object]`', () => {
  /* `String({ amount, currency })` is `'[object Object]'`, so every money value in a register
     collapsed to ONE distinct value — three invoices of different amounts counted as one — and a
     row with no value contributed `''` as a value of its own. Absent is not a value. */
  const out = read({
    metric: 'amounts',
    name: 'How many different amounts',
    source: 'register.obligations',
    value: { distinct: 'amount' },
    target: { gte: 1 },
    window: '30d',
    compare: 'none',
  });
  const priced = new Set(
    (ROWS.obligations ?? []).filter((e) => e.fields.amount !== undefined && e.fields.amount !== null).map((e) => JSON.stringify(e.fields.amount)),
  );
  assert.equal(out.value, priced.size);
  assert.ok(priced.size > 1, 'the fixture must hold more than one amount for this to mean anything');
});

/** One aggregation over one register, as a document, so a test reads like a declaration. */
const over = (source: string, value: MetricDecl['value']): MetricDecl => ({
  metric: `${source}-${JSON.stringify(value)}`,
  name: 'A figure',
  source: `register.${source}`,
  value,
  target: { gte: 1 },
  window: '30d',
  compare: 'none',
});

/** Rows of a register that CARRY a field. `''` is what this build's copy writes where the record writes nothing. */
const carrying = (source: string, field: string): number =>
  (ROWS[source] ?? []).filter((e) => e.fields[field] !== undefined && e.fields[field] !== null && e.fields[field] !== '').length;

test('A COUNT COUNTS ROWS THAT HAVE A VALUE, whatever type the value is', () => {
  /* `count` was routed through `operand`, which is `amountOf`, which is `null` for every string.
     So `count: 'note'` read 0 where the record reads 5, and `count: 'due'` and `count: 'state'`
     read 0 over thirty-eight rows that carry both. Nothing refused: the reading came back
     `rows: 38`, `shown: "0"`, and under a `target: { lte: 5 }` it rendered as a figure meeting its
     target, in green. It bit `text`, `enum`, `day`, `instant` and `document`. */
  for (const [source, field] of [
    ['obligations', 'note'],
    ['obligations', 'due'],
    ['obligations', 'state'],
    ['services', 'provider'],
  ] as const) {
    const r = read(over(source, { count: field }));
    assert.deepEqual(r.refusals, [], `count: ${field} on ${source} refused`);
    assert.equal(r.value, carrying(source, field), `count: ${field} on ${source} did not count the rows that carry it`);
    assert.ok((r.value ?? 0) > 0, `count: ${field} on ${source} read nothing over ${r.rows} rows`);
  }

  // The record's own numbers, so a change in what a count means shows up as a number and not only
  // as a property.
  assert.equal(read(over('obligations', { count: 'note' })).value, 5, 'five obligations carry a note');
  assert.equal(read(over('obligations', { count: 'due' })).value, 40, 'every obligation is dated');
  assert.equal(read(over('services', { count: 'provider' })).value, 16, 'every service names a provider');

  // And `id` is still the row count, which is the one spelling that always worked.
  assert.equal(read(over('obligations', { count: 'id' })).value, (ROWS.obligations ?? []).length);
});

test('DISTINCT DOES NOT COUNT THE EMPTY STRING, because the record never stores one', () => {
  /* The skip was `undefined` and `null` only, under a comment arguing that `''` is a value because
     it is one to SQLite. True of SQLite, and not true of this record: the write path drops `''`
     before anything is stored, so the register the kernel reads holds none and every distinct came
     out off by exactly the `''` bucket: `note` on obligations 6 against 5, `points_at` on
     services 11 against 10. */
  for (const [source, field, want] of [
    ['obligations', 'note', 5],
    ['services', 'points_at', 10],
    ['people', 'note', 4],
  ] as const) {
    const blanks = (ROWS[source] ?? []).filter((e) => e.fields[field] === '').length;
    assert.ok(blanks > 0, `${source}.${field} has no blank rows, so this proves nothing`);
    assert.equal(read(over(source, { distinct: field })).value, want, `distinct: ${field} on ${source} counted the blank`);
  }
});


/* -- showing nothing, and having nothing to show ------------------------- */

test('A FIGURE WITH NO COMPARISON SAYS WHY, and one that was told not to compare says nothing', () => {
  /* `19 §6`: a surface showing nothing must never be indistinguishable from a surface with nothing
     to show. Three of the four tiles on the money page carried no movement and no explanation —
     which reads as "this has not moved" — while every one of them declares a window. */
  const base = {
    metric: 'test',
    name: 'Test',
    source: 'register.obligations',
    value: { sum: 'amount' },
    target: { lte: 1 },
    window: '30d',
  } as const;

  /* A PREDICATE THAT MENTIONS NO DATE CANNOT MOVE OVER A WINDOW, and the reason a person needs is
     that nothing here is dated — not that "the predicate does not mention time". */
  const undated = read({ ...base, where: 'state is open', compare: 'previous' });
  assert.equal(undated.delta, null);
  assert.ok(undated.unmeasured, 'a figure with no comparison explained nothing');
  assert.ok(!/predicate/.test(undated.unmeasured), 'the schema is talking about itself on a tile');

  /* AND `compare: 'none'` IS NOT A MISSING COMPARISON. A declaration that says not to compare is
     working exactly as written, and saying so on every render would be noise on every such tile. */
  const asked = read({ ...base, where: 'state is open', compare: 'none' });
  assert.equal(asked.delta, null);
  assert.equal(asked.unmeasured, null, 'a figure declared not to compare was reported as unmeasured');
});

test('WHAT GOOD LOOKS LIKE IS A SENTENCE, not an inequality', () => {
  /* `target ≤ GBP 20,000.00` under *Owed to you* reads as an instruction to be owed less, and
     `target ≤ GBP 0.00` under *Overdue to pay* — the commonest shape there is — means "none", not
     "at most nothing". `≤` and `≥` are also two glyphs a person cannot type and half will read as
     "less than". */
  /* AND "WATCH OVER" WAS NOT ONE. It reads as the verb phrase — supervise — and at the boundary it
     argued with itself: `/decide` printed `Open questions · 3 · watch over 3 · ✓`, the same number
     twice with a verb between them, ticked, over a target that allows exactly three. */
  const under = targetLine({ format: 'money.GBP', target: { lte: 2_000_000 } } as MetricDecl);
  assert.equal(under, 'no more than GBP 20,000.00');
  assert.equal(targetLine({ format: 'money.GBP', target: { lte: 0 } } as MetricDecl), 'should be nothing');
  assert.equal(targetLine({ format: 'int', target: { gte: 3 } } as MetricDecl), 'at least 3');
  assert.equal(targetLine({ format: 'money.GBP', target: { gte: 0 } } as MetricDecl), 'never below zero');
  for (const said of [under, targetLine({ format: 'int', target: { gte: 3 } } as MetricDecl)])
    assert.ok(!/[≤≥]/.test(said), `a glyph nobody types: ${said}`);
});

/* ── money and bare numbers, which is mixed too ──────────────────────────── */

test('A METRIC REFUSES TO SUM MONEY WITH A UNITLESS NUMBER', () => {
  /* `money.ts`'s `total()` has guarded this by name since it was written — "quietly reading the bare
     ones as the currency of the others is the same failure wearing a different hat" — and
     `forecast.ts` guards it again, because a leg pointing at a `duration` field once poured
     seventeen thousand seconds into a sterling walk and moved the crossing day. `metrics.ts` was the
     third summing site and the only one that did not: it collected the non-null currencies, so a set
     of size one passed however many unitless numbers were summed into it. */
  const rows = [
    { seq: 1, register: 'obligations', fields: { amount: { amount: 100_00, currency: 'GBP' } } },
    { seq: 2, register: 'obligations', fields: { amount: 4200 } },
  ] as unknown as Parameters<typeof currenciesRead>[0];

  const seen = currenciesRead(rows, { sum: 'amount' });
  assert.ok(seen.size > 1, 'a sum of money and a bare number was not called mixed');
  assert.ok(seen.has('GBP'));
  assert.ok(seen.has(BARE));
  /* AND THE SENTENCE SAYS SO. `mixedFix` is what the tile prints instead of a figure, and the
     marker has to read as English there rather than as a currency code. */
  assert.match(mixedFix([...seen].sort()), /no currency/);
});

test('and a blank field is absent, not unitless', () => {
  /* `null` and `undefined` are a row somebody left empty, and `amountOf` skips them. Counting them
     as bare would refuse every metric over a field anybody has not filled in yet — which is most
     fields on most days. */
  const rows = [
    { seq: 1, register: 'obligations', fields: { amount: { amount: 100_00, currency: 'GBP' } } },
    { seq: 2, register: 'obligations', fields: { amount: null } },
    { seq: 3, register: 'obligations', fields: {} },
  ] as unknown as Parameters<typeof currenciesRead>[0];

  const seen = currenciesRead(rows, { sum: 'amount' });
  assert.deepEqual([...seen], ['GBP'], 'an empty field was read as a unit mismatch');
});


/* ── a figure over an empty list is not good news ────────────────────────── */

/**
 * THE STATE OF THE FIRST HOUR, which nothing had ever measured.
 *
 * `meetsTarget` is `value <= target.lte`, so `0 <= 2000000` is true — and on a record with nothing
 * in it every money tile carried a tick labelled *good*. Four of them on `/p/money`, on the screen
 * somebody sees the hour they install the product, reporting their finances healthy on the strength
 * of no data at all. Both usability passes before the one that found it could not reach an empty
 * record in a browser, which is why it survived six audits.
 *
 * `19 §6` names five empty states and says collapsing them is the failure. This is the collapse
 * nothing had looked for: `no-data-yet` reading as `cleared`.
 *
 * The register is emptied and put back, because the distinction being asserted is exactly the one
 * between a predicate that matched nothing and a list that holds nothing — and no fixture can stand
 * in for it: the whole bug was that the code could not tell them apart.
 */
const withEmpty = (register: string, run: () => void) => {
  const kept = ROWS[register];
  ROWS[register] = [];
  try {
    run();
  } finally {
    ROWS[register] = kept!;
  }
};

test('a reading knows how many rows the list HOLDS, not only how many matched', () => {
  for (const decl of Object.values(METRICS)) {
    if (isTemplate(decl)) continue;
    const register = decl.source.replace(/^register\./, '');
    if (!ROWS[register]) continue;
    const reading = read(decl as MetricDecl, NOW);
    assert.equal(reading.held, ROWS[register]!.length, `${decl.metric}: held is not the list's own count`);
    assert.ok(reading.rows <= reading.held, `${decl.metric}: matched more rows than the list holds`);
  }
});

test('a tile over an empty list carries no verdict, and says which list is empty', () => {
  withEmpty('obligations', () => {
    for (const decl of Object.values(METRICS)) {
      if (isTemplate(decl) || decl.source !== 'register.obligations') continue;
      const tile = metric(decl.metric);
      assert.equal(tile.tone, undefined, `${decl.metric}: an empty list still reports "${tile.tone}"`);
      assert.match(tile.note, /^Nothing in .+ yet\.$/, `${decl.metric}: the note is "${tile.note}"`);
    }
  });
});

test('and the same tile with rows under it does carry one', () => {
  /* THE OTHER HALF, or the assertion above is satisfied by a build that never tones anything. */
  const toned = Object.values(METRICS)
    .filter((d) => !isTemplate(d) && d.source === 'register.obligations')
    .map((d) => metric(d.metric).tone);
  assert.ok(toned.length > 0, 'no obligations metric was reachable to check');
  assert.ok(
    toned.every((t) => t === 'good' || t === 'warn' || t === 'bad'),
    `a figure over thirty-eight rows reports no verdict: ${JSON.stringify(toned)}`,
  );
});

test('nothing MATCHED on a list that HAS rows is still good news', () => {
  /**
   * THE DIRECTION `held` WAS INTRODUCED FOR, AND THE ONE NOTHING TESTED.
   *
   * Zero matched is a real answer — nothing overdue, on thirty-eight obligations, is the good news
   * the figure exists to deliver — and zero HELD is not an answer at all. A build reading `rows`
   * where it should read `held` silences the first, which is the whole reason the two are separate
   * fields.
   *
   * The first version of this picked `overdue`, which on the seed matches TWO rows and reads GBP
   * 10,540. Its premise was false, so swapping `held` for `rows` changed nothing and the test
   * stayed green through the exact substitution it was written to catch. No shipped metric has
   * `rows === 0` with `held > 0`, so the state has to be made: the register keeps its rows and the
   * predicate is narrowed to one no row can satisfy.
   */
  const decl = Object.values(METRICS).find((d) => d.source === 'register.obligations' && 'lte' in d.target && d.target.lte === 0);
  assert.ok(decl, 'the seed declares no obligations metric with a target of nothing');

  const kept = ROWS.obligations!;
  try {
    /* Rows that exist and cannot match: the state field carries a value the predicate never asks
       for, so `held` stays 38 and `rows` falls to 0. */
    ROWS.obligations = kept.map((e) => ({ ...e, fields: { ...e.fields, state: 'paid' } }));
    const narrowed = { ...decl, where: 'state is open' } as MetricDecl;
    const reading = read(narrowed, NOW);
    assert.equal(reading.rows, 0, 'the predicate was supposed to match nothing');
    assert.ok(reading.held > 0, 'the register was supposed to keep its rows');
    assert.equal(meetsTarget(narrowed, reading.value), true, 'nothing owed is on the right side of "should be nothing"');

    /**
     * AND THE TILE, WHICH IS WHERE THE GUARD LIVES.
     *
     * The first version of this asserted on `read()` and `meetsTarget()` and never called
     * `metric()` — so swapping `held` for `rows` in `api.ts`, the exact substitution this test is
     * named for, left the whole suite green. The declaration is put into `METRICS` under its own id
     * so the tile can be asked for it, because a guard nothing reaches is a guard nothing tests.
     */
    const probe = 'probe-nothing-matched';
    (METRICS as Record<string, MetricDecl>)[probe] = { ...narrowed, metric: probe };
    try {
      const tile = metric(probe);
      assert.ok(
        tile.tone === 'good' || tile.tone === 'warn',
        `zero MATCHED on a list that holds rows reported no verdict: ${JSON.stringify(tile)}`,
      );
      assert.doesNotMatch(tile.note, /^Nothing in /, `a full list was described as empty: ${tile.note}`);
    } finally {
      delete (METRICS as Record<string, MetricDecl>)[probe];
    }
  } finally {
    ROWS.obligations = kept;
  }

  /* And on the seed as it stands, the same metric still carries a verdict rather than a shrug. */
  const tone = metric(decl.metric).tone;
  assert.ok(tone === 'good' || tone === 'warn', `a figure over thirty-eight rows reports "${tone}"`);
});

/* ── the words under every figure in the product ─────────────────────────── */

test('a target is a sentence somebody would say, and it is right at the boundary', () => {
  const line = (target: { lte: number } | { gte: number }, format?: string) =>
    targetLine({ format, target } as MetricDecl);

  assert.equal(line({ lte: 0 }), 'should be nothing');
  assert.equal(line({ lte: 3 }, 'int'), 'no more than 3');
  assert.equal(line({ gte: 90 }, 'int'), 'at least 90');
  /* "watch over 3" under the figure `3`, ticked, was on `/decide` — the same number twice with a
     verb between them, and wrong about the boundary either way you read it. */
  assert.doesNotMatch(line({ lte: 3 }, 'int'), /watch/);
  assert.equal(meetsTarget({ target: { lte: 3 } } as MetricDecl, 3), true, 'lte means the bound is allowed');
});

test('a window is said in words, not in the dialect it is declared in', () => {
  assert.equal(spokenWindow('30d'), '30 days');
  assert.equal(spokenWindow('1d'), '1 day');
  assert.equal(spokenWindow('4w'), '4 weeks');
  assert.equal(spokenWindow('3m'), '3 months');
  assert.equal(spokenWindow('1y'), '1 year');
  /* Anything it cannot improve it leaves alone, for the same reason `saidPlainly` does: half a
     sentence in English and half in the dialect is worse than either. */
  assert.equal(spokenWindow('rolling'), 'rolling');
});

test('every shipped metric declares a window this can say', () => {
  for (const decl of Object.values(METRICS))
    assert.match(decl.window, /^\d{1,4}[dwmy]$/, `${decl.metric}: window "${decl.window}" is not one this can put in a sentence`);
});

test('A SUM OF A DAY, OR A SUM, AVERAGE, MINIMUM OR MAXIMUM OF A WORD, IS REFUSED, as the record refuses it', () => {
  /* The kernel refuses these at install and at run (`VALUE_MALFORMED`): SQLite reads `2026-07-28` as
     2026 inside sum() and avg(), and min() and max() hand back text. This build read them through
     `amountOf`, which skips text, so the figure came back as a sum of nothing with no refusal. */
  const fields = REGISTERS.obligations!.fields;
  const day = fields.find((f) => f.type === 'day')!.id;
  const word = fields.find((f) => f.type === 'text' || f.type === 'enum')!.id;
  const number = fields.find((f) => f.type === 'money' || f.type === 'int' || f.type === 'decimal')!.id;
  for (const value of [{ sum: day }, { avg: word }, { sum: word }, { max: word }] as MetricDecl['value'][]) {
    const r = read({ ...METRICS.overdue!, value });
    assert.equal(r.value, null, JSON.stringify(value));
    assert.match(r.refusals[0] ?? '', /reads a number/, JSON.stringify(value));
    assert.match(unreadable({ ...METRICS.overdue!, value }).join(), /reads a number/, `${JSON.stringify(value)} would install`);
  }
  /* Inside a ratio, on either side, and through a product. */
  assert.match(read({ ...METRICS.overdue!, value: { ratio: { of: { count: 'id' }, per: { sum: day } } } }).refusals[0] ?? '', /reads a number/);
  /* AN AVERAGE DAY IS A DAY, as the record reads it, so two of them subtract into days. */
  assert.deepEqual(read({ ...METRICS.overdue!, value: { diff: { of: { avg: day }, per: { avg: day } } } }).refusals, []);
  assert.equal(read({ ...METRICS.overdue!, value: { diff: { of: { avg: day }, per: { avg: day } } } }).value, 0);
  assert.match(read({ ...METRICS.overdue!, value: { sum: { product: [day, { lookup: 'x', by: word }] } } }).refusals[0] ?? '', /reads a number/);

  /* A COUNT OR A DISTINCT OF ANY FIELD IS STILL A NUMBER, and so is a sum of a number field. */
  for (const value of [{ count: day }, { distinct: word }, { sum: number }, { min: number }] as MetricDecl['value'][])
    assert.deepEqual(read({ ...METRICS.overdue!, value }).refusals, [], JSON.stringify(value));

  /* AND THE EARLIEST OR THE LATEST DAY IS A DAY, as the record keeps it: whole days since 1970, drawn as one. */
  const earliest = read({ ...METRICS.overdue!, value: { min: day }, format: 'day' });
  assert.deepEqual(earliest.refusals, []);
  assert.match(earliest.shown, /^\d{1,2} [A-Z][a-z]{2}$/u);
});

test('A FRACTIONAL FACTOR ROUNDS PER ROW, as the record does, so the two engines agree to the penny', () => {
  /* `every-month-out` takes a third of a quarterly bill and a twelfth of a yearly one. Summed then
     rounded it read £10,416.17 here and £10,416.16 on a record. */
  assert.equal(metric('every-month-out').value, 'GBP 10,416.16');
});

test('A NOTE THAT ONLY SAYS NOUGHT IS NOT SAID: a clause whose figures are all 0 goes, in both engines', async () => {
  const { noteOf } = await import('./metrics.ts');
  const zero = format('int', 0);
  assert.equal(zero, '0');
  const figures: Record<string, string> = { agents: zero, later: zero, overdue: '2', big: '1,200' };
  const said = (id: string) => figures[id] ?? null;
  assert.equal(noteOf('{{agents}} with an agent, {{later}} kept for later', said), '');
  assert.equal(noteOf('{{agents}} with an agent, {{overdue}} kept for later', said), '2 kept for later');
  assert.equal(noteOf('{{overdue}} past their date, {{big}} in all', said), '2 past their date, 1,200 in all');
  assert.equal(noteOf('to check, or blocked', said), 'to check, or blocked');
  assert.equal(noteOf('{{agents}} of them by an agent', said), '');
});
