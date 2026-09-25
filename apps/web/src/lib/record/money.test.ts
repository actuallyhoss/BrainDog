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
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Declaration } from '@braindog/kernel';

import './fixtures/fill.ts';
import { currencyFor, display } from './api.ts';
import { metric, page, readBlock, values } from './fixtures/readers.ts';
import { resolverOf } from './page-live.ts';
import { PAGES } from './fixtures/sample.ts';
import { toSegments, walkTables } from './blocks.ts';
import { NOW } from './fixtures/sample.ts';
import { ROWS } from './held.ts';
import { BARE, amountOf, currencyOf, drawn, homeOf, merge, mixedFix, symbolText, total } from './money.ts';
import { BARE as METRICS_BARE, currenciesRead, fxNote, read as readAt, targetSaid, withFx, type MetricDecl } from './metrics.ts';
import { copy } from '../copy.ts';
import { METRICS } from './declared.ts';
import { runway as walkAt } from './forecast.ts';
import type { Entry } from './schema.ts';
/* THE SAMPLE'S ROWS WALKED AT THE SAMPLE'S CLOCK, which `runway` took for granted and now takes from its caller. */
const runway: typeof walkAt = (opening, legs, horizon, only, now = NOW) => walkAt(opening, legs, horizon, only, now);

/* THE SAMPLE'S ROWS READ AT THE SAMPLE'S CLOCK, which `read` took for granted and now takes from its caller. */
const read: typeof readAt = (decl, now = NOW) => readAt(decl, now);

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const eur = (amount: number) => ({ amount, currency: 'EUR' });

/* ── the arithmetic ──────────────────────────────────────────────────────── */

/* The legs the record declares. A test that hardcoded two registers would be testing a different
   function from the one the product runs. */
const LEGS = Object.values(PAGES)
  .flatMap((p) => p.blocks)
  .find((b) => b.source === 'forecast.runway')!.from!;

/** One money column and nothing else, which is all the mixed-unit refusal needs to be asked. */
const TAKINGS: Declaration = {
  id: 'register.takings',
  kind: 'register',
  body: {
    id: 'takings',
    name: 'Takings',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

/**
 * THE RECORD'S OWN MIXED-UNIT SENTENCE, DRIVEN OUT OF A RUNNING RECORD RATHER THAN MATCHED IN ITS
 * SOURCE. One argument per row, each the JSON that row's money column is to hold.
 *
 * A sentence typed a second time is the whole of what went wrong: this file held the two web modules
 * to each other and had no way to see the third spelling, which is the one a paying customer reads.
 * The first repair read the kernel's source with a regex over the template literal, and that regex
 * could see the mark and not the clause around it, so the two copies diverged on the clause one
 * commit later with the assertions still green. `openRecord` is exported, so the whole sentence can
 * be driven instead.
 *
 * WHY THE ROWS ARE FINISHED WITH SQL. `coerce.ts` refuses `{ amount: 250 }` and refuses
 * `currency: 'pounds'`, so no caller can put either in a money column, and the arm of the refusal
 * that names a unitless row cannot be reached through the write path at all. What reaches it is JSON
 * that was already in the column: a field that was `decimal` when the row was written, or an import
 * under an older build. This app's own sample registers are the live instance of that, because their
 * rows are typed into `data.ts` rather than coerced, which is how the browser comes to print a
 * sentence about a set a fresh record could not hold.
 */
async function refusedOver(amounts: readonly string[]): Promise<{ code: string; fix: string }> {
  const out = await metricOver(amounts);
  assert.equal(out.ok, false, 'the record answered a sum over a mixed money column instead of refusing');
  return out.refusal!;
}

/**
 * The same sum, WITHOUT the assertion that it refused, because half the branches of the sentence turn
 * out to be ones a live record answers rather than refuses, and a test that can only ask for a refusal
 * cannot show that.
 */
async function metricOver(amounts: readonly string[]): Promise<{ ok: boolean; refusal?: { code: string; fix: string } }> {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];

  const k = await openRecord(sql, { now: () => NOW });
  assert.ok((await k.install([TAKINGS])).ok, 'the register the refusal is read over would not install');
  for (const [at, json] of amounts.entries()) {
    assert.ok(k.create('takings', { what: `Row ${at + 1}`, amount: gbp(100) }, { actor: 'p_1' }).ok);
    sql.exec(`UPDATE entry SET fields = json_set(fields, '$.amount', json(?)) WHERE json_extract(fields, '$.what') = ?`, json, `Row ${at + 1}`);
  }

  const out = k.metric({
    metric: 'taken',
    name: 'Taken',
    source: 'register.takings',
    value: { sum: 'amount' },
    target: { gte: 0 },
    window: '30d',
    format: 'decimal',
  } as never) as { ok: boolean; refusal?: { code: string; fix: string } };
  db.close();
  return out;
}

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
  assert.deepEqual(t.mixed, ['GBP', BARE]);
  // And bare numbers alone are an ordinary total: a count of days is not money.
  const plain = total([1, 2, 3]);
  assert.equal(plain.amount, 6);
  assert.equal(plain.currency, null);
  assert.deepEqual(plain.mixed, []);
});

