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

import { currencyFor, display, page } from './api.ts';
import { PAGES } from './data.ts';
import { toSegments } from './blocks.ts';
import { NOW, ROWS } from './data.ts';
import { amountOf, currencyOf, drawn, homeOf, merge, symbolText, total } from './money.ts';
import { read, type MetricDecl } from './metrics.ts';
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

test('A TILE OVER TWO CURRENCIES SHOWS THE SENTENCE, not the sum', () => {
  const decl = METRICS.overdue;
  assert.ok(decl, 'the overdue metric is gone, so this test is vacuous');
  assert.ok(read(decl).value !== null, 'the tile does not read at all, so a refusal proves nothing');

  withEuro('obligations', 'amount', overduePayable, () => {
    const out = read(decl);
    assert.equal(out.value, null, 'a sterling total and a euro row came back as one figure');
    assert.equal(out.shown, '—');
    assert.match(out.why, /EUR and GBP/);
    assert.match(out.why, /never added/);
  });
});

test('and a metric whose format disagrees with its rows is refused rather than relabelled', () => {
  // `format: money.GBP` says how to WRITE the figure; the rows are what it is a figure of. Printing
  // the rows' number under the declaration's code is the quiet version of getting this wrong.
  const decl: MetricDecl | undefined = METRICS.overdue;
  assert.ok(decl, 'the overdue metric is gone');
  assert.ok(decl.format?.startsWith('money.'), 'this test needs a money-formatted metric');
  const out = read({ ...decl, format: 'money.JPY' });
  assert.equal(out.value, null);
  assert.match(out.why, /the rows are in GBP and the format says JPY/);
});

test('A BAR WITH A MIXED GROUP SAYS SO IN THAT GROUP, and the others still read', () => {
  const block = page('money')?.blocks.find((b) => b.heading === 'Owed by you, by counterparty');
  assert.ok(block, 'the bar is gone; this test is about the bar');

  withEuro('obligations', 'amount', overduePayable, () => {
    const again = page('money')?.blocks.find((b) => b.heading === 'Owed by you, by counterparty');
    const cells = toSegments(again!)
      .flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []))
      .map((r) => r.cells[1] ?? '');
    assert.ok(
      cells.some((c) => c.includes('never added')),
      `no group said so: ${cells.join(' / ')}`,
    );
    assert.ok(
      cells.some((c) => /^GBP /.test(c)),
      'every other group stopped reading too',
    );
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
  assert.deepEqual(drawn('GBP 28,320.00', 'GBP'), { lead: '£', whole: '28,320', fraction: '.00', code: null });
  assert.deepEqual(drawn('USD −4,800.00', 'GBP'), { lead: '−$', whole: '4,800', fraction: '.00', code: 'USD' });
  assert.deepEqual(drawn('JPY 1,299', 'GBP'), { lead: '¥', whole: '1,299', fraction: '', code: 'JPY' });
  assert.equal(drawn('about 12', 'GBP'), null, 'text money() did not write is not redrawn');
});

test('a sentence redraws its figures, and a currency with no symbol keeps its code in front', () => {
  assert.equal(symbolText('no more than GBP 20,000.00', 'GBP'), 'no more than £20,000.00');
  assert.equal(symbolText('was EUR 4.00', 'GBP'), 'was €4.00 EUR');
  assert.equal(symbolText('costs ZZZ 12.00', 'GBP'), 'costs ZZZ 12.00');
});

test('the home currency is the one most of the money is in, and none when there is none', () => {
  assert.equal(homeOf([gbp(1), eur(1), gbp(2)]), 'GBP');
  assert.equal(homeOf([1, 'x']), null);
  assert.equal(homeOf([eur(1), gbp(1)]), 'EUR');
});
