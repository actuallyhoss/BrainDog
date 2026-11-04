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
import { currencyFor, display, homeCurrency, learnHome } from './api.ts';
import { layoutOf, refusedShell } from './boot-live.ts';
import { patchOf, wrongMoney } from './field-draft.ts';
import { resolverOf } from './page-live.ts';
import { NOW } from './fixtures/sample.ts';
import { ROWS } from './held.ts';
import { BARE, amountOf, currencyOf, drawn, merge, mixedFix, symbolText, total } from './money.ts';
import { BARE as METRICS_BARE, currenciesRead, targetSaid, type MetricDecl } from './metrics.ts';
import { METRICS } from './declared.ts';
import type { Entry, FieldDecl } from './schema.ts';

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const eur = (amount: number) => ({ amount, currency: 'EUR' });

/* ── the arithmetic ──────────────────────────────────────────────────────── */

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
     English there rather than as a currency code"*), and the kernel writes `no unit` into the same
     sentence. This was the site that did not. */
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
 * differential than they are. That half is not dead in the browser: `blocks.ts` writes it over a total
 * of a money column, which can be two codes and no unitless row.
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

/**
 * Put one euro row into a register the app has learnt for the length of one test, then put it back.
 *
 * It COPIES A ROW OF THE KIND THE TEST IS ABOUT and changes only the money, so the euro row is one
 * the form would be asked to print beside the sterling ones.
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

/** An open, overdue payable. */
const overduePayable = (e: Entry) =>
  e.fields.direction === 'owed_by_me' &&
  (e.fields.state === 'open' || e.fields.state === 'part') &&
  String(e.fields.due) < TODAY;

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

test('THE HOME CURRENCY IS WRITTEN WITH ITS SYMBOL, and any other by its own sign', () => {
  assert.deepEqual(drawn('GBP 28,320.00', 'GBP'), { lead: '£', whole: '28,320', fraction: '.00', iso: null });
  assert.deepEqual(drawn('USD −4,800.00', 'GBP'), { lead: '−$', whole: '4,800', fraction: '.00', iso: null });
  assert.deepEqual(drawn('USD −4,800.00', 'CAD'), { lead: '−$', whole: '4,800', fraction: '.00', iso: 'USD' }, 'where the sign is the home\'s, the code says which');
  assert.deepEqual(drawn('JPY 1,299', 'GBP'), { lead: '¥', whole: '1,299', fraction: '', iso: null });
  assert.equal(drawn('about 12', 'GBP'), null, 'text money() did not write is not redrawn');
});

test('a sentence redraws its figures, and a currency with no symbol keeps its code in front', () => {
  assert.equal(symbolText('no more than GBP 20,000.00', 'GBP'), 'no more than £20,000');
  assert.equal(symbolText('was EUR 4.00', 'GBP'), 'was €4', 'its own sign says which');
  assert.equal(symbolText('was EUR 4.50', 'GBP'), 'was €4.50');
  assert.equal(symbolText('costs ZZZ 12.00', 'GBP'), 'costs ZZZ 12.00');
});

test('A CURRENCY ENGLISH WRITES BY ITS CODE IS SAID ONCE, code first, home or not', () => {
  assert.deepEqual(drawn('EGP 58,185.54', 'EGP'), { lead: 'EGP\u00a0', whole: '58,185', fraction: '.54', iso: null });
  assert.deepEqual(drawn('EGP 1,299.00', 'GBP'), { lead: 'EGP\u00a0', whole: '1,299', fraction: '.00', iso: null });
  assert.equal(symbolText('EGP 58,185.54 in the bank', 'EGP'), 'EGP\u00a058,185.54 in the bank');
});

