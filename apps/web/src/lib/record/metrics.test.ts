/**
 * A metric as a DOCUMENT, and what this app says about one.
 *
 * `08-METRICS` §2 specifies the whole declaration, and the record reads it: the kernel works the figure out and hands
 * back a reading. What is held here is the app's half, which is the words: the format a number is written in, the
 * sentence a target is said as, the window in English, the door a tile opens, and a tile drawn from the record's
 * reading of each figure the seed declares.
 *
 * THE ARITHMETIC IS NOT TESTED HERE. The browser kept its own copy of the evaluator and this file held that copy to
 * the record's answers; the copy is gone, and the kernel's own
 * tests hold the figures.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MISSING } from 'braindog-render';

import { METRICS } from './declared.ts';
import { mixedFix } from './money.ts';
import { BARE, currenciesRead, format, hrefFor, isTemplate, meetsTarget, spokenWindow, targetLine, unreadable, windowMs, type MetricDecl } from './metrics.ts';
import { metric } from './fixtures/readers.ts';
import { REGISTERS } from './held.ts';
/* THE SAMPLE'S LISTS, which a live tab learns from the record and the refusal test below asks the mirror about. */
import './fixtures/fill.ts';

/** The documents that are metrics as they stand. A template is one until it has its parameter. */
const CONCRETE = Object.entries(METRICS).filter(([, d]) => !isTemplate(d));

/* ── nothing moved ───────────────────────────────────────────────────────── */

test('every declared metric is drawn from what the record read, and none of them is a gap', () => {
  for (const [id] of CONCRETE) assert.notEqual(metric(id).value, MISSING, `${id}: ${metric(id).note}`);
});

test('THE FIGURES ARE THE ONES THE SWITCH PRODUCED', () => {
  // Ported, not rewritten: if a number here changes, a page changed and somebody has to say why.
  /* MOVED BY money-core 3.0.0: repeating money lives in `recurring` alone, so the Kiln storefront payout
     (GBP 930.00 owed to you, on Kiln) and the studio rent (GBP 1,650.00 due inside thirty days) are no longer bills. */
  for (const [id, want] of [
    ['owed-to-you', 'GBP 28,320.00'],
    ['due-30d', 'GBP 26,690.00'],
    ['overdue', 'GBP 10,540.00'],
    ['renews-30d', '6'],
    ['lapsing', '1'],
    ['estate-year', 'GBP 2,906.80'],
    /* The three project figures, now read through the parameter rather than through three documents
       with the name typed into each. Same numbers as the `kiln-*` documents they replace. */
    /* Seven since Work split the specimen page into steps, two of them Kiln's. */
    ['project-open:Kiln', '7'],
    ['project-owed:Kiln', 'GBP 4,050.00'],
    ['project-cost:Kiln', 'GBP 1,036.00'],
  ] as const) {
    assert.equal(metric(id).value, want, `${id} moved`);
  }
});

test('a window is a count and a unit, and anything else is no window', () => {
  assert.equal(windowMs('30d'), 30 * 86_400_000);
  assert.equal(windowMs('4w'), 28 * 86_400_000);
  assert.equal(windowMs('soon'), null);
});

/* ── the link is derived ─────────────────────────────────────────────────── */

test('a negation survives the URL, because the sentence grammar has one', () => {
  // Without `not-in`, `state is not cancelled` had no link that opened its own rows, and the
  // alternative — writing out the enum's complement — breaks when a pack adds a value.
  const href = hrefFor(METRICS['estate-year']!)!;
  assert.match(href, /not-in/);
});

/* ── the words a figure is said in ───────────────────────────────────────── */

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

test('WHAT GOOD LOOKS LIKE IS WHAT A PERSON SAYS, not an inequality', () => {
  /* An inequality under *Owed to you* reads as an instruction to be owed less, and one of zero under *Overdue to pay*,
     the commonest shape there is, means "none". The two glyphs are also ones a person cannot type. A round figure
     drops its zero fraction, and stays code first for the screen's `symbolText` to redraw. */
  const under = targetLine({ format: 'money.GBP', target: { lte: 2_000_000 } } as MetricDecl);
  assert.equal(under, 'Limit GBP 20,000');
  assert.equal(targetLine({ format: 'money.GBP', target: { lte: 2_000_050 } } as MetricDecl), 'Limit GBP 20,000.50');
  assert.equal(targetLine({ format: 'money.GBP', target: { lte: 0 } } as MetricDecl), 'None expected');
  assert.equal(targetLine({ format: 'int', target: { gte: 3 } } as MetricDecl), 'At least 3');
  assert.equal(targetLine({ format: 'money.GBP', target: { gte: 0 } } as MetricDecl), 'Keep above GBP 0');
  for (const said of [under, targetLine({ format: 'int', target: { gte: 3 } } as MetricDecl)])
    assert.ok(!/[≤≥]/.test(said), `a glyph nobody types: ${said}`);
});

