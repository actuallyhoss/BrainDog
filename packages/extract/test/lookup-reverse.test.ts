/**
 * `lookup`'s reverse tail and a field that splits (REC-A02 step 9).
 *
 * THE OTHER DIRECTION OF THE TAIL. The masked rule reads digits printed behind stars as the end of a LONGER stored value.
 * The reverse reads a stored value of three digits or more as the end of LONGER printed digits: a card typed as its last
 * three and printed with four, or an account typed as its last four and printed whole. Exactly one row is a match, two
 * are a person's question, and a short bare run is still a figure and never an account.
 *
 * AND A FIELD THAT SPLITS holds several values parted by commas, each a value of its row: an account the bank prints two
 * ways, and a card that was replaced.
 *
 * EVERY VALUE BELOW IS INVENTED.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, matchLiterals, run, splitValues, type Form, type Json } from '../src/extractors.ts';

const table = (...rows: { id: string; value: string }[]): [string, Json][] => rows.map((r) => [r.value, r.id]);

function read(form: Form, text: string, rows: { id: string; value: string }[]) {
  return run(form, text, fold(text), { currencies: { EGP: { exponent: 2 } }, lookup: () => rows }, 'extract.account');
}

test('A STORED VALUE THE PRINTED DIGITS END IN IS THE ONE ROW, behind stars or as a whole account number', () => {
  const card = { id: 'a_card', value: '395' };
  assert.deepEqual(matchLiterals('***7731', table(card), 'lookup'), ['a_card']);
  assert.deepEqual(matchLiterals('*** 7731', table(card), 'lookup'), ['a_card']);
  /* AN ACCOUNT'S WHOLE NUMBER, eight digits or more and no stars, against its last four. */
  assert.deepEqual(matchLiterals('0012345678 debited', table({ id: 'a_current', value: '5678' }), 'lookup'), ['a_current']);
});

test('TWO STORED VALUES THE DIGITS END IN ARE AMBIGUOUS, and not whichever row came first', () => {
  assert.equal(matchLiterals('***17731', table({ id: 'a', value: '395' }, { id: 'b', value: '7731' }), 'lookup'), 'ambiguous');
  assert.equal(matchLiterals('***17731', table({ id: 'b', value: '7731' }, { id: 'a', value: '395' }), 'lookup'), 'ambiguous');
});

test('A SHORT BARE RUN IS A FIGURE, never an account, and a value shorter than three is never a tail', () => {
  assert.deepEqual(matchLiterals('7731 at Corner Shop', table({ id: 'a', value: '395' }), 'lookup'), []);
  assert.deepEqual(matchLiterals('***7731', table({ id: 'a', value: '95' }), 'lookup'), []);
  /* AND `enum` NEVER READS IT. */
  assert.deepEqual(matchLiterals('***7731', table({ id: 'a', value: '395' }), 'enum'), []);
});

test('A FIELD THAT SPLITS READS EACH OF ITS VALUES, and one that does not reads the whole of it', () => {
  assert.deepEqual(splitValues('7731, 1234 ,, 77'), ['7731', '1234', '77']);
  const replaced = [{ id: 'a_card', value: '7731, 1234' }];
  const form = (split: boolean): Form => ({ lookup: { register: 'accounts', by: 'last4', after: 'ending ', ...(split ? { split: true } : {}) } }) as Form;
  const values = (found: unknown): Json[] => (found === 'ambiguous' ? ['ambiguous'] : (found as { values: Json[] }).values);
  assert.deepEqual(values(read(form(true), 'card ending 1234 used', replaced)), ['a_card']);
  assert.deepEqual(values(read(form(true), 'card ending 7731 used', replaced)), ['a_card']);
  assert.deepEqual(values(read(form(false), 'card ending 1234 used', replaced)), [], 'a field that does not split read one of its parts');
});
