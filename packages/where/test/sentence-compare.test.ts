/**
 * `at least`, `at most`, `more than`, `less than` and `between` in the sentence form.
 *
 * THE STRUCTURED FORM HAS COMPILED `gt gte lt lte between` ALL ALONG AND NO SENTENCE COULD SAY THEM.
 * Measured through a kernel
 * `list`, `n is at least 3` was refused `VALUE_MALFORMED` over an `int`, `n more than 3` and
 * `n between 1 and 5` were refused `MATCH_OP_UNSUPPORTED`, and over a `money` field the first came
 * back `MONEY_LITERAL_NEEDS_CURRENCY` because the words `at least 100` had been handed to `compile`
 * as the value of an `is`. A page's `where:`, a rule's `when:` and the `if` of a step are written in
 * the sentence form, so the one question a number is asked most, is it past a line, could not be
 * asked there at all.
 *
 * THE WORDS ARE THE ONES THE APP ALREADY PRINTS. `apps/web/src/lib/copy.ts` `slashOps` and the flow
 * canvas's `COMPARE` write `gte` as "is at least" and `between` as "is between X and Y", so a clause
 * printed from the tree has to read back as the tree it was printed from. Both spellings, with and
 * without the `is`, are held here.
 *
 * THE PROOF RUNS AGAINST THE KERNEL, imported by path from its own tree as `sentence-contains.test.ts`
 * does: `where` declares no dependency on it and `31 §2` keeps it that way for source.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluate, parseWhere, type Predicate, type Schema } from '../src/index.ts';
import * as sentence from '../src/sentence.ts';
import { openRecord, type Declaration, type Kernel } from '../../kernel/src/index.ts';
import { EXPONENT as KERNEL_EXPONENT } from '../../kernel/src/ingest.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const BILLS: Schema = {
  register: 'bills',
  fields: {
    what: { type: 'text', label: 'Merchant' },
    state: { type: 'enum', values: ['open', 'paid'] },
    n: { type: 'int', label: 'How many' },
    rate: { type: 'decimal' },
    effort: { type: 'duration' },
    amount: { type: 'money' },
    weight: { type: 'quantity' },
    due: { type: 'day' },
    seen: { type: 'instant' },
    tags: { type: 'list', of: 'text' },
  },
};

const parse = (text: string) => parseWhere(text, BILLS, { nowMs: NOW, refByTitle: () => null });
const good = (text: string): Predicate | undefined => {
  const out = parse(text);
  assert.deepEqual(out.bad.map((b) => `${b.code}: ${b.fix}`), [], `${text} was refused`);
  return out.predicate;
};
const refused = (text: string) => {
  const out = parse(text);
  assert.equal(out.predicate, undefined, `${text} compiled to ${JSON.stringify(out.predicate)}`);
  assert.ok(out.bad.length > 0, `${text} was accepted`);
  return out.bad[0]!;
};

/* ── the words, and the leaf each one is ─────────────────────────────────── */

test('EACH WORD IS ITS OPERATOR, with the `is` a printed clause carries and without it', () => {
  for (const [said, op] of [
    ['more than', 'gt'],
    ['at least', 'gte'],
    ['less than', 'lt'],
    ['at most', 'lte'],
  ] as const) {
    assert.deepEqual(good(`n ${said} 3`), { field: 'n', [op]: 3 }, said);
    assert.deepEqual(good(`n is ${said} 3`), { field: 'n', [op]: 3 }, `is ${said}`);
    /* BY THE LABEL TOO, which is how a page prints its own filter back. */
    assert.deepEqual(good(`How many ${said} 3`), { field: 'n', [op]: 3 }, `the label, ${said}`);
  }
  assert.deepEqual(good('n between 1 and 5'), { field: 'n', between: [1, 5] });
  assert.deepEqual(good('n is between 1 and 5'), { field: 'n', between: [1, 5] });
  assert.deepEqual(good('rate at most 0.25'), { field: 'rate', lte: 0.25 });
  assert.deepEqual(good('effort more than 3600'), { field: 'effort', gt: 3600 });
  /* A clause among clauses, ANDed on the comma like every other. */
  assert.deepEqual(good('n at least 3, state is open'), { all: [{ field: 'n', gte: 3 }, { field: 'state', is: 'open' }] });
});

