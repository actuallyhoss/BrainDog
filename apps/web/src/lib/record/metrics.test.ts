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
import { BARE, currenciesRead, format, hrefFor, isTemplate, meetsTarget, read, spokenWindow, targetLine, windowMs, withParam, type MetricDecl } from './metrics.ts';
import { applyFilters, metric } from './api.ts';
import { NOW, ROWS } from './data.ts';
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

test('a published key this build ignores is named, because ignoring it changes the figure', () => {
  // `group_by` and `bucket` are `08` §2.1; `snapshot` is §2.6. Ignored, they returned the UNGROUPED
  // figure under a heading that says it is grouped, with no refusal and a `good` tone.
  for (const extra of [{ group_by: 'kind' }, { bucket: 'month' }, { snapshot: { grain: 'day', into: 'series.x' } }]) {
    const r = read({ ...METRICS.overdue!, ...extra } as never);
    assert.ok(r.refusals.length, `${Object.keys(extra)[0]} was ignored`);
    assert.match(r.refusals[0] ?? '', /not read by this build/);
  }
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

test('nothing overdue on a list that HAS rows is still good news', () => {
  /* The distinction stated the other way round: zero matched is a real answer, and this must not
     have become "no data" when the fix went in. `overdue` is `lte: 0`, so an empty match is the
     good case, and a build that read `rows === 0` instead of `held === 0` would silence it. */
  const decl = Object.values(METRICS).find((d) => d.source === 'register.obligations' && 'lte' in d.target && d.target.lte === 0);
  if (!decl) return;
  const reading = read(decl as MetricDecl, NOW);
  assert.ok(reading.held > 0, 'the seed has no obligations, so this proves nothing');
  assert.equal(metric(decl.metric).tone, reading.value === 0 ? 'good' : 'warn');
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
