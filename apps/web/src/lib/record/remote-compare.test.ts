/**
 * THE SIX COMPARE WORDS AND THE "or" JOIN, READ BY A RECORD AND NOT ONLY BY THE SAMPLE.
 *
 * `chips-compare.test.ts` taught `whereOf` the six words and `join=any`, and measured the other half
 * before it was written: the register list on a record never reads chips through `whereOf`. `treeOf`
 * in `remote.ts` turns each chip into one of the record's leaves on its own, and it read neither.
 * Measured against the seed installed into a real kernel, before this file's fix:
 *
 *     f=amount:gte:GBP 2400     reached the record as { field: 'amount', is: 'GBP 2400' }
 *                               and was refused MONEY_LITERAL_NEEDS_CURRENCY; the sample drew 25 rows
 *     f=what:contains:rent      reached it as { field: 'what', is: 'rent' }: 0 rows, the sample 3
 *     join=any                  ignored, so an or-group's chips were ANDed on both sides
 *
 * SO EVERY CASE HERE ASKS THREE THINGS ONE QUESTION: the sample through `list`, the record through
 * `treeOf` and `k.list`, and the record through the sentence the chips were minted from. A link is
 * honest only when all three draw the same rows, and two of them agreeing with each other is the
 * trap `remote.test.ts`'s header describes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { NOW, ORDER, installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { chipsOf, joinOf, REGISTERS } from './api.ts';
import { list } from './fixtures/readers.ts';
import { ROWS } from './fixtures/sample.ts';
import { entryOf, refMapOf, treeOf, type RecordRow, type Refs } from './remote.ts';
import { compile, type Clause } from './where.ts';

type Sql = Parameters<typeof openRecord>[0];

function openSqlite(): Sql {
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
  return sql as unknown as Sql;
}

const bySeq = (a: number, b: number) => a - b;

/** The seed in a real kernel, once for the file, with the ULID-to-number map for every register. */
const seeded = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const out = await installSeed(k);
  assert.ok(out.ok, JSON.stringify(out));
  const refs: Refs = new Map(
    ORDER.map((r) => {
      const rows = k.list({ register: r, limit: 500 });
      assert.ok(rows.ok, r);
      return [r, refMapOf(r, rows.value.rows as unknown as RecordRow[])] as const;
    }),
  );
  return { k, refs };
})();

/** An answer: the row numbers, or the refusal in the words it came with. */
type Drawn = number[] | string;

const recordRows = (k: Kernel, refs: Refs, register: string, where: unknown): Drawn => {
  const out = k.list({ register, ...(where === undefined ? {} : { where: where as never }), limit: 500 });
  if (!out.ok) return 'refusal' in out ? `${out.refusal.code}: ${out.refusal.fix}` : 'a conflict';
  return (out.value.rows as unknown as RecordRow[]).map((r) => entryOf(register, r, refs).seq).sort(bySeq);
};

/** One address, asked of the sample and of the record the way the register screen asks each. */
async function address(register: string, query: string, q = ''): Promise<{ sample: Drawn; record: Drawn }> {
  const { k, refs } = await seeded;
  const params = new URLSearchParams(query);
  const filters = chipsOf(params);
  const join = joinOf(params);
  return {
    sample: list(register, { filters, q, ...(join ? { join } : {}) }).entries.map((e) => e.seq).sort(bySeq),
    record: recordRows(k, refs, register, treeOf(register, filters, q, refs, join)),
  };
}

/** A clause as a chip, spelled the way `chips-compare.test.ts` spells one: the compiled operator, the value encoded. */
const chipOf = (c: Clause): string => `f=${c.field}:${c.op}:${encodeURIComponent('day' in c ? c.day : c.values.join(','))}`;

test('EVERY COMPARE CHIP OPENS THE SAME ROWS ON A RECORD AS ON THE SAMPLE, and they are the rows its sentence admits there', async () => {
  const { k, refs } = await seeded;
  /* THE BOUNDS `chips-compare.test.ts` SWEEPS WITH, over the declarations rather than a hand-picked
     few, so a type the sentence orders and `treeOf` cannot hand over shows up here by name. */
  const one: Record<string, string> = { int: '3', duration: '3', decimal: '0.5', money: 'GBP 2400', quantity: '5 kg', day: 'today', instant: 'today' };
  const two: Record<string, string> = { int: '1 and 5', duration: '1 and 5', decimal: '0.1 and 0.9', money: 'GBP 10 and GBP 2400', quantity: '1 kg and 5 kg', day: 'today and +30d', instant: '-30d and today' };
  const textual = new Set(['text', 'document', 'url', 'email']);
  const off: string[] = [];
  const words = new Set<string>();
  let swept = 0;
  let drew = 0;
  for (const register of ORDER) {
    for (const field of REGISTERS[register]?.fields ?? []) {
      const sentences: string[] = [];
      if (one[field.type]) {
        for (const word of ['more than', 'at least', 'less than', 'at most']) sentences.push(`${field.id} ${word} ${one[field.type]}`);
        sentences.push(`${field.id} between ${two[field.type]}`);
      }
      if (textual.has(field.type)) {
        const held = (ROWS[register] ?? []).map((e) => e.fields[field.id]).find((v): v is string => typeof v === 'string' && /[a-z]{3}/i.test(v));
        sentences.push(`${field.id} contains ${held ? /[a-z]{3,}/i.exec(held)![0] : 'the'}`);
      }
      for (const sentence of sentences) {
        const w = compile(register, sentence);
        assert.deepEqual(w.bad, [], `${register}: ${sentence} did not compile, so the sweep is not asking what it means to`);
        for (const c of w.clauses) words.add(c.op);
        const { sample, record } = await address(register, w.clauses.map(chipOf).join('&'));
        const said = recordRows(k, refs, register, sentence);
        if (JSON.stringify(record) !== JSON.stringify(sample) || JSON.stringify(said) !== JSON.stringify(sample))
          off.push(`${register}: ${sentence}\n  sample ${JSON.stringify(sample)}\n  chips  ${JSON.stringify(record)}\n  words  ${JSON.stringify(said)}`);
        swept += 1;
        if (Array.isArray(sample) && sample.length > 0) drew += 1;
      }
    }
  }
  assert.deepEqual(off, [], `${off.length} of ${swept} compare chips opened other rows on a record:\n${off.join('\n')}`);
  assert.deepEqual([...words].sort(), ['between', 'contains', 'gt', 'gte', 'lt', 'lte'], 'the sweep stopped reaching one of the six words');
  assert.ok(swept >= 100, `only ${swept} clauses were swept, so this test stopped measuring anything`);
  assert.ok(drew >= 30, `only ${drew} of ${swept} chips drew a row, so agreeing on nothing is most of what was measured`);
});