test('A NUMBER IS READ AS THE FIELD READS IT, and a word that is not one is a refusal', () => {
  assert.equal(refused('n at least three').code, 'VALUE_MALFORMED');
  assert.equal(refused('n at least 2.5').code, 'VALUE_MALFORMED', 'an int took a fraction');
  assert.equal(refused('n at least').code, 'REQUIRED_MISSING');
  assert.equal(refused('n between 1').code, 'VALUE_MALFORMED');
  assert.equal(refused('n between 1 and').code, 'VALUE_MALFORMED');
  /* LOW FIRST. `between 5 and 1` compiles in the tree and matches no row whatever the register
     holds, which is the clause this file's whole grammar is written against. */
  const upside = refused('n between 5 and 1');
  assert.equal(upside.code, 'VALUE_MALFORMED');
  assert.match(upside.fix, /the low value first/);
});

test('AN ORDER BELONGS TO A NUMBER, A MONEY, A QUANTITY AND A DAY, and to nothing else', () => {
  for (const text of ['what at least 3', 'state more than 3', 'tags between 1 and 2', 'Merchant less than 3']) {
    const said = refused(text);
    assert.equal(said.code, 'MATCH_OP_UNSUPPORTED', text);
    assert.match(said.fix, /about numbers, money and dates/, text);
  }
});

test('A TEXT THAT STARTS WITH AN ORDERED WORD IS STILL A TEXT, after `is`', () => {
  /* A REVIEW OF THE FIRST ATTEMPT FOUND IT: `what is more than coffee` was `{ field: 'what', is:
     'more than coffee' }` before the words were taught, and the first attempt refused it as an order a
     text cannot be asked. A merchant, a note or a title is free to begin with any words, and a text
     field is never ordered, so after `is` the words are the value it was always read as. The bare
     spelling was never a value, so it stays the refusal above. */
  assert.deepEqual(good('what is more than coffee'), { field: 'what', is: 'more than coffee' });
  assert.deepEqual(good('Merchant is between jobs'), { field: 'what', is: 'between jobs' });
  assert.deepEqual(good('what is not at least 3'), { field: 'what', not: 'at least 3' });
  /* AND ONLY A TYPE THAT CANNOT BE ORDERED: over a number the same spelling is the order. */
  assert.deepEqual(good('n is more than 3'), { field: 'n', gt: 3 });
});

test('A SHOUTED VERB IS THE SAME VERB, as the ordered words after it already were', () => {
  /* `rankedOf` FOLDED `IS` AND THE VERB TEST BESIDE IT DID NOT. So `n IS more than 3` was `gt 3` while
     `what IS more than coffee` skipped the text branch and was refused "more than is not something a
     text can be asked", which is not what anyone wrote; and `n IS 3`, `state IS open` and `due BEFORE
     today` were refused "IS is not something a filter can say", naming the one word every refusal
     then tells them to write. The browser's `compile` folds its operator once and has read all of them
     since `STATE IS NOT Live` compiled to its own opposite there. Measured before this: each of the
     sentences below refused. */
  assert.deepEqual(good('what IS more than coffee'), { field: 'what', is: 'more than coffee' });
  assert.deepEqual(good('n IS 3'), { field: 'n', is: 3 });
  assert.deepEqual(good('state IS open'), { field: 'state', is: 'open' });
  assert.deepEqual(good('due BEFORE 2026-09-30'), { field: 'due', before: '2026-09-30' });
  assert.deepEqual(good('tags HAS x'), { field: 'tags', has: 'x' });
  assert.deepEqual(good('what CONTAINS rent'), { field: 'what', contains: 'rent' });
  /* AND THE NEGATION IS FOLDED WITH IT, or folding the verb alone would have turned `what IS NOT
     coffee` from a refusal into `what is "NOT coffee"`: a clause that answers the opposite question.
     `what is NOT coffee` was that clause already, before any of this, and the browser negated it. */
  assert.deepEqual(good('what IS NOT coffee'), { field: 'what', not: 'coffee' });
  assert.deepEqual(good('what is NOT coffee'), { field: 'what', not: 'coffee' });
  assert.deepEqual(good('n Is Not 3'), { field: 'n', not: 3 });
  assert.deepEqual(good('what IS NOT more than coffee'), { field: 'what', not: 'more than coffee' });
  /* AND THE `not` AFTER `has` AND `lacks`, WHICH HAS ITS OWN TEST OF THE WORD. Folding the verb with
     only the `is` branch's `not` folded took `tags HAS NOT x` from "HAS is not something a filter can
     say" to `has "NOT x"`, and `tags HAS NOT` to a search for a tag called `NOT`, where `tags has not`
     asks "has not what?". Measured against the first version of this change. */
  assert.deepEqual(good('tags HAS NOT x'), { field: 'tags', lacks: 'x' });
  assert.deepEqual(good('tags has NOT x'), { field: 'tags', lacks: 'x' });
  assert.deepEqual(good('tags LACKS NOT x'), { field: 'tags', has: 'x' });
  assert.equal(refused('tags HAS NOT').fix, 'tags HAS NOT: has not what?');
});