test('A LIMIT BESIDE ITS FIGURE SAYS NOTHING WHILE IT IS KEPT, and how far over once it is not', () => {
  /* "Limit 5" under Kiln's 2 open was a rule nobody broke, said on every glance. */
  assert.equal(targetLine({ format: 'int', target: { lte: 5 } } as MetricDecl, 2), '');
  assert.equal(targetLine({ format: 'int', target: { lte: 5 } } as MetricDecl, 5), '', 'right at the limit is within it');
  assert.equal(targetLine({ format: 'int', target: { lte: 5 } } as MetricDecl, 8), '3 over your limit');
  assert.equal(targetLine({ format: 'money.GBP', target: { lte: 0 } } as MetricDecl, 0), '');
  assert.equal(targetLine({ format: 'money.GBP', target: { lte: 2_000_000 } } as MetricDecl, 2_015_050), 'GBP 150.50 over your limit');
  /* A FLOOR IS STILL SAID AS ONE, and with no figure a limit is said as the rule. */
  assert.equal(targetLine({ format: 'int', target: { gte: 3 } } as MetricDecl, 1), 'At least 3');
  assert.equal(targetLine({ format: 'int', target: { lte: 5 } } as MetricDecl), 'Limit 5');
  assert.equal(targetLine({ format: 'int', target: { lte: 5 } } as MetricDecl, null), 'Limit 5');
});

/* ── money and bare numbers, which is mixed too ──────────────────────────── */

