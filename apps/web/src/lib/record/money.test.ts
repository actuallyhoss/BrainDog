/**
 * Two currencies are never added.
 *
 * The rule is one line and the failure it prevents has no symptom: a sum of eight sterling invoices
 * and one euro one is a number, it is the right shape, it renders in a tile with a currency code
 * beside it, and nothing about it looks wrong. Nobody notices. So every place in this app that adds
 * money is checked here for the same thing — that it refuses rather than answers.
 *
 * The other half is the one that was live until now: a single `CURRENCY = 'GBP'` constant pinned to
 * every money field on every screen. A euro invoice would have rendered as sterling — the right
 * digits under the wrong code, on the one kind of figure somebody acts on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { currencyFor, display, metric, page, readBlock, values } from './api.ts';
import { resolverOf } from './page-live.ts';
import { PAGES } from './data.ts';
import { toSegments, walkTables } from './blocks.ts';
import { NOW, ROWS } from './data.ts';
import { amountOf, currencyOf, drawn, homeOf, merge, symbolText, total } from './money.ts';
import { fxNote, read, withFx, type MetricDecl } from './metrics.ts';
import { copy } from '../copy.ts';
import { METRICS } from './declared.ts';
import { runway } from './forecast.ts';
import type { Entry } from './schema.ts';

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const eur = (amount: number) => ({ amount, currency: 'EUR' });

/* ── the arithmetic ──────────────────────────────────────────────────────── */

/* The legs the record declares. A test that hardcoded two registers would be testing a different
   function from the one the product runs. */
const LEGS = Object.values(PAGES)
  .flatMap((p) => p.blocks)
  .find((b) => b.source === 'forecast.runway')!.from!;

test('a total of one currency is a total; a total of two is a REFUSAL', () => {
  const one = total([gbp(100), gbp(250), null, gbp(50)]);
  assert.deepEqual({ amount: one.amount, currency: one.currency, mixed: one.mixed, n: one.n }, {
    amount: 400,
    currency: 'GBP',
    mixed: [],
    n: 3,
  });

  const two = total([gbp(100), eur(250)]);
  assert.deepEqual(two.mixed, ['EUR', 'GBP'], 'two currencies were added without a word');
  assert.equal(two.currency, null, 'a mixed total claimed to be in one currency');
});

test('MONEY AND A BARE NUMBER TOGETHER IS MIXED TOO', () => {
  // It means a field changed type under a record, or a caller summed two different fields. Reading
  // the bare ones as the currency of the others is the same failure wearing a different hat.
  const t = total([gbp(100), 250]);
  assert.deepEqual(t.mixed, ['GBP']);
  // And bare numbers alone are an ordinary total: a count of days is not money.
  const plain = total([1, 2, 3]);
  assert.equal(plain.amount, 6);
  assert.equal(plain.currency, null);
  assert.deepEqual(plain.mixed, []);
});

test('an empty total is zero of nothing, not zero of sterling', () => {
  const t = total([null, undefined, '']);
  assert.equal(t.n, 0);
  assert.equal(t.currency, null);
  assert.deepEqual(t.mixed, []);
});

test('the remainder bucket carries the mix rather than swallowing it', () => {
  // Eleven sterling counterparties and one euro one, and the euro one is exactly the row that fell
  // off the bottom of the chart into "Everything else".
  const merged = merge([total([gbp(100)]), total([gbp(50)]), total([eur(900)])]);
  assert.deepEqual(merged.mixed, ['EUR', 'GBP']);
  assert.equal(merged.currency, null);
});

test('a total reads a generator once, and a generator read twice is empty', () => {
  function* once() {
    yield gbp(100);
    yield gbp(200);
  }
  assert.equal(total(once()).amount, 300);
});

test('amountOf and currencyOf read the value, not its shape', () => {
  assert.equal(amountOf(gbp(41)), 41);
  assert.equal(amountOf(41), 41);
  assert.equal(amountOf('41'), 41);
  assert.equal(amountOf(''), null);
  assert.equal(amountOf(null), null);
  assert.equal(amountOf('not a number'), null);
  assert.equal(currencyOf(gbp(41)), 'GBP');
  assert.equal(currencyOf(41), null);
  // A half-built money value is not money: an amount with no code is the thing the rule forbids.
  assert.equal(currencyOf({ amount: 41 }), null);
  assert.equal(amountOf({ amount: 41 }), null);
});