test('AND THE SENTENCE SAYS SO, in the words the RECORD uses', async () => {
  /* `total()` saw the bare rows and refused over them, and then left them out of the set it hands
     to `mixedFix`, so a column of one sterling row and one plain number printed *"these rows are in
     GBP, and two currencies are never added"* — one currency named, two claimed, and nothing about
     the rows that have no currency at all, which is the thing somebody has to go and fix.
     `metrics.ts` puts `BARE` in the set for exactly this and says why (*"the marker has to read as
     English there rather than as a currency code"*), `forecast.ts` does the same for the cash walk,
     and the kernel writes `no unit` into the same sentence. This was the site that did not. */
  const t = total([gbp(100), 250]);
  assert.equal(mixedFix(t.mixed), 'these rows are in GBP and no unit, and two units are never added');

  /* THE SAME TWO ROWS THROUGH `metrics.ts`, because one situation with two sentences is two
     situations as far as a reader is concerned, and these two drifted apart without a word. */
  const rows = [{ seq: 1, fields: { amount: gbp(100) } }, { seq: 2, fields: { amount: 250 } }] as unknown as Entry[];
  assert.equal(mixedFix([...currenciesRead(rows, { sum: 'amount' })].sort()), mixedFix(t.mixed));
  assert.equal(BARE, METRICS_BARE, 'the marker is spelled in two modules and the spellings have drifted');

  /* AND THE THIRD SPELLING, WHICH IS THE ONE THAT WINS, ASKED OF A RUNNING RECORD. The equality
     above holds the two web modules to each other and can see nothing else, so it passed on the day
     the sample printed *"these rows are in GBP and no currency"* about the same two rows the record
     described as *"GBP and no unit"*: one situation, two sentences, and the assertion that was
     supposed to stop exactly that looking straight through it. Its replacement matched the kernel's
     SOURCE with a regex, which saw the mark and not the clause around it, and the clause diverged one
     commit later with the assertions still green. So the record is opened, the rows are put in a
     money column, and the whole sentence is compared. */
  const bare = await refusedOver(['{"amount":10000,"currency":"GBP"}', '{"amount":25000}']);
  assert.equal(bare.code, 'MIXED_CURRENCY', 'the record no longer refuses a money column with a unitless row');
  assert.equal(mixedFix(t.mixed), bare.fix, 'the sample and the record say different things about the same two rows');

  /* AND A SET WHOSE OTHER ENTRY IS NEITHER A CURRENCY NOR THE MARK, which is the case both copies
     have got wrong in turn, and it is passed through `total()` rather than typed as an array because
     the ORDER is half of what diverged. `total()` hands the set over sorted and `no unit` sorts
     before `pounds`, so this printed *"in no unit and pounds"* where the record prints *"in pounds
     and no unit"*. A write cannot produce the row — `coerce.ts` refuses `currency: 'pounds'` — and a
     money column that already held it can, which is what the sample register is. */
  const oddly = total([{ amount: 10_000, currency: 'pounds' }, 25_000]);
  assert.deepEqual(oddly.mixed, [BARE, 'pounds'], 'the set no longer arrives sorted, so the order this pins is a different one');
  const odd = await refusedOver(['{"amount":10000,"currency":"pounds"}', '{"amount":25000}']);
  assert.equal(mixedFix(oddly.mixed), odd.fix);
  assert.equal(odd.fix, 'these rows are in pounds and no unit, and two units are never added');

  /* AND THE SAME TEST WITH NO UNITLESS ROW AT ALL, which is the one a live record cannot be asked:
     two named units in a money column send it to the rate table rather than to a refusal, so it
     answers in parts. `includes(BARE)` saw no mark here and called `euros` and `pounds` two
     currencies; the rule the record applies is that each entry has to read as a code. */
  assert.equal(
    mixedFix(total([{ amount: 100, currency: 'pounds' }, { amount: 200, currency: 'euros' }]).mixed),
    'these rows are in euros and pounds, and two units are never added',
  );

  /* AND TWO REAL CURRENCIES STILL SAY CURRENCIES, which is the half of the split that was right. A
     live record answers that case in parts rather than refusing, because it has a rate table to try
     first, so this one is the mirror on its own. */
  assert.equal(mixedFix(['EUR', 'GBP']), 'these rows are in EUR and GBP, and two currencies are never added');
});

