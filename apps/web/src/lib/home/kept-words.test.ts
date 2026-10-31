/** A kept Today's Cash ahead in today's words, and a name he gave a widget left as his. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cashWordsNow, keptWordsNow } from './kept-words.ts';
import { words } from './words.ts';

test('A CASH WIDGET KEPT WITH OLD WORDS READS TODAY\'S', () => {
  const kept = {
    key: 'cash',
    heading: 'Money',
    cells: [
      { metric: 'cash-now', label: 'Cash now' },
      { metric: 'arriving-30d', label: 'To come in, next 30 days' },
      { metric: 'leaving-30d', label: 'Bills and usual spending, next 30 days' },
    ],
  };
  const now = cashWordsNow(kept);
  assert.equal(now.heading, words.money);
  assert.deepEqual(
    now.cells.map((c) => c.label),
    ['Cash now', words.comingIn, words.goingOut],
  );
  assert.equal(kept.heading, 'Money', 'the kept block itself is not changed');
});

test('A NAME HE GAVE IS HIS, AND ANOTHER WIDGET IS LEFT AS IT IS', () => {
  assert.deepEqual(cashWordsNow({ key: 'cash', heading: 'My cash', cells: [{ label: 'Salary in' }] }), { key: 'cash', heading: 'My cash', cells: [{ label: 'Salary in' }] });
  const other = { key: 'numbers', heading: 'Money', cells: [{ label: 'To come in, next 30 days' }] };
  assert.equal(cashWordsNow(other), other);
});

test('AN ANSWER\'S BLOCKS AND ITS DECLARED BLOCKS ARE BOTH SAID AFRESH', () => {
  const out = keptWordsNow({ blocks: [{ key: 'cash', readings: [{ label: 'Going out, 30 days' }] }], declared: { blocks: [{ key: 'cash', heading: 'Money' }] } });
  assert.equal(out.blocks[0]!.readings[0]!.label, words.goingOut);
  assert.equal(out.declared.blocks[0]!.heading, words.money);
});