/* ── the screens ─────────────────────────────────────────────────────────── */

/**
 * Put one euro row into a register for the length of one test, then put it back.
 *
 * It COPIES A ROW THE READER ALREADY MATCHES and changes only the money, because a euro row that
 * falls outside the predicate proves nothing — the tile would read cleanly and the test would pass
 * for the wrong reason.
 */
function withEuro<T>(register: string, field: string, like: (e: Entry) => boolean, fn: () => T): T {
  const before = [...(ROWS[register] ?? [])];
  const model = before.find(like);
  assert.ok(model, `${register} has no row matching what this test is about`);
  ROWS[register] = [
    ...before,
    { ...model, seq: before.length + 1, fields: { ...model.fields, [field]: eur(123_400) } } as Entry,
  ];
  try {
    return fn();
  } finally {
    ROWS[register] = before;
  }
}

const TODAY = new Date(NOW).toISOString().slice(0, 10);

/** An open, overdue payable — which is what `overdue` and the "Owed by you" bar both read. */
const overduePayable = (e: Entry) =>
  e.fields.direction === 'owed_by_me' &&
  (e.fields.state === 'open' || e.fields.state === 'part') &&
  String(e.fields.due) < TODAY;

test('A TILE OVER TWO CURRENCIES SHOWS EACH AMOUNT IN ITS OWN, never the sum and never a blank', () => {
  const decl = METRICS.overdue;
  assert.ok(decl, 'the overdue metric is gone, so this test is vacuous');
  const clean = read(decl);
  assert.ok(clean.value !== null, 'the tile does not read at all, so parts prove nothing');

  withEuro('obligations', 'amount', overduePayable, () => {
    const out = read(decl);
    assert.equal(out.value, null, 'a sterling total and a euro row came back as one figure');
    assert.deepEqual(out.parts, [
      { currency: 'EUR', amount: 123_400 },
      { currency: 'GBP', amount: clean.value },
    ]);
    assert.equal(out.shown, `EUR 1,234.00 · ${clean.shown}`);
    assert.deepEqual(out.refusals, []);
    assert.equal(fxNote(out), copy.figureNoHome);
    /* THE TILE ON THE SCREEN is the parts and the reason. */
    const tile = metric('overdue');
    assert.equal(tile.value, out.shown);
    assert.equal(tile.note, copy.figureNoHome);
  });
});

test('WITH A HOME CURRENCY AND A RATE IT IS ONE FIGURE, converted as of the rate’s day; without the rate it names the pair', () => {
  const decl = METRICS.overdue!;
  const clean = read(decl);
  withEuro('obligations', 'amount', overduePayable, () => {
    const put = withFx(() => ({ home: 'GBP', rates: [] }));
    try {
      const lacking = read(decl);
      assert.equal(lacking.value, null);
      assert.deepEqual(lacking.fx?.missing, ['EUR to GBP']);
      assert.equal(fxNote(lacking), copy.figureNoRate('EUR to GBP'));
    } finally {
      put();
    }
    const back = withFx(() => ({ home: 'GBP', rates: [{ currency: 'EUR', base: 'GBP', rate: 0.855, as_of: '2020-01-01' }] }));
    try {
      const out = read(decl);
      /* EUR 1,234.00 at 0.855 is GBP 1,055.07, rounded once. */
      assert.equal(out.value, (clean.value ?? 0) + 105_507);
      assert.equal(out.unit, 'GBP');
      assert.equal(out.parts, undefined);
      assert.equal(out.fx?.asOf, '2020-01-01');
      assert.match(metric('overdue').note, /Converted at rates as of 1 Jan 2020\./u);
    } finally {
      back();
    }
  });
});