/**
 * EVERY BRANCH OF THE SENTENCE, because the differential covered two of them and an audit could line
 * the two copies up in a table anyway.
 *
 * The test above drives one named unit beside a unitless row, twice, once with a code and once with a
 * word. Both times `said` has exactly one named entry and the mark, so nothing in it can tell the rule
 * *"the named units in order, then the mark"* apart from a two-slot template, and `${named[0]} and
 * ${named[1] ?? BARE}` passes all of it. This drives three entries, where the mark is not the second
 * thing in the sentence, and it drives a set the sort leaves with the mark in the MIDDLE.
 *
 * AND THE HALVES A LIVE RECORD CANNOT BE ASKED ARE ASKED ANYWAY, AND THE ANSWER RECORDED HERE. Driven:
 * the kernel's money aggregation reaches this sentence only when at least one row carries no unit at
 * all, because every set whose units are all non-null goes to `fx.ts` and comes back in parts. So the
 * *currencies* half of `mixedFix` has no counterpart in the record's money arm, and the two assertions
 * below that pin it are pinning the wording alone. They say so rather than looking like more of the
 * differential than they are. That half is not dead in the browser: `api.ts` writes it over `runway`'s
 * `mixed`, which is two codes and no unitless row.
 */
test('AND EVERY BRANCH OF THE SENTENCE, not the two that could be lined up in a table', async () => {
  /* THREE ENTRIES, SO THE MARK IS NOT THE SECOND THING IN THE SENTENCE. Both copies build the list as
     the named units followed by the mark, and with one named unit that is indistinguishable from a
     template with two slots in it. */
  const three = total([gbp(100), eur(250), 5]);
  assert.deepEqual(three.mixed, ['EUR', 'GBP', BARE], 'the set is no longer two codes and a unitless row, so this pins nothing');
  const drivenThree = await refusedOver(['{"amount":10000,"currency":"GBP"}', '{"amount":25000,"currency":"EUR"}', '{"amount":500}']);
  assert.equal(drivenThree.code, 'MIXED_CURRENCY');
  assert.equal(mixedFix(three.mixed), drivenThree.fix, 'the sample and the record say different things about the same three rows');
  assert.equal(drivenThree.fix, 'these rows are in EUR and GBP and no unit, and two units are never added');

  /* AND A SET THE SORT LEAVES WITH THE MARK IN THE MIDDLE, which is the shape that made the ORDER
     divergence possible in the first place and which neither existing case has. `total()` sorts the
     whole set, so `no unit` lands between `EUR` and `pounds`, and both copies have to lift the named
     units out rather than print the set as they were handed it. The record orders by unit in SQL and
     gets `NULL` first, so the two arrive at the same sentence from two different orders. */
  const middle = total([eur(100), { amount: 250, currency: 'pounds' }, 5]);
  assert.deepEqual(middle.mixed, ['EUR', BARE, 'pounds'], 'the mark no longer sorts into the middle, so the order this pins is a different one');
  const drivenMiddle = await refusedOver(['{"amount":10000,"currency":"EUR"}', '{"amount":25000,"currency":"pounds"}', '{"amount":500}']);
  assert.equal(mixedFix(middle.mixed), drivenMiddle.fix);
  assert.equal(drivenMiddle.fix, 'these rows are in EUR and pounds and no unit, and two units are never added');

  /* A ROW WHOSE CURRENCY IS THE EMPTY STRING IS A ROW WITH NO UNIT, never a hole in the list. Both
     copies filter it out of the named units and count it toward the mark, and dropping that one clause
     prints *"these rows are in  and GBP"* with two spaces where a unit should be. `isMoney` checks only
     that the code is a string, so `{ amount, currency: '' }` is money to this app and a money column
     that already held it can hand it over. */
  const hole = total([gbp(100), { amount: 250, currency: '' }]);
  assert.deepEqual(hole.mixed, ['', 'GBP'], 'the empty code no longer reaches the set, so this pins nothing');
  assert.equal(mixedFix(hole.mixed), 'these rows are in GBP and no unit, and two units are never added');

  /* AND THE *currencies* HALF, PINNED AGAINST THE WORDING AND NOT AGAINST THE RECORD, with the reason
     driven here rather than asserted in a comment. Three codes and no unitless row: the record answers
     in parts instead of refusing, so there is no sentence of its own to compare, and the same is true
     of two codes, of two words that are not codes, and of a code beside the empty string. */
  const codes = await metricOver(['{"amount":1,"currency":"GBP"}', '{"amount":2,"currency":"EUR"}', '{"amount":3,"currency":"USD"}']);
  assert.equal(codes.ok, true, 'the record refuses a money column of codes now, so the currencies half can be driven rather than pinned');
  assert.equal(
    mixedFix(total([gbp(1), eur(2), { amount: 3, currency: 'USD' }]).mixed),
    'these rows are in EUR and GBP and USD, and two currencies are never added',
  );
  /* AND ONE UNITLESS ROW ADDED TO THOSE SAME THREE CODES IS WHAT MAKES IT A REFUSAL, which is the
     measurement the paragraph above rests on: a null in the set is the precondition of the sentence,
     and a null in the set is also what makes the noun *units*. */
  const andBare = await refusedOver(['{"amount":1,"currency":"GBP"}', '{"amount":2,"currency":"EUR"}', '{"amount":3,"currency":"USD"}', '{"amount":4}']);
  assert.equal(andBare.fix, 'these rows are in EUR and GBP and USD and no unit, and two units are never added');
  assert.equal(mixedFix(total([gbp(1), eur(2), { amount: 3, currency: 'USD' }, 4]).mixed), andBare.fix);
});

