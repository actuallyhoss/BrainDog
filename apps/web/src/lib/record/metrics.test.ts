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

import { BEFORE, comparisonOf, monthBefore } from '@braindog/kernel';
import { MISSING } from 'braindog-render';

import { METRICS } from './declared.ts';
import { mixedFix } from './money.ts';
import { BARE, currenciesRead, diffRead, format, fxNote, hrefFor, isTemplate, meetsTarget, spokenWindow, targetLine, unreadable, windowMs, type MetricDecl } from './metrics.ts';
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

test('A SUM THAT CONVERTED WHAT IT COULD SAYS AT LEAST, names the pair it lacks, and is never held to a target', () => {
  const fx = { into: 'EGP', home: 'EGP', asOf: '2026-10-01', forward: false, stale: false, missing: ['USD to EGP'] };
  const usd = { currency: 'USD', amount: 30000 };
  const least = { value: null, parts: [{ currency: 'EGP', amount: 420000 }, usd], atLeast: true as const, noRate: [usd], fx };
  const note = fxNote(least);
  assert.equal(note, 'At least EGP 4,200.00 here; no rate from USD to EGP for the rest.');
  assert.doesNotMatch(note!, /Not added up/u, 'part of it was added up, so it never says none of it was');
  /* EACH PAIR IT LACKS IS NAMED, the last after "or", because the rest has no rate from one or from the other. */
  const aed = { currency: 'AED', amount: 5000 };
  const two = { ...least, parts: [...least.parts, aed], noRate: [usd, aed], fx: { ...fx, missing: ['AED to EGP', 'USD to EGP'] } };
  assert.equal(fxNote(two), 'At least EGP 4,200.00 here; no rate from AED to EGP or USD to EGP for the rest.');
  /* A SUM NO RATE REACHED ANY OF keeps the sentence it had. */
  const none = { value: null, parts: [{ currency: 'EGP', amount: 420000 }, usd], fx: { ...fx, asOf: null } };
  assert.equal(fxNote(none), 'Not added up yet: there is no rate from USD to EGP. Add one to Exchange rates.');
  /* A LOWER BOUND IS NOT THE FIGURE, so it is neither on its target nor off it, whichever way the target runs. */
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { gte: 100 } }, 420000, least), null);
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { lte: 100 } }, 420000, least), null);
  assert.equal(meetsTarget({ ...METRICS.overdue!, target: { gte: 100 } }, 420000, {}), true, 'a figure that is not at least is held as before');
});

/* ── a difference in parts, and against the window before (REC-B19) ──────── */

/** 13 October 2026, midday: the clock and the entries of the record's own test, so both readers hold the same answers. */
const DIFF_NOW = Date.UTC(2026, 9, 13, 12);

REGISTERS.outgoings = {
  id: 'outgoings',
  name: 'Outgoings',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'on', type: 'day' },
    { id: 'amount', type: 'money', required: true },
    { id: 'refund', type: 'money' },
    { id: 'category', type: 'text' },
    { id: 'shop', type: 'text' },
  ],
} as unknown as (typeof REGISTERS)[string];

/** [category, day, amount]. What is dated after 13 September, or in August, is in neither half. */
const SPENT: [string, string, number][] = [
  ['Outing', '2026-10-02', 700], ['Outing', '2026-10-05', 700],
  ['Outing', '2026-09-03', 500], ['Outing', '2026-09-13', 500], ['Outing', '2026-09-20', 5000],
  ['Food', '2026-10-01', 300], ['Food', '2026-10-03', 300], ['Food', '2026-10-10', 400],
  ['Food', '2026-09-02', 600], ['Food', '2026-09-12', 600], ['Food', '2026-08-05', 9990],
  ['Gift', '2026-10-06', 500],
  ['Rent', '2026-09-01', 9000],
  ['Taxi', '2026-10-04', 100],
  ['Taxi', '2026-09-01', 100], ['Taxi', '2026-09-02', 100], ['Taxi', '2026-09-03', 100], ['Taxi', '2026-09-04', 100], ['Taxi', '2026-09-05', 100],
  ['Books', '2026-10-07', 200], ['Books', '2026-10-08', 200], ['Books', '2026-10-09', 200],
  ['Books', '2026-09-04', 200],
];

