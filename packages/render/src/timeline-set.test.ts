/** A timeline's amounts are one set: where one carries pence, every amount does. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { timelineDetails } from './timeline.ts';

/* A LEDGER'S ROWS, each saying something past its amount (`timelineRich`), so the amounts are exact ones. */
const rows = (amounts: string[]) => amounts.map((a) => ({ cells: ['2 Sep', 'Payee', a, 'Card'] }));

test('ONE AMOUNT WITH PENCE GIVES EVERY AMOUNT PENCE, and an amount of nothing still says nothing', () => {
  assert.deepEqual(timelineDetails(rows(['−£2,500', '−£964', '−£39.61', '−£0'])), ['−£2,500.00', '−£964.00', '−£39.61', '']);
});

test('whole amounts stay whole, and a cell that is no figure is left as it is said', () => {
  assert.deepEqual(timelineDetails(rows(['−£2,500', '−£48'])), ['−£2,500', '−£48']);
  assert.deepEqual(timelineDetails(rows(['Kiln', '−£4.50'])), ['Kiln', '−£4.50']);
});

test('A TIMELINE WITH NO MONEY ROW SAYS ITS AMOUNTS AS ITS TABLE DOES: to the penny, whole from a thousand up (shared fix, 2 Nov)', () => {
  const plain = ['−£2,500', '−£964', '−£39.61'].map((a) => ({ cells: ['2 Sep', 'Payee', a] }));
  assert.deepEqual(timelineDetails(plain), ['−£2,500', '−£964.00', '−£39.61']);
  const large = ['−£2,500.50', '−£39.61'].map((a) => ({ cells: ['2 Sep', 'Payee', a] }));
  assert.deepEqual(timelineDetails(large), ['−£2,501', '−£39.61']);
});