test('A SENTENCE AND A HEADLINE DROP A FRACTION OF ALL ZEROS, and a ledger keeps its pence', () => {
  assert.equal(symbolText('GBP 33,850.00', 'GBP', true), '£33,850');
  assert.equal(symbolText('EGP 58,185.00', 'GBP', true), 'EGP\u00a058,185');
  assert.equal(symbolText('GBP 33,850.50', 'GBP'), '£33,850.50', 'a fraction that is not all zeros is part of a sentence’s figure');
  assert.equal(symbolText('GBP 33,850.00', 'GBP'), '£33,850');
  assert.equal(symbolText('Bills past their due date: GBP 10,540.00 still to pay.', 'GBP', 'sentence'), 'Bills past their due date: £10,540 still to pay.');
  assert.equal(symbolText('GBP 33,850.00', 'GBP', 'exact'), '£33,850.00');
  assert.equal(symbolText('GBP 0.00', 'GBP', 'exact'), '£0.00');
  assert.equal(symbolText('GBP 0.00', 'GBP'), '£0');
  assert.equal(symbolText('USD 4,800.00', 'GBP', 'exact'), '$4,800.00');
});

/**
 * A FIGURE STANDING ON ITS OWN IS WHOLE UNITS: the founder's Today drew "EGP 1,086,213.41" beside each
 * book, a ledger's figure, piastres and all. A CURRENCY ENGLISH WRITES BY ITS CODE KEEPS IT THERE TOO, "EGP 1,350" as
 * every other place writes it, never "E£1,350" (settled 9 October).
 */
test('A HEADLINE IS WHOLE UNITS, AND EGP IS WRITTEN EGP THERE AS EVERYWHERE: "EGP 1,086,213.41" over Today is "EGP 1,086,213"', () => {
  assert.equal(symbolText('EGP 1,086,213.41', 'EGP', 'headline'), 'EGP\u00a01,086,213');
  assert.equal(symbolText('EGP 1,086,213.50', 'EGP', 'headline'), 'EGP\u00a01,086,214', 'a half rounds up');
  assert.equal(symbolText('EGP −99,999.99', 'EGP', 'headline'), '−EGP\u00a0100,000', 'and carries into the next thousand');
  assert.equal(symbolText('EGP 58,185.00', 'EGP', true), 'EGP\u00a058,185', '`true` is the headline the lead line asks for');
  assert.equal(symbolText('EGP 1,350.00', 'EGP', true), 'EGP\u00a01,350', 'the Orders line: never E£1,350');
  assert.equal(symbolText('GBP 33,850.50', 'GBP', true), '£33,851');
  assert.equal(symbolText('Cash is EGP 1,086,213.41 across 13 accounts', 'EGP', true), 'Cash is EGP\u00a01,086,213 across 13 accounts');
  assert.deepEqual(drawn('EGP 1,086,213.41', 'EGP', true), { lead: 'EGP\u00a0', whole: '1,086,213', fraction: '', iso: null });

  /* UNDER TEN THOUSAND THE AMOUNT IS EXACT, so its fraction stays where it is not all zeros. */
  assert.equal(symbolText('GBP 4.37', 'GBP', 'headline'), '£4.37');
  assert.equal(symbolText('GBP 12.00', 'GBP', 'headline'), '£12');

  /* EVERY CURRENCY WITH A SIGN TAKES ITS OWN (AM15): a dollar on an Egyptian record is `$`, the code only where the sign is the home's. */
  assert.equal(symbolText('EGP 412,300.00', 'GBP', 'headline'), 'EGP\u00a0412,300');
  assert.equal(symbolText('USD 48,000.70', 'EGP', 'headline'), '$48,001');
  /* AND ONLY A SIGN THE FIGURES ARE READ BACK BY: a narrow form that is letters keeps the code, as one with none does. */
  assert.equal(symbolText('SEK 1,200.00', 'SEK', 'headline'), 'SEK\u00a01,200');
  assert.equal(symbolText('KWD 12,345.678', 'KWD', 'headline'), 'KWD\u00a012,346');
  assert.equal(symbolText('JPY 1,299', 'JPY', 'headline'), '¥1,299');

  /* A SENTENCE AND A LEDGER ARE AS THEY WERE. */
  assert.equal(symbolText('EGP 1,086,213.41', 'EGP'), 'EGP\u00a01,086,213.41');
  assert.equal(symbolText('EGP 1,086,213.41', 'EGP', 'exact'), 'EGP\u00a01,086,213.41');
  assert.deepEqual(drawn('EGP 58,185.54', 'EGP'), { lead: 'EGP\u00a0', whole: '58,185', fraction: '.54', iso: null });
});

