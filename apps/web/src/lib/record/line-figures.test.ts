/**
 * RJ3 (review of 31 Oct j): A YEAR BEFORE THE AMOUNT WAS SAVED AS THE AMOUNT. RH4 took the first bare figure that counts
 * nothing, so "Car insurance 2027 3000" on Bills saved 2027 and "Rent Nov 2026 850" saved 2026.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { learnHome } from './api.ts';
import { REGISTERS } from './held.ts';
import { lineFigures } from './line-figures.ts';
import type { RegisterDecl } from './schema.ts';

REGISTERS.bills_rj3 = {
  id: 'bills_rj3',
  name: 'Bills',
  one: 'bill',
  title: 'name',
  mobile: ['name', 'amount', 'name'],
  fields: [
    { id: 'name', type: 'text' },
    { id: 'amount', type: 'money', required: true },
  ],
} as unknown as RegisterDecl;
learnHome('EGP');

const amountOf = (line: string): unknown => (lineFigures('bills_rj3', line, Date.UTC(2026, 9, 31)).fields.amount as { amount?: number } | undefined)?.amount;

test('RJ3: A YEAR IS NEVER THE AMOUNT WHEN ANOTHER FIGURE IS THERE', () => {
  assert.equal(amountOf('Car insurance 2027 3000'), 300000);
  assert.equal(amountOf('Car insurance 3000 2027'), 300000);
  assert.equal(amountOf('Rent 850 for flat 4'), 85000, 'RH4 came undone');
});

test('RJ3: A YEAR ALONE IS STILL READ', () => {
  assert.equal(amountOf('School fees 2026'), 202600);
});
