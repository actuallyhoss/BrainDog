/**
 * The money row (today F4) and the line an answer leaves (today F7): the record's sentence taken apart into what, the
 * amount, how late and the answer that names the amount; and the outcome said with its object.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { amountAnswer, moneyRowOf, outcomeOf } from './money-row.ts';

test('a late invoice is a row: what, the amount on its own, how late, and no question the button already asks', () => {
  assert.deepEqual(moneyRowOf('Invoice 2026-041: brand system was due 38 days ago, £4,800. Chase it?', ['Chase it', 'Not yet']), {
    title: 'Invoice 2026-041: brand system',
    amount: '£4,800',
    late: '38 days late',
    asks: '',
    owed: true,
    kind: 'due',
    days: -38,
  });
  assert.deepEqual(moneyRowOf('Ledger Post, sending plan was due 4 days ago, £12.50. Did it go through?', ['It went through', 'It stopped']), {
    title: 'Ledger Post, sending plan',
    amount: '£12.50',
    late: '4 days late',
    asks: 'Did it go through?',
    owed: false,
    kind: 'due',
    days: -4,
  });
  assert.equal(moneyRowOf('Rent was due 1 day ago, $400 USD. Pay it?')?.late, '1 day late');
  /* WORDED ANY OTHER WAY, it is no money row. */
  assert.equal(moneyRowOf('Does Tallow get retired, or parked for another year?'), null);
  assert.equal(moneyRowOf('Update Kiln’s note and move Portage to earning?'), null);
});

test('the answer names the amount', () => {
  assert.equal(amountAnswer('Chase it', '£4,800'), 'Chase £4,800');
  assert.equal(amountAnswer('Not yet', '£4,800'), 'Not yet');
});

test('an answer leaves its outcome with its object, never only the option’s name', () => {
  assert.equal(outcomeOf('Chase it', { title: 'Invoice 2026-041: brand system', amount: '£4,800' }), 'Chased Invoice 2026-041: brand system for £4,800');
  assert.equal(outcomeOf('Accept', { title: 'Update Kiln’s note and move Portage to earning?' }), 'Accepted: Update Kiln’s note and move Portage to earning');
  assert.equal(outcomeOf('Park it another year', { title: 'Does Tallow get retired?' }), 'Parked it another year');
  assert.equal(outcomeOf('It went through', { title: 'Ledger Post', amount: '£39' }), '“It went through”');
});