type Held = Parameters<typeof diffRead>[1];
const held = (spent: readonly (readonly [string, string, number, string?])[]): Held =>
  spent.map(([category, on, amount, currency = 'EGP'], i) => ({
    seq: i + 1,
    version: 1,
    created: `${on}T09:00:00.000Z`,
    by: 'p_1',
    fields: { what: `${category} ${on}`, on, amount: { amount, currency }, refund: { amount: amount / 10, currency }, category, shop: on < '2026-10-01' ? 'Old' : 'New' },
  })) as unknown as Held;

const DIFF_BASE = { source: 'register.outgoings', format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } as const;

/** This month so far less last month up to the same day number, by category. */
const VS_LAST: MetricDecl = {
  ...DIFF_BASE,
  metric: 'spent-vs-last-month',
  name: 'Spent against last month',
  where: 'on at least bom',
  value: { diff: { of: { sum: 'amount' }, per: { sum: 'amount' }, before: 'month_ago' } },
  group_by: 'category',
};

const partOf = (r: ReturnType<typeof diffRead>, key: string) => {
  const g = (r.groups ?? []).find((x) => x.key === key);
  assert.ok(g, `no part called ${key} in ${JSON.stringify(r.groups)}`);
  return g;
};

test('A DIFFERENCE GROUPED BY ONE FIELD READS EACH PART AS OF LESS PER, over the entries of that part alone', () => {
  const net: MetricDecl = { ...DIFF_BASE, metric: 'net-by-category', name: 'Net, by category', where: 'on at least bom', value: { diff: { of: { sum: 'amount' }, per: { sum: 'refund' } } }, group_by: 'category' };
  const r = diffRead(net, held(SPENT), DIFF_NOW);
  assert.deepEqual(r.refusals, []);
  assert.equal(r.value, 3600 - 360);
  assert.equal(r.unit, 'EGP');
  assert.deepEqual(
    (r.groups ?? []).map((g) => [g.key, g.value, g.rows]),
    [['Outing', 1260, 2], ['Food', 900, 3], ['Books', 540, 3], ['Gift', 450, 1], ['Taxi', 90, 1]],
  );
  /* No window before was asked for, so no part says a change and the reading carries no halves. */
  assert.ok((r.groups ?? []).every((g) => g.delta === undefined && g.halves === undefined));
  assert.equal(r.halves, undefined);

  /* THE HALVES MAY NAME THE FIELD THEMSELVES, when both name the same one, and the answer is the same. */
  const { group_by: _, ...bare } = net;
  const own = diffRead({ ...bare, value: { diff: { of: { sum: 'amount', group_by: 'category' }, per: { sum: 'refund', group_by: 'category' } } } } as never, held(SPENT), DIFF_NOW);
  assert.deepEqual(own.groups, r.groups);
});

test('AGAINST A MONTH AGO, PER IS READ OVER THE SAME WORDS AT THE CLOCK MOVED BACK, ended at that clock’s day', () => {
  const r = diffRead(VS_LAST, held(SPENT), DIFF_NOW);
  assert.deepEqual(r.refusals, []);

  /* THE WHOLE: 3,600 this month so far against 11,900 to 13 September. The 20th and August are in neither. */
  assert.equal(r.value, 3600 - 11_900);
  assert.deepEqual(r.halves, { of: 3600, per: 11_900, perRows: 11 });
  assert.equal(r.rows, 10);
  assert.equal(r.unit, 'EGP');
  /* THROUGH THE RECORD'S OWN GATE AND CLOCK, so the two cannot drift. */
  assert.deepEqual({ delta: r.delta, why: r.why }, comparisonOf({ value: 3600, rows: 10 }, { value: 11_900, rows: 11 }, true));
  assert.equal(new Date(monthBefore(DIFF_NOW)).toISOString().slice(0, 10), '2026-09-13');

  /* "Outings up 40%": 1,400 against 1,000, two entries each side. The 13th is last month's, the 20th is not. */
  const outing = partOf(r, 'Outing');
  assert.equal(outing.value, 400);
  assert.deepEqual(outing.halves, { of: 1400, per: 1000, perRows: 2 });
  assert.ok(Math.abs(outing.delta! - 0.4) < 1e-12);
  assert.equal(outing.why, '');

  /* ONLY THIS MONTH, AND ONLY LAST MONTH: the other side is nought, and the difference is still said. */
  const gift = partOf(r, 'Gift');
  assert.deepEqual([gift.value, gift.rows, gift.halves], [500, 1, { of: 500, per: 0, perRows: 0 }]);
  const rent = partOf(r, 'Rent');
  assert.deepEqual([rent.value, rent.rows, rent.halves], [-9000, 0, { of: 0, per: 9000, perRows: 1 }]);

  /* Every part either month holds, the largest difference first, and the name breaking a tie at 400. */
  assert.deepEqual((r.groups ?? []).map((g) => g.key), ['Gift', 'Books', 'Outing', 'Food', 'Taxi', 'Rent']);
});

