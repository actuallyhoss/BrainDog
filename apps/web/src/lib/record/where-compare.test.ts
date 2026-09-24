/**
 * `more than`, `at least`, `less than`, `at most`, `between` and `contains`, held against the record.
 *
 * BOTH ENGINES REFUSED THE FIRST FIVE AND ONE OF THEM REFUSED THE SIXTH. Measured on 24 September at
 * `facafeed` (`loop/research-m4-app.md`, brief 6): the record's sentence answered `n is at least 100`
 * with `VALUE_MALFORMED` and `n more than 100` and `n between 1 and 5` with `MATCH_OP_UNSUPPORTED`,
 * while this compiler named all three as operators "this build" does not read; and `what contains
 * rent`, which the record has answered since `2023a1c0`, came back from here as *"that is not
 * something a filter can say"*. The grammar under both has had `gt gte lt lte between` all along.
 *
 * SO THE RECORD IS DRIVEN, NOT DESCRIBED, as `where.test.ts` and `engines.test.ts` drive it: a real
 * SQLite record with the seed installed, every sentence asked of `k.list` and of `compile`/`matches`,
 * and the two answers held to the same rows, or to the same refusal in the same words. `data.ts` and
 * `installSeed` number the seed by position, so `seq` is one identity on both sides.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import { whereWords } from '../palette/spark.ts';
import { NOW, REGISTERS, ROWS } from './data.ts';
import { compile, matches, registerHref } from './where.ts';

function openSqlite(): Parameters<typeof openRecord>[0] {
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
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

const record = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  return k;
})();

/** One engine's answer: the refusal it gave, or the `seq` of every row it admitted. */
type Answer = { refused: string | null; seqs: number[] };

const askRecord = async (register: string, where: unknown): Promise<Answer> => {
  const k: Kernel = await record;
  /* 500 IS THE CEILING `list` CLAMPS TO; its default of 50 would read as a disagreement. */
  const out = k.list({ register, where: where as never, limit: 500 });
  if (!out.ok) return { refused: 'refusal' in out ? out.refusal.fix : 'a conflict, which a read cannot give', seqs: [] };
  const seqs = out.value.rows.map((r) => r.seq).filter((n): n is number => n !== null);
  assert.equal(seqs.length, out.value.rows.length, `${register}: a row came back with no seq`);
  return { refused: null, seqs: seqs.sort((a, b) => a - b) };
};

const askBrowser = (register: string, sentence: string): Answer => {
  const w = compile(register, sentence);
  return w.bad.length
    ? { refused: w.bad[0] ?? '', seqs: [] }
    : { refused: null, seqs: (ROWS[register] ?? []).filter((e) => matches(e, w, NOW)).map((e) => e.seq).sort((a, b) => a - b) };
};

/** Both engines asked one sentence, and held to one answer. */
async function agree(register: string, sentence: string): Promise<Answer> {
  const theirs = await askRecord(register, sentence);
  const ours = askBrowser(register, sentence);
  assert.equal(
    ours.refused === null,
    theirs.refused === null,
    `${register}: "${sentence}": the record ${theirs.refused === null ? 'answered' : `refused: ${theirs.refused}`}, the browser ${ours.refused === null ? 'answered' : `refused: ${ours.refused}`}`,
  );
  assert.deepEqual(ours.seqs, theirs.seqs, `${register}: "${sentence}" drew different rows`);
  return theirs;
}

/* ── the probe ───────────────────────────────────────────────────────────── */

test('THE PROBE: every sentence the brief measured refused now answers, in both engines, as the same rows', async () => {
  for (const [register, sentence] of [
    ['installments', 'number is at least 3'],
    ['installments', 'number more than 3'],
    ['installments', 'number between 1 and 5'],
    ['obligations', 'amount is at least GBP 2400'],
    ['obligations', 'what contains rent'],
  ] as const) {
    const said = await agree(register, sentence);
    assert.equal(said.refused, null, `${register}: ${sentence}`);
    assert.ok(said.seqs.length > 0, `${register}: "${sentence}" found nothing, so it proves nothing about rows`);
  }
});

/* ── the five ordered words ──────────────────────────────────────────────── */