test('A NEGATED ORDER IS REFUSED, BECAUSE ITS OPPOSITE WORD IS NOT ITS NEGATION', () => {
  /* `n is not at least 3` is every row under three AND every row with no `n`, and `n less than 3`
     is only the first of those. Reading it as the second would drop the empty rows without a word. */
  const said = refused('n is not at least 3');
  assert.equal(said.code, 'MATCH_OP_UNSUPPORTED');
  assert.match(said.fix, /less than/);
});

test('A VALUE THE FIELD DECLARES COMES FIRST, and its negation is still its negation', () => {
  /* The rule the `is empty` branch keeps: a register free to declare a state whose words begin with
     an ordered one must not lose `is` on that state because the grammar learned the word. */
  const COUNTS: Schema = { register: 'counts', fields: { size: { type: 'enum', values: ['one', 'more_than_one'] } } };
  const said = (text: string) => parseWhere(text, COUNTS, { nowMs: NOW, refByTitle: () => null });
  assert.deepEqual(said('size is more than one').predicate, { field: 'size', is: 'more_than_one' });
  assert.deepEqual(said('size is not more than one').predicate, { field: 'size', not: 'more_than_one' });
  /* AND A WORD IT DOES NOT DECLARE IS AN ORDER, which an enum cannot take. */
  assert.equal(said('size is more than two').bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
  assert.equal(said('size more than one').bad[0]?.code, 'MATCH_OP_UNSUPPORTED');
});

/* ── money, quantity and days ────────────────────────────────────────────── */

test('A MONEY NUMBER CARRIES ITS CURRENCY, and is read in the currency\'s own units', () => {
  assert.deepEqual(good('amount at least EGP 100'), { field: 'amount', gte: { amount: 10_000, currency: 'EGP' } });
  /* THE WAY EVERY SCREEN HERE PRINTS IT, and the code at the other end. */
  assert.deepEqual(good('amount is more than GBP 960.00'), { field: 'amount', gt: { amount: 96_000, currency: 'GBP' } });
  assert.deepEqual(good('amount less than 12 gbp'), { field: 'amount', lt: { amount: 1_200, currency: 'GBP' } });
  assert.deepEqual(good('amount at most JPY 1200'), { field: 'amount', lte: { amount: 1_200, currency: 'JPY' } });
  assert.deepEqual(good('amount at least KWD 1.5'), { field: 'amount', gte: { amount: 1_500, currency: 'KWD' } });
  assert.deepEqual(good('amount at least GBP -12.40'), { field: 'amount', gte: { amount: -1_240, currency: 'GBP' } });
  assert.deepEqual(good('amount between GBP 10 and GBP 20'), {
    field: 'amount',
    between: [
      { amount: 1_000, currency: 'GBP' },
      { amount: 2_000, currency: 'GBP' },
    ],
  });

  /* A BARE NUMBER OVER MONEY, AS A TEST: a bare number over money is refused with the compiler's own code,
     here at parse, so a rule's lint sees it too rather than installing a condition that never holds. */
  assert.equal(refused('amount at least 100').code, 'MONEY_LITERAL_NEEDS_CURRENCY');
  assert.equal(refused('amount is at least 100').code, 'MONEY_LITERAL_NEEDS_CURRENCY');
  assert.equal(refused('amount between GBP 10 and 20').code, 'MONEY_LITERAL_NEEDS_CURRENCY');
  assert.equal(refused('amount between GBP 10 and USD 20').code, 'MIXED_CURRENCY');
  /* NOUGHT IS THE ONE BARE NUMBER MONEY TAKES, as a sign: more than 0 is anything it costs, in any currency. */
  assert.deepEqual(good('amount more than 0'), { field: 'amount', gt: { amount: 0 } });
  assert.deepEqual(good('amount less than 0.00'), { field: 'amount', lt: { amount: 0 } });
  assert.equal(refused('amount at least XYZ 10').code, 'CURRENCY_UNKNOWN');
  /* PRECISION PAST THE CURRENCY IS NOT A NUMBER IT HOLDS: a yen has no pence. */
  assert.equal(refused('amount at least JPY 12.5').code, 'VALUE_MALFORMED');
  assert.equal(refused('amount at least GBP 1.005').code, 'VALUE_MALFORMED');
});

test('THE EXPONENTS ARE THE KERNEL\'S, key for key', () => {
  /* A THIRD COPY, which is what `where ⇏ kernel` costs, and a copy is only a copy while something
     compares it. `KWD 1.5` read with the default two places is 150 fils, a thousandth of the line. */
  assert.deepEqual((sentence as { EXPONENT?: unknown }).EXPONENT, KERNEL_EXPONENT);
});

test('A QUANTITY CARRIES ITS UNIT, and a bare one is refused with the compiler\'s code', () => {
  assert.deepEqual(good('weight at least 5 kg'), { field: 'weight', gte: { value: 5, unit: 'kg' } });
  assert.deepEqual(good('weight between 0.5 kg and 2 kg'), {
    field: 'weight',
    between: [
      { value: 0.5, unit: 'kg' },
      { value: 2, unit: 'kg' },
    ],
  });
  assert.equal(refused('weight at least 5').code, 'QUANTITY_LITERAL_NEEDS_UNIT');
});

test('A DAY IS RESOLVED AGAINST THE CLOCK, and a range of days is both of its ends', () => {
  assert.deepEqual(good('due at least today'), { field: 'due', gte: '2026-09-23' });
  assert.deepEqual(good('due is at most +7d'), { field: 'due', lte: '2026-09-30' });
  /* TWO LEAVES, NOT `between`, and the next test is why. */
  assert.deepEqual(good('due between today and +7d'), {
    all: [
      { field: 'due', gte: '2026-09-23' },
      { field: 'due', lte: '2026-09-30' },
    ],
  });
  assert.equal(refused('due at least someday').code, 'VALUE_MALFORMED');
  assert.equal(refused('due between +7d and today').code, 'VALUE_MALFORMED');
});

test('AN INSTANT BETWEEN TWO DAYS KEEPS THE LAST DAY, which the tree\'s own `between` does not', () => {
  /* MEASURED BEFORE THE SENTENCE WAS TAUGHT IT: `between` compares the whole stored instant with the
     bare day, and `2026-09-03T11:57:00.000Z` sorts after `2026-09-03`, so a range ending on the third
     left out everything that happened on the third. `gte` and `lte` cut an instant to its day when the
     bound is a bare day (`asDay`), so the sentence says the range as the two of them. */
  const row = { seen: '2026-09-03T11:57:00.000Z' };
  assert.equal(evaluate({ field: 'seen', between: ['2026-09-01', '2026-09-03'] }, row, BILLS), false);
  const said = good('seen between 2026-09-01 and 2026-09-03')!;
  assert.equal(evaluate(said, row, BILLS), true);
});

/* ── against a real record ───────────────────────────────────────────────── */

const REGISTER: Declaration = {
  id: 'register.bills',
  kind: 'register',
  body: {
    id: 'bills',
    name: 'Bills',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'n', type: 'int' },
      { id: 'rate', type: 'decimal' },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day' },
    ],
  } as never,
};