test('and a sum whose format disagrees with its rows is said in the rows’ currency rather than relabelled', () => {
  // `format: money.GBP` says how to WRITE the figure; the rows are what it is a figure of. Printing
  // the rows' number under the declaration's code is the quiet version of getting this wrong.
  const decl: MetricDecl | undefined = METRICS.overdue;
  assert.ok(decl, 'the overdue metric is gone');
  assert.ok(decl.format?.startsWith('money.'), 'this test needs a money-formatted metric');
  const out = read({ ...decl, format: 'money.JPY' });
  assert.equal(out.value, null);
  assert.equal(out.parts?.[0]?.currency, 'GBP');
  assert.match(out.shown, /^GBP /u);
  /* AND SO IS AN AVERAGE: the rows' own currency, as a part, never relabelled. */
  const avg = read({ ...decl, value: { avg: 'amount' }, format: 'money.JPY' });
  assert.equal(avg.value, null);
  assert.equal(avg.parts?.[0]?.currency, 'GBP');
  assert.match(avg.shown, /^GBP /u);
});

test('A BAR OVER TWO CURRENCIES IS ONE BAR A CURRENCY, each under its code', () => {
  const block = page('money')?.blocks.find((b) => b.heading === 'Where it goes, next 30 days');
  assert.ok(block, 'the bar is gone; this test is about the bar');

  withEuro('obligations', 'amount', overduePayable, () => {
    const again = page('money')?.blocks.find((b) => b.heading === 'Where it goes, next 30 days');
    const segments = toSegments(again!);
    const charts = segments.filter((seg) => 'rows' in seg) as { rows: { cells: string[] }[] }[];
    assert.equal(charts.length, 2, 'one chart a currency');
    assert.ok(charts[0]!.rows.every((r) => /^EUR /u.test(r.cells[1] ?? '')), 'the euro chart holds only euros');
    assert.ok(charts[1]!.rows.every((r) => /^GBP /u.test(r.cells[1] ?? '')), 'the sterling chart holds only pounds');
    const said = JSON.stringify(segments);
    assert.ok(said.includes(copy.inCurrency('EUR')) && said.includes(copy.inCurrency('GBP')), 'each chart says its currency');

    /* AND ONE CHART, CONVERTED, once there is a home currency and a rate. */
    const back = withFx(() => ({ home: 'GBP', rates: [{ currency: 'EUR', base: 'GBP', rate: 0.855, as_of: '2020-01-01' }] }));
    try {
      const one = toSegments(page('money')!.blocks.find((b) => b.heading === 'Where it goes, next 30 days')!);
      assert.equal(one.filter((seg) => 'rows' in seg).length, 1);
      assert.ok(JSON.stringify(one).includes(copy.figureConverted('1 Jan 2020')));
    } finally {
      back();
    }
  });
});

test('THE CASH WALK OVER TWO CURRENCIES WALKS IN THE HOME ONE, and names the rate it lacks', () => {
  withEuro('obligations', 'amount', overduePayable, () => {
    let back = withFx(() => ({ home: 'GBP', rates: [] }));
    try {
      const walk = runway(500_000, LEGS);
      assert.deepEqual(walk.steps, []);
      assert.match(walk.refusals.at(-1) ?? '', /no rate yet from EUR to GBP/u);
    } finally {
      back();
    }
    back = withFx(() => ({ home: 'GBP', rates: [{ currency: 'EUR', base: 'GBP', rate: 0.855, as_of: '2020-01-01' }] }));
    try {
      const walk = runway(500_000, LEGS);
      assert.equal(walk.currency, 'GBP');
      assert.ok(walk.steps.some((st) => st.delta === -105_507), 'the euro movement was walked in pounds');
    } finally {
      back();
    }
  });
});

test('THE CASH WALK REFUSES RATHER THAN INVENTING A CROSSING DAY', () => {
  // A crossing computed from two currencies is a real-looking date on which nothing happens.
  const clean = runway(500_000, LEGS);
  assert.ok(clean.steps.length > 0);
  assert.equal(clean.currency, 'GBP');

  withEuro('obligations', 'amount', overduePayable, () => {
    const walk = runway(500_000, LEGS);
    assert.deepEqual(walk.mixed, ['EUR', 'GBP']);
    assert.deepEqual(walk.steps, [], 'the walk added two currencies and produced a crossing anyway');
    assert.equal(walk.crossed, null);
    assert.equal(walk.days, null);
  });
});

/* ── the currency of a field ─────────────────────────────────────────────── */