/**
 * A SMALLER AMOUNT ROUNDED IS A DIFFERENT AMOUNT: any headline of a hundred or more lost its
 * fraction, so £100.49 was "£100" and £999.50 "£1,000", on a tile read against the ledger rows it counts.
 */
test('A HEADLINE IS ROUNDED ONLY FROM TEN THOUSAND UP, and a bar\'s value is never rounded', () => {
  assert.equal(symbolText('GBP 100.49', 'GBP', 'headline'), '£100.49');
  assert.equal(symbolText('GBP 999.50', 'GBP', 'headline'), '£999.50');
  assert.equal(symbolText('GBP 9,999.99', 'GBP', 'headline'), '£9,999.99', 'the last amount under the line stays exact');
  assert.equal(symbolText('GBP 10,000.49', 'GBP', 'headline'), '£10,000', 'and the first at it is whole units');
  assert.equal(symbolText('GBP 10,000.00', 'GBP', 'headline'), '£10,000');
  assert.deepEqual(drawn('GBP 999.50', 'GBP', true), { lead: '£', whole: '999', fraction: '.50', iso: null });

  /* A BAR'S VALUE IS READ AGAINST THE BARS BESIDE IT, so it keeps every minor unit. */
  assert.equal(symbolText('EGP 1,086,213.41', 'EGP', 'figure'), 'EGP\u00a01,086,213.41');
  assert.equal(symbolText('EGP 58,185.00', 'EGP', 'figure'), 'EGP\u00a058,185', 'a fraction of all zeros still goes');
  assert.equal(symbolText('USD 48,000.70', 'EGP', 'figure'), '$48,000.70');
  assert.deepEqual(drawn('EGP 1,086,213.41', 'EGP', 'figure'), { lead: 'EGP\u00a0', whole: '1,086,213', fraction: '.41', iso: null });
});

test('ANY OTHER CURRENCY IS SAID BY ITS OWN SIGN IN EVERY SETTING, a headline too, with its code only where the sign is the home one', () => {
  assert.equal(symbolText('Cash is GBP 33,850.00', 'USD', true), 'Cash is £33,850', 'a sterling figure on a dollar record read as its own');
  assert.equal(symbolText('was EUR 4.00', 'GBP', true), 'was €4');
  assert.equal(symbolText('CAD 1,200.00 and USD 1,200.00', 'USD'), 'CA$1,200 and $1,200', 'two dollars looked alike');
  assert.equal(symbolText('USD 1,200.00 and CAD 1,200.00', 'CAD'), '$1,200\u00a0USD and $1,200', 'on a Canadian record the US dollar keeps its code');
  assert.equal(symbolText('GBP 39.00', null), '£39', 'with no home currency every figure is said by its own sign');
});

/**
 * THE HOME CURRENCY IS THE ONE THE RECORD SAID IN `boot`, never a count of the rows this tab holds.
 *
 * `fill.ts` has put the sample's rows in `held.ts` for this file, and most of their money is sterling, so the count
 * `homeCurrency()` used to be would answer GBP here. On a live tab those rows are not there and it answered null, so
 * every figure in the record's own currency kept its code after it.
 */
test('THE HOME CURRENCY IS THE ONE THE RECORD SAID, and the shell and the figures agree on it', () => {
  const now = new Date(NOW).toISOString();
  const record = (currency: string | null) => ({ slug: 'nile', name: 'Nile', locale: 'en', currency });
  assert.equal(homeCurrency(), null, "the record's currency was counted from the rows this tab holds");

  assert.equal(layoutOf({ registers: [], home: null, now, record: record('EGP') }).index.currency, 'EGP');
  assert.equal(homeCurrency(), 'EGP', 'the shell and the figures name two currencies');

  assert.equal(layoutOf({ registers: [], home: null, now, record: record(null) }).index.currency, null);
  assert.equal(homeCurrency(), null, "a record with no currency chosen is drawn in the last one's");

  layoutOf({ registers: [], home: null, now, record: record('EGP') });
  assert.equal(refusedShell({ code: 'FORBIDDEN', fix: 'This record is not yours to read.' }).index.currency, null);
  assert.equal(homeCurrency(), null, "a record that refused is drawn in the last one's currency");
});