const ROWS = [
  { what: 'a', n: 1, rate: 0.1, amount: { amount: 5_000, currency: 'GBP' }, due: '2026-09-20' },
  { what: 'b', n: 3, rate: 0.25, amount: { amount: 10_000, currency: 'GBP' }, due: '2026-09-23' },
  { what: 'c', n: 5, rate: 0.5, amount: { amount: 10_000, currency: 'EGP' }, due: '2026-09-30' },
  { what: 'd', n: 8, rate: 1, amount: { amount: 20_000, currency: 'GBP' }, due: '2026-10-09' },
  { what: 'e' },
];

async function seeded(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([REGISTER]);
  assert.ok(out.ok, JSON.stringify(out));
  for (const fields of ROWS) assert.ok(k.create('bills', fields, { actor: 'p_1' }).ok);
  return k;
}

const listed = (k: Kernel, where: unknown): string => {
  const out = k.list({ register: 'bills', where: where as never, limit: 50 });
  if (!out.ok) return `refused ${'refusal' in out ? `${out.refusal.code}: ${out.refusal.fix}` : 'with a conflict'}`;
  return out.value.rows.map((r) => String(r.fields.what)).sort().join(' ');
};

test('THE PROBE, AS A KERNEL `list`: the three sentences it refused now answer, and answer as the tree does', async () => {
  const k = await seeded();
  for (const [sentence, tree] of [
    ['n is at least 3', { field: 'n', gte: 3 }],
    ['n more than 3', { field: 'n', gt: 3 }],
    ['n between 1 and 5', { field: 'n', between: [1, 5] }],
    ['rate less than 0.5', { field: 'rate', lt: 0.5 }],
    ['n at most 3', { field: 'n', lte: 3 }],
    ['amount at least GBP 100', { field: 'amount', gte: { amount: 10_000, currency: 'GBP' } }],
    ['amount between GBP 50 and GBP 150', { field: 'amount', between: [{ amount: 5_000, currency: 'GBP' }, { amount: 15_000, currency: 'GBP' }] }],
    ['due at least today', { field: 'due', gte: '2026-09-23' }],
    ['due between today and +7d', { all: [{ field: 'due', gte: '2026-09-23' }, { field: 'due', lte: '2026-09-30' }] }],
  ] as const) {
    const said = listed(k, sentence);
    assert.ok(!said.startsWith('refused'), `${sentence}: ${said}`);
    assert.equal(said, listed(k, tree), `${sentence} drew other rows than the tree it stands for`);
  }
  assert.equal(listed(k, 'n is at least 3'), 'b c d');
  assert.equal(listed(k, 'n between 1 and 5'), 'a b c');
  /* THE EGYPTIAN HUNDRED IS NOT A HUNDRED POUNDS, and the empty row is past no line at all. */
  assert.equal(listed(k, 'amount at least GBP 100'), 'b d');
  assert.equal(listed(k, 'amount at least EGP 100'), 'c');
  assert.match(listed(k, 'amount at least 100'), /^refused MONEY_LITERAL_NEEDS_CURRENCY/);
});

test('AND THE SQL AND THE EVALUATOR ADMIT THE SAME ROWS for every sentence the record answers', async () => {
  const k = await seeded();
  for (const sentence of [
    'n at least 3',
    'n is more than 3',
    'n less than 5',
    'n at most 1',
    'n between 3 and 8',
    'rate between 0.1 and 0.5',
    'amount at most GBP 100',
    'amount more than EGP 50',
    'due less than 2026-09-30',
    'due between 2026-09-20 and today',
  ]) {
    const predicate = good(sentence)!;
    const byEvaluate = ROWS.filter((row) => evaluate(predicate, row, BILLS))
      .map((row) => row.what)
      .sort()
      .join(' ');
    assert.equal(listed(k, sentence), byEvaluate, sentence);
  }
});