test('EVERY ORDERED TYPE THE MIRROR HOLDS, in both spellings, admits the same rows in both engines', async () => {
  let found = 0;
  for (const [register, sentence] of [
    ['installments', 'number at least 3'],
    ['installments', 'number is more than 10'],
    ['installments', 'Instalment less than 4'],
    ['things', 'hue between 200 and 300'],
    ['things', 'hue is between 176 and 214'],
    ['skills', 'rev at most 2'],
    ['things', 'progress at most 60'],
    ['things', 'How far along is at least 50'],
    ['tasks', 'effort at least 86400'],
    ['obligations', 'amount at least GBP 2400'],
    ['obligations', 'amount is between GBP 1000 and GBP 5000'],
    ['obligations', 'amount less than 1350.00 gbp'],
    ['obligations', 'amount at least EGP 1'],
    ['accounts', 'balance less than GBP 0'],
    ['accounts', 'balance more than GBP -1240'],
    ['obligations', 'due at least 2026-09-01'],
    ['obligations', 'due is less than today'],
    ['obligations', 'due between today and +30d'],
    ['obligations', 'due more than eom, state is open'],
    ['updates', 'at at least 2026-08-31'],
    ['tools', 'seen between 2026-09-01 and 2026-09-03'],
    ['session', 'last_seen at most 2026-09-02'],
  ] as const) {
    const said = await agree(register, sentence);
    assert.equal(said.refused, null, `${register}: ${sentence}`);
    found += said.seqs.length;
  }
  assert.ok(found > 0);
});

test('A RANGE OF INSTANTS KEEPS ITS LAST DAY, where the tree\'s own `between` drops it', async () => {
  /* `tools.seen` holds four instants on the third. `between` in the tree compares the whole instant
     with the bare day and loses them; the sentence says the range as `gte` and `lte`, which cut an
     instant to its day, and so does this compiler. */
  const tree = await askRecord('tools', { field: 'seen', between: ['2026-09-01', '2026-09-03'] });
  const said = await agree('tools', 'seen between 2026-09-01 and 2026-09-03');
  assert.ok(said.seqs.length > tree.seqs.length, `the sentence kept ${said.seqs.length} and the tree ${tree.seqs.length}`);
});

test('A RANGE WITH ONE DAY WRITTEN OUT AND ONE RELATIVE IS ORDERED ON THE RECORD\'S CLOCK', async () => {
  /* THE CHECKER FOUND IT, AND IT IS A CLOCK AND NOT A WORD. `compile` put the two ends of a range of
     days in order at the wall clock, on the reasoning that two relative words move together; one
     written-out day and one relative word do not. With the mirror's `NOW` on 3 September and the wall
     clock on the 24th, `due between today and 2026-09-20` was four rows in the record and "today is
     past 2026-09-20" here, and the reverse sentence was refused by the record and answered, empty,
     here. `matches` is handed the record's clock by every caller in this app, so the check is too. */
  const said = await agree('obligations', 'due between today and 2026-09-20');
  assert.equal(said.refused, null);
  assert.ok(said.seqs.length > 0, 'the range found nothing, so it proves nothing about rows');
  const reverse = 'due between 2026-09-20 and today';
  const theirs = await askRecord('obligations', reverse);
  assert.match(theirs.refused ?? '', /the low value first/, 'the record no longer refuses the reversed range');
  assert.equal(askBrowser('obligations', reverse).refused, theirs.refused);
});

test('AND WHAT BOTH REFUSE, THEY REFUSE IN THE SAME WORDS', async () => {
  for (const [register, sentence, says] of [
    ['obligations', 'amount at least 100', /amount is money, and 100 with no currency is not an amount of money/],
    ['obligations', 'amount is between 1 and 2', /with no currency/],
    ['obligations', 'amount between GBP 1 and USD 2', /between takes one currency, and this range has two/],
    ['obligations', 'amount at least JPY 1.5', /JPY is counted to 0 decimal places, and 1.5 has more/],
    ['obligations', 'amount at least XYZ 1', /XYZ is not a currency ISO 4217 assigns/],
    ['obligations', 'state more than 3', /state is a enum, and more than is not something a enum can be asked/],
    ['obligations', 'what at least 3', /what is a text, and at least is not something a text can be asked/],
    ['things', 'repos between 1 and 2', /repos is a list, and between is not something a list can be asked/],
    ['installments', 'number is not at least 3', /a filter cannot say is not at least\. number less than 3 asks for the other side/],
    ['installments', 'number is not between 1 and 3', /a filter cannot say is not between/],
    ['installments', 'number at least', /at least what\?/],
    ['installments', 'number between 3', /between takes two values joined by and/],
    ['installments', 'number between 5 and 1', /between takes the low value first, and 5 is past 1/],
    ['installments', 'number at least 2.5', /2\.5 is not a value number can hold/],
    ['obligations', 'due at least someday', /someday is not a date/],
    ['obligations', 'due between +30d and today', /the low value first/],
  ] as const) {
    const theirs = await askRecord(register, sentence);
    const ours = askBrowser(register, sentence);
    assert.ok(theirs.refused, `the record answered "${sentence}", so this row asserts the wrong fact`);
    assert.match(theirs.refused ?? '', says, `the record no longer says this about "${sentence}"`);
    assert.equal(ours.refused, theirs.refused, `"${sentence}": the browser's refusal is not the record's`);
  }
});