test('A MONEY BOX ON A ROW WITH NO CURRENCY TYPES IN ONE SOMEBODY CHOSE, and with none chosen it writes nothing', () => {
  const amount: FieldDecl = { id: 'amount', type: 'money' };
  learnHome('EGP');
  try {
    assert.deepEqual(patchOf(amount, '12.50', null, null), { amount: { amount: 1250, currency: 'EGP' } }, "the record's currency was passed over");
    const owed: FieldDecl = { ...amount, default: { amount: 0, currency: 'KWD' } };
    assert.deepEqual(patchOf(owed, '1.25', null, null), { amount: { amount: 1250, currency: 'KWD' } }, "the field's own default was passed over");
  } finally {
    learnHome(null);
  }
  assert.notEqual(wrongMoney(amount, '12.50', null, null), null, 'an amount in no currency was let through to the record');
  assert.deepEqual(patchOf(amount, '12.50', null, null), { amount: '12.50' }, 'a currency nobody chose was written');
});

test('A NOTE QUOTING A FIGURE THE RECORD SENT IN PARTS writes each amount', () => {
  const said = resolverOf({ 'late-in': [{ amount: 123_400, currency: 'EUR' }, { amount: 5_000, currency: 'GBP' }], odd: [{ amount: 1 }] });
  /* ONE RULE A SENTENCE (aa560291b): one amount a thousand or more, and so whole, makes every amount in it whole. */
  assert.equal(said('late-in')?.replace(/\s/gu, ' '), 'EUR 1,234 · GBP 50');
  assert.equal(resolverOf({ small: [{ amount: 12_345, currency: 'EUR' }, { amount: 5_000, currency: 'GBP' }] })('small')?.replace(/\s/gu, ' '), 'EUR 123.45 · GBP 50', 'under a thousand the cents stay where they are not nought');
  assert.equal(said('odd'), null, 'what is not money is not written as money');
});

test('A TARGET TYPED IN THE HOME CURRENCY IS SAID AS TYPED, and one converted says from which', () => {
  /* A FIGURE THAT NAMES ITS OWN CURRENCY, which money-core's no longer do since 3.0.0 (a bare `money` format, the record's
     home currency) and a pack or a use case still may. Its target is in that currency, so read in another it is either
     typed there or converted from it, and says which. */
  const decl = { ...METRICS['out-30d']!, format: 'money.GBP', target: { lte: 2_000_000 } } as MetricDecl;
  const typed = targetSaid(decl, { unit: 'EGP', targetIn: { currency: 'EGP', target: { lte: 2_000_000 }, asOf: '2026-09-17', forward: false, stale: false, from: 'EGP' } });
  const converted = targetSaid(decl, { unit: 'EGP', targetIn: { currency: 'EGP', target: { lte: 2_000_000 }, asOf: '2026-09-17', forward: false, stale: false } });
  assert.ok(typed.includes('20,000'), typed);
  assert.ok(!typed.includes('converted'), typed);
  assert.ok(converted.includes('GBP'), converted);

  /* AND money-core's OWN, whose bare `money` names no currency: the sum a person typed is held in the home currency
     (`liveTarget` in `packages/kernel/src/declare.ts`), so it is said in the one the figure was read in and never as
     converted from anywhere. */
  const bare = { ...METRICS['out-30d']!, target: { lte: 2_000_000 } } as MetricDecl;
  assert.equal(bare.format, 'money', 'money-core names a currency on its figures again, so this reads a different case');
  const home = targetSaid(bare, { unit: 'EGP', targetIn: { currency: 'EGP', target: { lte: 2_000_000 }, asOf: '2026-09-17', forward: false, stale: false } });
  assert.ok(home.includes('EGP') && home.includes('20,000'), home);
  assert.ok(!home.includes('converted'), home);
});
