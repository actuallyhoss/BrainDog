/** A timeline's amounts are one set: where one carries pence, every amount does. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { timelineDetails } from './timeline.ts';

const rows = (amounts: string[]) => amounts.map((a) => ({ cells: ['2 Sep', 'Payee', a] }));

test('ONE AMOUNT WITH PENCE GIVES EVERY AMOUNT PENCE, and an amount of nothing still says nothing', () => {
  assert.deepEqual(timelineDetails(rows(['−£2,500', '−£964', '−£39.61', '−£0'])), ['−£2,500.00', '−£964.00', '−£39.61', '']);
});

test('whole amounts stay whole, and a cell that is no figure is left as it is said', () => {
  assert.deepEqual(timelineDetails(rows(['−£2,500', '−£48'])), ['−£2,500', '−£48']);
  assert.deepEqual(timelineDetails(rows(['Kiln', '−£4.50'])), ['Kiln', '−£4.50']);
});
