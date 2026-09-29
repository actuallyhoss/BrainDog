/**
 * A sentence a rule fills writes money the way every other sentence the record keeps does.
 *
 * THE KERNEL HAD TWO SPELLINGS. `rules.ts`'s `moneyWords` wrote `toFixed` with no grouping and a hyphen for a minus, so a
 * question or a note stored `GBP 2400.00` and `GBP -39.00`, while `ingest.ts`'s `moneyText`, which a digest writes
 * through, wrote the same amounts `GBP 2,400.00` and `GBP −39.00`. `moneyWords` is `moneyText` now, and these cases
 * hold the two to one answer rather than to a string either could drift from.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillTemplate as fill, type Entry } from './index.ts';
import { moneyText } from './ingest.ts';

const row = (fields: Record<string, unknown>): Entry => ({ id: 'e_1', register: 'bills', seq: 1, fields }) as unknown as Entry;

test('A RULE WRITES MONEY AS THE DIGEST DOES: code first, grouped, and in the currency\'s own decimals', () => {
  for (const [amount, currency] of [[240_000, 'GBP'], [129_900, 'JPY'], [1_500, 'KWD'], [5_818_554, 'EGP']] as const)
    assert.equal(fill('{{amount}}', row({ amount: { amount, currency } })), moneyText(amount, currency), `${amount} ${currency}`);
  assert.equal(fill('{{amount}}', row({ amount: { amount: 240_000, currency: 'GBP' } })), 'GBP 2,400.00');
  assert.equal(fill('{{money:amount}}', row({ amount: { amount: 129_900, currency: 'JPY' } })), 'JPY 129,900');
});

test('A NEGATIVE IS WRITTEN WITH A TRUE MINUS, after the code, never a hyphen', () => {
  const said = fill('paid {{amount}}', row({ amount: { amount: -3_900, currency: 'GBP' } }));
  assert.equal(said, 'paid GBP −39.00');
  assert.ok(!said.includes('-'), said);
});