test('EACH PART PASSES THE GATE ON ITS OWN, and a window under half the entries of the one before says no change', () => {
  const r = diffRead(VS_LAST, held(SPENT), DIFF_NOW);
  const why = (key: string): [number | null | undefined, string | undefined] => [partOf(r, key).delta, partOf(r, key).why];

  /* The whole figure passes the gate, ten entries against eleven, and these parts do not. */
  assert.notEqual(r.delta, null);
  assert.deepEqual(why('Gift'), [null, 'one of the two windows is empty']);
  assert.deepEqual(why('Rent'), [null, 'one of the two windows is empty']);
  assert.deepEqual(why('Books'), [null, 'the window before has under half the rows']);
  /* One taxi this month against five by this day last month: the first week of a month is not good news. */
  assert.deepEqual(why('Taxi'), [null, 'this window has under half the rows of the one before']);
  assert.equal(partOf(r, 'Taxi').value, 100 - 500);
  for (const g of r.groups ?? []) assert.deepEqual({ delta: g.delta, why: g.why }, comparisonOf({ value: g.halves!.of, rows: g.rows }, { value: g.halves!.per, rows: g.halves!.perRows }, true), g.key);
});

test('THE WINDOW BEFORE IS ONE OF THE RECORD’S THREE WORDS, and words that name no day move nothing', () => {
  const said = (before: string): MetricDecl => ({ ...VS_LAST, value: { diff: { of: { sum: 'amount' }, per: { sum: 'amount' }, before } } }) as never;
  /* Thirty days before 13 October is 13 September too, so `previous` under a 30d window reads the same halves. */
  assert.deepEqual(diffRead(said('previous'), held(SPENT), DIFF_NOW).halves, { of: 3600, per: 11_900, perRows: 11 });
  /* A year before holds nothing, so every part is this month's alone. */
  const year = diffRead(said('year_ago'), held(SPENT), DIFF_NOW);
  assert.deepEqual([year.value, year.halves, year.delta, year.why], [3600, { of: 3600, per: 0, perRows: 0 }, null, 'one of the two windows is empty']);

  /* A WINDOW UNDER SEVEN DAYS IS NOISE, and a window that is no window has none before it. */
  assert.equal(diffRead({ ...said('previous'), window: '3d' }, held(SPENT), DIFF_NOW).why, 'a window under seven days is noise');
  assert.match(diffRead({ ...said('previous'), window: 'a while' }, held(SPENT), DIFF_NOW).refusals.join(), /no window before/u);

  /* A WORD THE RECORD DOES NOT READ IS NAMED BEFORE IT WOULD INSTALL, and read as nothing. */
  assert.deepEqual([...BEFORE], ['previous', 'month_ago', 'year_ago']);
  assert.match(unreadable(said('last_week')).join(), /month_ago/u);
  assert.match(diffRead(said('last_week'), held(SPENT), DIFF_NOW).refusals.join(), /month_ago/u);
  assert.equal(diffRead(said('last_week'), held(SPENT), DIFF_NOW).value, null);
  assert.match(unreadable({ ...VS_LAST, group_by: 'on', bucket: 'week' }).join(), /never cut by date/u);
  assert.deepEqual(unreadable(VS_LAST), [], 'the figure the record installs was named as unreadable');

  /* WORDS THAT NAME NO DAY MOVE NOTHING: both halves are the same entries, and no change is claimed of any part. */
  const { where: _, ...undated } = VS_LAST;
  const still = diffRead(undated, held(SPENT), DIFF_NOW);
  assert.equal(still.delta, null);
  assert.match(still.why, /does not mention time/u);
  assert.ok((still.groups ?? []).every((g) => g.delta === null && g.value === 0));
});