test('the currency a form prints is the one the rows are in, and none when they disagree', () => {
  assert.equal(currencyFor('obligations', 'amount'), 'GBP');
  assert.equal(currencyFor('obligations', 'what'), null, 'a text field claimed a currency');
  withEuro('obligations', 'amount', overduePayable, () => {
    assert.equal(currencyFor('obligations', 'amount'), null, 'a field with two currencies picked one');
  });
});

test('and a money value renders in its OWN currency wherever it appears', () => {
  assert.equal(display('obligations', 'amount', gbp(480_000)), 'GBP 4,800.00');
  assert.equal(display('obligations', 'amount', eur(480_000)), 'EUR 4,800.00');
  // The exponent comes from the runtime's currency data, never assumed to be two.
  assert.equal(display('obligations', 'amount', { amount: 4_800, currency: 'JPY' }), 'JPY 4,800');
});

/* ── drawing an amount ──────────────────────────────────────────────────── */

test('THE HOME CURRENCY IS WRITTEN WITH ITS SYMBOL, and any other keeps its code after it', () => {
  assert.deepEqual(drawn('GBP 28,320.00', 'GBP'), { lead: '£', whole: '28,320', fraction: '.00', iso: null });
  assert.deepEqual(drawn('USD −4,800.00', 'GBP'), { lead: '−$', whole: '4,800', fraction: '.00', iso: 'USD' });
  assert.deepEqual(drawn('JPY 1,299', 'GBP'), { lead: '¥', whole: '1,299', fraction: '', iso: 'JPY' });
  assert.equal(drawn('about 12', 'GBP'), null, 'text money() did not write is not redrawn');
});

test('a sentence redraws its figures, and a currency with no symbol keeps its code in front', () => {
  assert.equal(symbolText('no more than GBP 20,000.00', 'GBP'), 'no more than £20,000.00');
  assert.equal(symbolText('was EUR 4.00', 'GBP'), 'was €4.00 EUR', 'the code stays with its amount');
  assert.equal(symbolText('costs ZZZ 12.00', 'GBP'), 'costs ZZZ 12.00');
});

test('the home currency is the one most of the money is in, and none when there is none', () => {
  assert.equal(homeOf([gbp(1), eur(1), gbp(2)]), 'GBP');
  assert.equal(homeOf([1, 'x']), null);
  assert.equal(homeOf([eur(1), gbp(1)]), 'EUR');
});

test('A CASH WALK OVER TWO CURRENCIES WITH NO RATE IS ONE WALK A CURRENCY, each under its code, and the reason said once', () => {
  const liquid = (e: Entry) => e.fields.liquid === true || e.fields.liquid === undefined;
  withEuro('accounts', 'balance', liquid, () => {
    const cash = read(METRICS['cash-now']!);
    assert.deepEqual(cash.parts?.map((p) => p.currency), ['EUR', 'GBP'], 'the opening is in two currencies, so this test is about a split walk');
    const block = page('money')?.blocks.find((b) => b.heading === 'Cash ahead');
    assert.ok(block, 'the Cash ahead forecast is gone; this test is about it');
    assert.deepEqual(block.refusals, []);
    assert.equal(block.walk, undefined, 'never one walk across two currencies');
    assert.deepEqual(block.walks?.map((w) => w.currency), ['EUR', 'GBP']);
    assert.equal(block.walks?.[0]?.from, 123_400, 'the euro walk starts from the euro part');
    assert.equal(block.walks?.[1]?.from, cash.parts?.find((p) => p.currency === 'GBP')?.amount, 'the sterling walk starts from the sterling part');
    assert.equal(block.walkNote, copy.figureNoHome);
    const text = JSON.stringify(toSegments(block));
    assert.match(text, /In EUR/u);
    assert.match(text, /In GBP/u);
  });
});