test('the two chips measured before the fix open on a record the rows the sample opens', async () => {
  const amount = await address('obligations', 'f=amount:gte:GBP%202400');
  assert.deepEqual(amount.record, amount.sample);
  assert.equal((amount.record as number[]).length, 25, 'the seed moved, so the measurement in the header is stale');

  /* A WORD OF THE SEED'S BILLS IN ANOTHER CASE. "Studio rent" left the bills in 29cc2072d, since the rent is a repeating
     item now, so `rent`, the word the header measured, names none; "Audit fee" is two of them. */
  const word = await address('obligations', 'f=what:contains:audit');
  assert.deepEqual(word.record, word.sample);
  assert.equal((word.record as number[]).length, 2, 'the seed moved, so the measurement in the header is stale');

  /* `between` OVER A DAY ARRIVES AS ONE CHIP ONLY WHEN SOMEBODY TYPES IT, since `compile` makes a
     range of days two clauses and so two chips. Typed, it is still the range. */
  const typed = await address('obligations', 'f=due:between:today,%2B30d');
  assert.deepEqual(typed.record, typed.sample);
  assert.ok((typed.record as number[]).length > 0, 'nothing is due in the next thirty days, so this asks nothing');
});

test('UNDER join=any THE CHIPS ARE ONE OR-GROUP ON A RECORD, as they are on the sample and in the sentence', async () => {
  const { k, refs } = await seeded;
  const sentence = 'state is open, or due before today';
  const anyOf = await address('tasks', 'f=state:in:open&f=by:before:today&join=any');
  assert.deepEqual(anyOf.record, anyOf.sample);
  assert.deepEqual(anyOf.record, recordRows(k, refs, 'tasks', sentence));

  /* WITHOUT THE WORD THEY ARE ANDED, on both sides, as every address written before it is. */
  const allOf = await address('tasks', 'f=state:in:open&f=by:before:today');
  assert.deepEqual(allOf.record, allOf.sample);
  assert.notDeepEqual(allOf.record, anyOf.record, 'the seed answers the same rows either way, so this test cannot tell "and" from "or"');

  /* A COMPARE CHIP INSIDE THE GROUP, which is the case both halves of this file meet in. */
  const mixed = await address('obligations', 'f=amount:gte:GBP%202400&f=state:in:paid&join=any');
  assert.deepEqual(mixed.record, mixed.sample);
  assert.deepEqual(mixed.record, recordRows(k, refs, 'obligations', 'amount at least GBP 2400, or state is paid'));

  /* AND THE SEARCH BOX STAYS ANDED WITH THE WHOLE GROUP, never becoming one more "or": a word typed
     into the box narrows what the chips opened, whichever way they are joined. */
  const boxed = await address('tasks', 'f=state:in:open&f=by:before:today&join=any', 'invoice');
  assert.deepEqual(boxed.record, boxed.sample);
  assert.ok((boxed.record as number[]).length < (anyOf.record as number[]).length, 'the box narrowed nothing, so this asks nothing');
});

test('`not-on`, THE CHIP registerHref MINTS FOR `due is not today`, IS THE NEGATION ON A RECORD TOO', async () => {
  /* IT FELL TO THE LAST LINE OF `leafOf` AND WENT OVER AS `is`, which is the inversion `whereOf`
     already had and lost on the sample. Measured on this seed: the sentence and the
     sample drew all 40 obligations, and the chip on a record drew none, because nothing is due today.
     Nothing in this file's sweep mints the chip, so the sweep could not see it. */
  const { k, refs } = await seeded;
  const not = await address('obligations', 'f=due:not-on:today');
  assert.deepEqual(not.record, not.sample);
  assert.deepEqual(not.record, recordRows(k, refs, 'obligations', 'due is not today'));
  assert.ok((not.record as number[]).length > 0, 'the sentence admits nothing, so this asks nothing');
});

test('ONE CHIP UNDER join=any IS THE CHIP, and any other spelling of the word is the plain "and"', async () => {
  const { refs } = await seeded;
  const params = new URLSearchParams('f=state:in:open&join=any');
  assert.deepEqual(treeOf('tasks', chipsOf(params), '', refs, joinOf(params)), { field: 'state', is: 'open' });
  assert.equal(joinOf(new URLSearchParams('join=all')), undefined);
  assert.equal(joinOf(new URLSearchParams('join=ANY')), undefined);
});