test('A METRIC REFUSES TO SUM MONEY WITH A UNITLESS NUMBER', () => {
  /* `money.ts`'s `total()` has guarded this by name since it was written — "quietly reading the bare
     ones as the currency of the others is the same failure wearing a different hat". `currenciesRead`
     is the other place this app asks it, and it collected the non-null currencies, so a set of size
     one passed however many unitless numbers were summed into it. */
  const rows = [
    { seq: 1, register: 'obligations', fields: { amount: { amount: 100_00, currency: 'GBP' } } },
    { seq: 2, register: 'obligations', fields: { amount: 4200 } },
  ] as unknown as Parameters<typeof currenciesRead>[0];

  const seen = currenciesRead(rows, { sum: 'amount' });
  assert.ok(seen.size > 1, 'a sum of money and a bare number was not called mixed');
  assert.ok(seen.has('GBP'));
  assert.ok(seen.has(BARE));
  /* AND THE SENTENCE SAYS SO. `mixedFix` is what the tile prints instead of a figure, and the
     marker has to read as English there rather than as a currency code.

     READ OFF `BARE` RATHER THAN TYPED, because a word typed into a test is a fourth copy of the
     word the sample and the record had already drifted on: this line said `/no currency/` and would
     have gone red for the repair that made the two agree with the kernel, which is a test failing
     at the change it exists to permit. `money.test.ts` is where the spelling itself is pinned. */
  assert.ok(mixedFix([...seen].sort()).includes(BARE), 'the sentence does not name the rows with no unit');
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


/* ── a figure over a list with rows in it has a verdict ──────────────────── */

test('a tile over a list with rows under it carries a verdict', () => {
  /* THE HALF OF THE EMPTY-LIST RULE THIS FILE CAN REACH. A tile over a list that holds nothing carries no tick
     (`engines.test.ts`, on a real reading), and a build that never tones anything would satisfy that; this is the
     assertion that it does tone a list with rows in it. */
  /* A VERDICT NEEDS A TARGET, AND A MONEY CEILING STARTS EMPTY since money-core 3.0.0 (`MONEY_TARGET_SETTINGS`): empty
     is no target, so until a person types a sum those figures have nothing to be judged against and carry no tone. The
     rest still must, over the same rows. */
  const bounded = (d: MetricDecl) => {
    const target = (d.target ?? {}) as { lte?: unknown; gte?: unknown };
    return typeof target.lte === 'number' || typeof target.gte === 'number';
  };
  const over = Object.values(METRICS).filter((d) => !isTemplate(d) && d.source === 'register.obligations');
  const toned = over.filter(bounded).map((d) => [d.metric, metric(d.metric).tone] as const);
  assert.ok(toned.length > 0, 'no obligations metric with a target was reachable to check');
  assert.ok(
    toned.every(([, t]) => t === 'good' || t === 'warn' || t === 'bad'),
    `a figure over a list with rows in it reports no verdict: ${JSON.stringify(toned)}`,
  );
  const untargeted = over.filter((d) => !bounded(d)).map((d) => [d.metric, metric(d.metric).tone] as const);
  assert.ok(untargeted.length > 0, 'every obligations figure has a target again, so the empty ceiling is not checked');
  assert.ok(untargeted.every(([, t]) => t === undefined), `a figure nobody set a target for carries a verdict: ${JSON.stringify(untargeted)}`);
});

/* ── the words under every figure in the product ─────────────────────────── */

test('a target is a sentence somebody would say, and it is right at the boundary', () => {
  const line = (target: { lte: number } | { gte: number }, format?: string) =>
    targetLine({ format, target } as MetricDecl);

  assert.equal(line({ lte: 0 }), 'None expected');
  assert.equal(line({ lte: 3 }, 'int'), 'Limit 3');
  /* A FLOOR ABOVE ZERO IS "AT LEAST", because ninety meets a target of ninety and "Keep above 90" would call it a miss. */
  assert.equal(line({ gte: 90 }, 'int'), 'At least 90');
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

test('A SUM OF A DAY, OR A SUM, AVERAGE OR MAXIMUM OF A WORD, is caught before it would install, as the record refuses it', () => {
  /* The kernel refuses these at install and at run (`VALUE_MALFORMED`): SQLite reads `2026-07-28` as
     2026 inside sum() and avg(), and min() and max() hand back text. `unreadable` is what a draft says
     before it is sent, so it has to name the same figures the record would refuse. */
  const fields = REGISTERS.obligations!.fields;
  const day = fields.find((f) => f.type === 'day')!.id;
  const word = fields.find((f) => f.type === 'text' || f.type === 'enum')!.id;
  for (const value of [{ sum: day }, { avg: word }, { sum: word }, { max: word }] as MetricDecl['value'][])
    assert.match(unreadable({ ...METRICS.overdue!, value }).join(), /reads a number/, `${JSON.stringify(value)} would install`);
});

test('an aggregation or a format this build does not say is NAMED before it would install', () => {
  for (const value of [{ median: 'amount' }, { last: 'amount' }, { trend: 'amount' }])
    assert.match(unreadable({ ...METRICS.overdue!, value: value as never }).join(), /this build reads/, JSON.stringify(value));
  assert.match(unreadable({ ...METRICS.overdue!, value: { ratio: { of: { median: 'amount' }, per: { count: 'id' } } } as never }).join(), /value\.of/);
  assert.match(unreadable({ ...METRICS.overdue!, format: 'duration' }).join(), /money\.<CUR>/);
  assert.deepEqual(unreadable(METRICS.overdue!), [], 'a figure the record ships was named as unreadable');
});

test('A FRACTIONAL FACTOR ROUNDS PER ROW, as the record does, and the tile says the record’s penny', () => {
  /* `every-month-out` takes a third of a quarterly bill and a twelfth of a yearly one. It reads `recurring` since
     money-core 3.0.0, where the VAT is a third of GBP 7,420.00 and the accountant a twelfth of GBP 1,450.00, each a third
     of a penny over. Summed then rounded it reads £10,692.17, and the record rounds each row and reads £10,692.16. */
  assert.equal(metric('every-month-out').value, 'GBP 10,692.16');
});

test('A NOTE THAT ONLY SAYS NOUGHT IS NOT SAID: a clause whose figures are all 0 goes', async () => {
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

test('a figure that is a day is said as one, with its year only when that is not the year it is', () => {
  const now = Date.UTC(2026, 9, 7, 12);
  const days = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  assert.equal(format('day', days('2026-10-30'), now), '30 Oct');
  assert.equal(format('day', days('2027-01-04'), now), '4 Jan 2027');
  assert.equal(format('day', days('2025-12-31'), now), '31 Dec 2025');
  /* THE SAME DAY WHICHEVER WAY IT ARRIVES: the day itself, or an instant on it. */
  assert.equal(format('day', '2026-10-30', now), '30 Oct');
  assert.equal(format('day', '2027-01-04T00:00:00.000Z', now), '4 Jan 2027');
  assert.equal(format('day', String(days('2026-10-30')), now), '30 Oct', 'whole days written as text are still whole days');
  assert.equal(format('day', null, now), '—');
  assert.equal(format('day', 'soon', now), 'soon', 'text that is no day is said as it came, never as a date made up for it');
  /* A number that arrives as text is the number, under every other format. */
  assert.equal(format('int', '1234', now), '1,234');
});