test('TWO HALVES GROUPED BY TWO FIELDS, AND A RATIO IN PARTS, are named as the record refuses them', () => {
  const two = { ...DIFF_BASE, metric: 'two-ways', name: 'Two ways', value: { diff: { of: { sum: 'amount', group_by: 'category' }, per: { sum: 'refund', group_by: 'shop' } } } } as never;
  assert.match(unreadable(two).join(), /category and shop/u);
  assert.match(diffRead(two, held(SPENT), DIFF_NOW).refusals.join(), /category and shop/u);
  const one = { ...DIFF_BASE, metric: 'one-way', name: 'One way', value: { diff: { of: { sum: 'amount', group_by: 'category' }, per: { sum: 'refund' } } } } as never;
  assert.match(unreadable(one).join(), /category and nothing/u);
  const against = { ...DIFF_BASE, metric: 'against', name: 'Against', group_by: 'category', value: { diff: { of: { sum: 'amount', group_by: 'shop' }, per: { sum: 'refund', group_by: 'shop' } } } } as never;
  assert.match(unreadable(against).join(), /the figure by category/u);
  const share: MetricDecl = { ...DIFF_BASE, metric: 'share', name: 'Share', format: 'pct', value: { ratio: { of: { sum: 'refund' }, per: { sum: 'amount' } } }, group_by: 'category' };
  assert.match(unreadable(share).join(), /a ratio is not grouped/u);
});

test('ONE CURRENCY THIS MONTH AND ANOTHER LAST MONTH IS NO CHANGE THAT MAY BE SAID, of the whole or of a part', () => {
  const rows = held([['Food', '2026-10-02', 100, 'EGP'], ['Food', '2026-09-02', 70, 'USD'], ['Gift', '2026-09-03', 50, 'USD'], ['Taxi', '2026-10-03', 5, 'EGP']]);
  const r = diffRead(VS_LAST, rows, DIFF_NOW);

  /* E£105 now against $120 then: one amount for each currency, and never a percentage across the two. */
  assert.deepEqual([r.value, r.parts], [null, [{ currency: 'EGP', amount: 105 }, { currency: 'USD', amount: -120 }]]);
  assert.deepEqual([r.halves, r.delta, r.why], [{ of: null, per: null, perRows: 2 }, null, 'the window before has nothing to compare against']);
  const food = partOf(r, 'Food');
  assert.deepEqual([food.value, food.parts], [null, [{ currency: 'EGP', amount: 100 }, { currency: 'USD', amount: -70 }]]);
  assert.deepEqual([food.halves, food.delta], [{ of: null, per: null, perRows: 1 }, null]);
  /* A part one month alone holds is in one currency, and says it. */
  assert.deepEqual([partOf(r, 'Gift').parts, partOf(r, 'Gift').halves], [[{ currency: 'USD', amount: -50 }], { of: 0, per: 50, perRows: 1 }]);

  /* AND THE CURRENCIES A DIFFERENCE READS ARE EACH HALF'S OWN: `per` over the entries of the window before. */
  const now = rows.filter((e) => String(e.fields.on) >= '2026-10-01');
  const then = rows.filter((e) => String(e.fields.on) < '2026-10-01');
  assert.deepEqual([...currenciesRead(now, VS_LAST.value)], ['EGP'], 'one window alone holds one currency');
  assert.deepEqual([...currenciesRead(now, VS_LAST.value, then)].sort(), ['EGP', 'USD']);
});