test('and the remainder bucket carries the marker, and carries it only when a bare row is really in it', () => {
  const carried = merge([total([gbp(100)]), total([250])]);
  assert.deepEqual(carried.mixed, ['GBP', BARE]);
  /* AND A MERGE OF TWO CURRENCIES IS NOT A ROW WITH NO CURRENCY. A mixed part reports `currency:
     null` like a bare one does, so reading the marker off that alone would invent unitless rows
     nobody has. */
  const both = merge([total([gbp(100), eur(50)]), total([gbp(5)])]);
  assert.deepEqual(both.mixed, ['EUR', 'GBP'], 'a mix of two currencies was reported as rows with no currency');
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
  /* AND THE FIGURE NOW CARRIES ITS NUMBER RATHER THAN BEING PARTED. Until 21 September a sum whose
     rows hold one currency the declaration does not name came back `value: null` with a single part,
     because `into` fell back to the declared code and the sum then looked like a sum across two.
     With that fallback gone the figure is a figure in the currency its rows are in, and `shown` is
     unchanged: the screen said GBP before and says GBP now. */
  const out = read({ ...decl, format: 'money.JPY' });
  assert.equal(out.value, 1_054_000);
  assert.equal(out.unit, 'GBP');
  assert.equal(out.parts, undefined);
  assert.match(out.shown, /^GBP /u);
  /* AND SO IS AN AVERAGE: the rows' own currency, never relabelled. */
  const avg = read({ ...decl, value: { avg: 'amount' }, format: 'money.JPY' });
  assert.equal(avg.value, 527_000);
  assert.equal(avg.unit, 'GBP');
  assert.equal(avg.parts, undefined);
  assert.match(avg.shown, /^GBP /u);
});

test('A BAR OVER TWO CURRENCIES IS ONE BAR A CURRENCY, each under its code', () => {
  const block = page('money')?.blocks.find((b) => b.heading === 'Owed by you, 30 days, by what it is for');
  assert.ok(block, 'the bar is gone; this test is about the bar');

  withEuro('obligations', 'amount', overduePayable, () => {
    const again = page('money')?.blocks.find((b) => b.heading === 'Owed by you, 30 days, by what it is for');
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
      const one = toSegments(page('money')!.blocks.find((b) => b.heading === 'Owed by you, 30 days, by what it is for')!);
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

test('A TARGET TYPED IN THE HOME CURRENCY IS SAID AS TYPED, and one converted says from which', () => {
  const decl = { ...METRICS['out-30d']!, target: { lte: 2_000_000 } } as MetricDecl;
  const typed = targetSaid(decl, { unit: 'EGP', targetIn: { currency: 'EGP', target: { lte: 2_000_000 }, asOf: '2026-09-17', forward: false, stale: false, from: 'EGP' } });
  const converted = targetSaid(decl, { unit: 'EGP', targetIn: { currency: 'EGP', target: { lte: 2_000_000 }, asOf: '2026-09-17', forward: false, stale: false } });
  assert.ok(typed.includes('20,000.00'), typed);
  assert.ok(!typed.includes('converted'), typed);
  assert.ok(converted.includes('GBP'), converted);
});