test('A TABLE OVER A CASH WALK IN TWO CURRENCIES IS ONE TABLE A CURRENCY, not the first currency alone', () => {
  const liquid = (e: Entry) => e.fields.liquid === true || e.fields.liquid === undefined;
  withEuro('accounts', 'balance', liquid, () => {
    const forecast = page('money')?.blocks.find((b) => b.heading === 'Cash ahead');
    assert.ok(forecast, 'the Cash ahead forecast is gone; this test is about it');
    const { knobs: _knobs, late: _late, under: _under, recorded: _recorded, ...decl } = PAGES.money!.blocks.find((b) => b.heading === 'Cash ahead')!;
    const block = readBlock({ ...decl, kind: 'table', limit: 3 } as never);
    assert.deepEqual(block.walks?.map((w) => w.currency), ['EUR', 'GBP']);
    const tables = walkTables(block);
    assert.ok(tables, 'a table over a split walk is drawn apart');
    const drawnTables = tables.filter((t) => t.table);
    assert.equal(drawnTables.length, 2, 'every currency has its table');
    assert.match(JSON.stringify(tables[0]!.said), /In EUR/u);
    assert.match(JSON.stringify(tables[1]!.said), /In GBP/u);
    assert.match(JSON.stringify(drawnTables[0]!.table!.rows[0]), /1,234\.00/u, 'the euro table opens from the euro part');
    assert.ok(drawnTables[1]!.table!.rows.length <= 4, 'each is cut to limit: after its opening row');
    assert.ok(JSON.stringify(tables.at(-1)!.said).includes(copy.figureNoHome.split(' ').slice(0, 3).join(' ')), 'the reason is said once, after the tables');
    assert.equal(walkTables(forecast), null, 'a forecast is drawn through the dialect');
  });
});

test('A WALK SPLIT BY CURRENCY DRAWS EACH ITS REMEMBERED CASH, AND ONE SET OF KNOBS under the last walk moves them all', () => {
  const liquid = (e: Entry) => e.fields.liquid === true || e.fields.liquid === undefined;
  withEuro('accounts', 'balance', liquid, () => {
    const block = page('money')?.blocks.find((b) => b.heading === 'Cash ahead');
    assert.ok(block, 'the Cash ahead forecast is gone; this test is about it');
    assert.deepEqual(block.walks?.map((w) => w.currency), ['EUR', 'GBP']);
    assert.deepEqual(block.walks?.[0]?.past, [], 'the remembered cash is sterling, so the euro walk has none');
    assert.ok((block.walks?.[1]?.past?.length ?? 0) > 0, 'the sterling walk draws the cash remembered in sterling');
    const forecasts = toSegments(block).filter((s) => s.type === 'block' && s.kind === 'forecast') as { rows: { cells: string[] }[] }[];
    assert.equal(forecasts.length, 2);
    const kinds = forecasts.map((f) => f.rows.map((r) => r.cells[0]?.trim()));
    assert.deepEqual(kinds.map((k) => k.includes('knobs')), [false, true], 'the knobs are drawn once, under the last walk');
    assert.deepEqual(kinds.map((k) => k.includes('group')), [true, true], 'and both walks read them');
    assert.deepEqual(kinds.map((k) => k.includes('past')), [false, true]);
    const groups = forecasts.map((f) => f.rows.find((r) => r.cells[0]?.trim() === 'group')!.cells.slice(1, 3).map((c) => c.trim()));
    assert.equal(groups[0]![0], groups[1]![0], 'one group');
    assert.deepEqual(groups.map((g) => g[1]), ['EUR', 'GBP']);
  });
});

test('“LATE TO YOU” DRAWS WHEN WHAT IS LATE IS IN TWO CURRENCIES, and says each amount', () => {
  const late = (e: Entry) => e.fields.direction === 'owed_to_me' && (e.fields.state === 'open' || e.fields.state === 'part') && String(e.fields.due) < TODAY;
  withEuro('obligations', 'amount', late, () => {
    assert.ok(read(METRICS['late-in']!).parts, 'what is late is in parts, so this test is about a note over parts');
    const block = page('money')?.blocks.find((b) => b.heading === 'Late to you');
    assert.ok(block, 'the Late to you note is gone; this test is about it');
    assert.equal(block.drawn, true, 'a note over parts drew nothing');
    assert.match(values()['late-in'] ?? '', /EUR\s1,234\.00\s·\sGBP/u);
  });
});

test('A NOTE QUOTING A FIGURE THE RECORD SENT IN PARTS writes each amount', () => {
  const said = resolverOf({ 'late-in': [{ amount: 123_400, currency: 'EUR' }, { amount: 5_000, currency: 'GBP' }], odd: [{ amount: 1 }] });
  assert.equal(said('late-in')?.replace(/\s/gu, ' '), 'EUR 1,234.00 · GBP 50.00');
  assert.equal(said('odd'), null, 'what is not money is not written as money');
});