test('A VALUE AN ENUM DECLARES IS STILL A VALUE, whatever words it starts with', () => {
  /* The declared values come first, in both engines: a state called `more_than_one` must stay
     filterable by `is`, and only the words it does not declare are read as an order.

     NO SEED ENUM DECLARES SUCH A VALUE, so the register is lent for the length of the test. The
     first version of this test asked `state is open`, which never reaches the ordered branch, and
     it stayed green with the guard deleted (`isValue` forced to `false`, checked on 24 September).
     This one goes red under that same mutation, on the first `bad` it reads. */
  REGISTERS.counts = { id: 'counts', name: 'Counts', title: 'size', fields: [{ id: 'size', type: 'enum', values: ['one', 'more_than_one'] }] } as never;
  try {
    const row = { seq: 1, fields: { size: 'more_than_one' } } as never;
    const is = compile('counts', 'size is more than one');
    assert.deepEqual(is.bad, []);
    assert.equal(matches(row, is, NOW), true);
    const not = compile('counts', 'size is not more than one');
    assert.deepEqual(not.bad, []);
    assert.equal(matches(row, not, NOW), false);
    /* AND A WORD IT DOES NOT DECLARE IS AN ORDER, which an enum cannot take, as in the record. */
    assert.match(compile('counts', 'size is more than two').bad[0] ?? '', /size is a enum, and more than is not something a enum can be asked/);
  } finally {
    delete REGISTERS.counts;
  }
});

test('A TEXT THAT STARTS WITH AN ORDERED WORD IS STILL A TEXT after `is`, in both engines', async () => {
  /* THE FIRST ATTEMPT'S CHECKER FOUND IT: both engines refused `what is more than coffee` as an order a
     text cannot be asked, where before the words were taught it was a value, and a merchant may be
     called anything. The negation is the row that proves it is read as a value on both sides: it
     admits every row whose `what` is not those words, and the same rows in each engine. */
  for (const sentence of ['what is more than coffee', 'Description is between jobs', 'what is not at least 3']) {
    const said = await agree('obligations', sentence);
    assert.equal(said.refused, null, sentence);
  }
  assert.ok((await agree('obligations', 'what is not at least 3')).seqs.length > 0, 'the negation of a text nobody holds kept no rows');
});

/* ── quantity ────────────────────────────────────────────────────────────── */

test('A QUANTITY IS ORDERED WITH ITS UNIT, in both engines, though no seed register declares one', async () => {
  /* THE FIRST ATTEMPT'S CHECKER FOUND IT: `ORDERED` here named `quantity` and `boundOf` had no case
     for it, so `weight at least 5 kg` was a value this field "cannot hold" while the record answered
     it. `schema.ts` leaves `quantity` out of the mirror's types because no seed register declares one,
     so the register is lent to both engines for the length of the test: installed into a record of its
     own, since the seeded one numbers rows the other tests hold the mirror to, and lent to the mirror
     as the enum test above lends `counts`. */
  const WEIGHTS = { id: 'weights', name: 'Weights', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'weight', type: 'quantity' }] };
  const HELD = [
    { what: 'a', weight: { value: 0.5, unit: 'kg' } },
    { what: 'b', weight: { value: 5, unit: 'kg' } },
    { what: 'c', weight: { value: 12, unit: 'kg' } },
    { what: 'd', weight: { value: 5, unit: 'lb' } },
    { what: 'e' },
  ];
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await k.install([{ id: 'register.weights', kind: 'register', body: WEIGHTS as never }])).ok);
  for (const fields of HELD) assert.ok(k.create('weights', fields, { actor: 'p_1' }).ok);
  const theirs = (sentence: string): string => {
    const out = k.list({ register: 'weights', where: sentence as never, limit: 50 });
    return out.ok ? out.value.rows.map((r) => String(r.fields.what)).sort().join(' ') : `refused ${'refusal' in out ? out.refusal.fix : ''}`;
  };
  REGISTERS.weights = WEIGHTS as never;
  ROWS.weights = HELD.map((fields, i) => ({ seq: i + 1, version: 1, created: '', fields })) as never;
  try {
    const ours = (sentence: string): string => {
      const w = compile('weights', sentence);
      return w.bad.length ? `refused ${w.bad[0]}` : (ROWS.weights ?? []).filter((e) => matches(e, w, NOW)).map((e) => String(e.fields.what)).sort().join(' ');
    };
    for (const [sentence, rows] of [
      ['weight at least 5 kg', 'b c'],
      ['weight is more than 5kg', 'c'],
      ['weight less than 5 kg', 'a'],
      ['weight at most 5 lb', 'd'],
      ['weight between 0.5 kg and 5 kg', 'a b'],
    ] as const) {
      assert.equal(theirs(sentence), rows, `the record on "${sentence}"`);
      assert.equal(ours(sentence), rows, `the browser on "${sentence}"`);
    }
    for (const [sentence, says] of [
      ['weight at least 5', /weight is a quantity, and 5 with no unit is not one/],
      ['weight between 1 kg and 2 lb', /between takes one unit, and this range has two/],
      ['weight between 5 kg and 1 kg', /the low value first/],
    ] as const) {
      assert.match(theirs(sentence), says, `the record no longer says this about "${sentence}"`);
      assert.equal(ours(sentence), theirs(sentence), `"${sentence}": the browser's refusal is not the record's`);
    }
  } finally {
    delete REGISTERS.weights;
    delete ROWS.weights;
  }
});

