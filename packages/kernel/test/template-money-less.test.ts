/**
 * `{{short:amount-paid_so_far}}`: one money field less another, which is what is left of a part-paid amount.
 *
 * WHAT WAS WRONG. A drafted chase read "The invoice for EGP 12,000 was due on 30 Oct" on an invoice EGP 4,500 of which
 * had been paid: true as a sentence, and not the sum anybody is owed. A template could write a field and could not
 * subtract one, so every message about a part-paid amount named the whole of it.
 *
 * THE TEMPLATE NAMES BOTH FIELDS, and the kernel names neither: any two money fields of the row, in either money form.
 * Where the sum cannot be said (two currencies, nothing in the second field, more paid than owed) the first field is
 * written as the form writes it alone, which is the sentence the template wrote before it could subtract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillTemplate, type Entry } from '../src/index.ts';
import { filling } from '../src/rules.ts';

const NOW = Date.UTC(2026, 10, 10, 12);

const row = (fields: Record<string, unknown>): Entry => ({
  id: '01JB0000000000000000000000',
  register: 'obligations',
  seq: 8,
  fields: fields as never,
  state: null,
  version: 1,
  created_at: '2026-10-01T09:00:00.000Z',
  updated_at: '2026-10-01T09:00:00.000Z',
  deleted_at: null,
});

const money = (amount: number, currency: string) => ({ amount, currency });
const PART_PAID = row({ what: 'Poster run', amount: money(1_200_000, 'EGP'), paid_so_far: money(450_000, 'EGP'), due: '2026-10-30' });
const left = (amount: unknown, paid: unknown, form = 'short') => fillTemplate(`{{${form}:amount-paid_so_far}}`, row({ amount, paid_so_far: paid }), NOW);

test('a part-paid invoice is chased for what is left of it', () => {
  assert.equal(fillTemplate('{{short:amount-paid_so_far}}', PART_PAID, NOW), 'EGP 7,500');
  assert.equal(
    fillTemplate('{{short:amount-paid_so_far}} of the invoice for {{short:amount}} is still to pay, due on {{on:due}}.', PART_PAID, NOW),
    'EGP 7,500 of the invoice for EGP 12,000 is still to pay, due on 30 Oct.',
  );
});

test('the form a note keeps subtracts too, with the code and every decimal', () => {
  assert.equal(fillTemplate('{{money:amount-paid_so_far}}', PART_PAID, NOW), 'EGP 7,500.00');
  assert.equal(left(money(240_000, 'GBP'), money(39_950, 'GBP'), 'money'), 'GBP 2,000.50');
});

test('what is left keeps its minor part, its sign and its currency\'s own decimals', () => {
  assert.equal(left(money(240_000, 'GBP'), money(39_950, 'GBP')), '£2,000.50');
  assert.equal(left(money(129_900, 'JPY'), money(29_900, 'JPY')), '¥100,000');
  assert.equal(left(money(2_000, 'KWD'), money(500, 'KWD')), 'KWD 1.500');
  assert.equal(left(money(1_200_000, 'egp'), money(450_000, 'EGP')), 'EGP 7,500');
});

test('paid in full leaves nought, and nothing paid leaves all of it', () => {
  assert.equal(left(money(1_200_000, 'EGP'), money(1_200_000, 'EGP')), 'EGP 0');
  assert.equal(left(money(1_200_000, 'EGP'), money(0, 'EGP')), 'EGP 12,000');
});

test('any two money fields of the row, whatever they are called', () => {
  const r = row({ budget: money(500_000, 'USD'), spent: money(125_050, 'USD') });
  assert.equal(fillTemplate('{{short:budget-spent}}', r, NOW), '$3,749.50');
  assert.equal(fillTemplate('{{short:spent-budget}}', r, NOW), '$1,250.50');
});

test('two currencies are never subtracted: the first field is written alone', () => {
  assert.equal(left(money(1_200_000, 'EGP'), money(450_000, 'USD')), 'EGP 12,000');
  assert.equal(left(money(1_200_000, 'EGP'), money(450_000, 'USD'), 'money'), 'EGP 12,000.00');
});

test('nothing in the second field writes the first alone', () => {
  for (const none of [undefined, null, '']) assert.equal(left(money(1_200_000, 'EGP'), none), 'EGP 12,000');
  assert.equal(fillTemplate('{{short:amount-nowhere}}', PART_PAID, NOW), 'EGP 12,000');
});

test('a second field that holds no money writes the first alone', () => {
  assert.equal(left(money(1_200_000, 'EGP'), 'some'), 'EGP 12,000');
  assert.equal(left(money(1_200_000, 'EGP'), 4500), 'EGP 12,000');
});

test('a second field that is money in shape only writes the first alone, and never throws or writes NaN', () => {
  for (const amount of ['4500', 'some', 0.5, null, Number.NaN]) assert.equal(left(money(1_200_000, 'EGP'), { amount, currency: 'EGP' }), 'EGP 12,000');
  for (const currency of [null, 818, undefined]) assert.equal(left(money(1_200_000, 'EGP'), { amount: 450_000, currency }), 'EGP 12,000');
});

test('more paid than owed writes the first alone, never an amount under nought', () => {
  assert.equal(left(money(1_200_000, 'EGP'), money(1_200_001, 'EGP')), 'EGP 12,000');
  assert.equal(left(money(1_200_000, 'EGP'), money(-100, 'EGP')), 'EGP 12,001');
});

test('nothing in the first field writes the dash, and a first field that holds no money writes as it did', () => {
  for (const none of [undefined, null, '']) assert.equal(left(none, money(450_000, 'EGP')), '—');
  assert.equal(left('Poster run', money(450_000, 'EGP')), 'Poster run');
  assert.equal(left(3, money(450_000, 'EGP')), '3');
});

test('the forms that held before hold still', () => {
  assert.equal(fillTemplate('{{amount}}', PART_PAID, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{money:amount}}', PART_PAID, NOW), 'EGP 12,000.00');
  assert.equal(fillTemplate('{{short:amount}}', PART_PAID, NOW), 'EGP 12,000');
  assert.equal(fillTemplate('{{short:paid_so_far}}', PART_PAID, NOW), 'EGP 4,500');
  assert.equal(fillTemplate('{{on:due}} {{ago:due}} {{due}}', PART_PAID, NOW), '30 Oct 11 days ago 2026-10-30');
  assert.equal(fillTemplate('{{id}}', PART_PAID, NOW), 'obligations#8');
});

test('a form that is no money form, and a spelling that is not two fields, stay as typed', () => {
  for (const typed of ['{{on:due-amount}}', '{{ago:due-due}}', '{{shorts:amount-paid_so_far}}', '{{amount-paid_so_far}}', '{{short:amount-}}', '{{short:amount-paid_so_far-due}}', '{{short:amount - paid_so_far}}'])
    assert.equal(fillTemplate(typed, PART_PAID, NOW), typed);
});

test('a field that never leaves the record is counted on either side of the minus', () => {
  const by = (names: string[]) => ({ sealed: new Set(names) });
  assert.equal(filling('{{short:amount-paid_so_far}}', PART_PAID, NOW, by([])).secret, null);
  assert.equal(filling('{{short:amount-paid_so_far}}', PART_PAID, NOW, by(['amount'])).secret, '{{short:amount-paid_so_far}}');
  assert.equal(filling('{{short:amount-paid_so_far}}', PART_PAID, NOW, by(['paid_so_far'])).secret, '{{short:amount-paid_so_far}}');
  /* A sealed field that holds nothing gave the text nothing, as with one field. */
  assert.equal(filling('{{short:amount-paid_so_far}}', row({ amount: money(1_200_000, 'EGP') }), NOW, by(['paid_so_far'])).secret, null);
});