/* ── contains ────────────────────────────────────────────────────────────── */

test('`contains` IS READ HERE AS THE RECORD READS IT, over every text type and in either case', async () => {
  let found = 0;
  for (const [register, sentence] of [
    ['obligations', 'what contains rent'],
    ['obligations', 'Description contains RENT'],
    ['transactions', 'what contains "  "'],
    ['transactions', 'what contains Ltd'],
    ['things', 'note contains the'],
    ['skills', 'source contains github'],
    ['people', 'email contains example'],
    ['credentials', 'What it opens contains "api"'],
    ['obligations', 'what contains rent, state is open'],
    ['obligations', "what contains 'rent'"],
    ['obligations', 'what contains “Rent”'],
  ] as const) {
    const said = await agree(register, sentence);
    assert.equal(said.refused, null, `${register}: ${sentence}`);
    found += said.seqs.length;
  }
  assert.ok(found > 0);
});

test('AND WHAT THE RECORD REFUSES ABOUT `contains`, THIS REFUSES IN ITS WORDS', async () => {
  for (const [register, sentence] of [
    ['obligations', 'state contains open'],
    ['things', 'repos contains portage'],
    ['obligations', 'amount contains 4'],
    ['obligations', 'what contains'],
    ['obligations', 'what contains ""'],
    ['obligations', 'what contains not rent'],
    ['obligations', 'what contains rent or bills'],
    ['obligations', 'what contains "rent" or "bills"'],
    ['obligations', 'what contains "rent'],
    ['obligations', `what contains ${'x'.repeat(41)}`],
  ] as const) {
    const theirs = await askRecord(register, sentence);
    const ours = askBrowser(register, sentence);
    assert.ok(theirs.refused, `the record answered "${sentence}"`);
    assert.equal(ours.refused, theirs.refused, `"${sentence}": the browser's refusal is not the record's`);
  }
});

/* ── the sentence a screen prints ────────────────────────────────────────── */

test('A LEAF THE APP PRINTS READS BACK AS THAT LEAF, in both engines', async () => {
  /* `whereWords` is how the palette prints the record's tree, and its words are the ones taught
     here. Each leaf is printed, the printed sentence asked of both engines, and the rows held to the
     rows the leaf itself draws. Amounts under a thousand, because the printer groups thousands with a
     comma and the comma is the clause separator in both engines (reported with this change). */
  for (const [register, leaf] of [
    ['installments', { field: 'number', gte: 3 }],
    ['installments', { field: 'number', lt: 5 }],
    ['things', { field: 'hue', between: [200, 300] }],
    ['services', { field: 'cost', lte: { amount: 1_400, currency: 'GBP' } }],
    ['services', { field: 'cost', gt: { amount: 1_400, currency: 'GBP' } }],
    ['services', { field: 'cost', between: [{ amount: 1_000, currency: 'GBP' }, { amount: 5_000, currency: 'GBP' }] }],
    ['obligations', { field: 'what', contains: 'rent' }],
  ] as const) {
    const printed = whereWords(leaf as never);
    const said = await agree(register, printed);
    assert.equal(said.refused, null, `${register}: "${printed}"`);
    assert.deepEqual(said.seqs, (await askRecord(register, leaf)).seqs, `"${printed}" is not the leaf it was printed from`);
  }
});

test('AN ORDERED CLAUSE OPENS THE REGISTER WIDE, because no chip can carry it back yet', () => {
  /* `whereOf` in `api.ts` reads `in`, `not-in`, `before`, `after`, `not-on`, `has` and `lacks`, and a
     chip it cannot read falls to `<field> is <value>`: `amount:gte:GBP 2400` would come back as
     `amount is GBP 2400`, a list narrowed to the wrong rows under a block that drew the right ones.
     The wide address is the honest one until that reader learns the words. */
  assert.equal(registerHref('obligations', 'amount at least GBP 2400'), '/r/obligations');
  assert.equal(registerHref('obligations', 'what contains rent, state is open'), '/r/obligations');
  assert.equal(registerHref('obligations', 'due at least today'), '/r/obligations');
});
