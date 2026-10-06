/**
 * The page header's sentence (DIRECTION §39): figures a step heavier, the phrase that needs the reader in red, and the
 * words between them as they were.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { partsOf } from './headline.ts';

const joined = (s: string, needs?: string) => partsOf(s, needs).map((p) => p.text).join('');

test('the figures in a sentence are parts of their own, with their currency and grouping', () => {
  const s = 'Cash is £33,850 across 2 accounts, and on what is due it runs out in 57 days.';
  assert.deepEqual(
    partsOf(s).filter((p) => p.fig).map((p) => p.text),
    ['£33,850', '2', '57'],
  );
  assert.equal(joined(s), s);
});

test('a number in words is a word, and a per cent stays with its figure', () => {
  assert.deepEqual(partsOf('Seven things are late.'), [{ text: 'Seven things are late.' }]);
  assert.deepEqual(
    partsOf('Margin is 12.5% this month.').filter((p) => p.fig).map((p) => p.text),
    ['12.5%'],
  );
});

test('the phrase that needs the reader is one part, red, and figures either side of it are still figures', () => {
  const s = 'Seven things are late, the oldest by 62 days. Twelve more need you.';
  const parts = partsOf(s, 'Seven things are late');
  assert.deepEqual(parts[0], { text: 'Seven things are late', needs: true });
  assert.deepEqual(parts.filter((p) => p.fig).map((p) => p.text), ['62']);
  assert.equal(joined(s, 'Seven things are late'), s);
});

test('a phrase the sentence does not hold marks nothing red', () => {
  const parts = partsOf('Nothing needs you.', 'late');
  assert.ok(parts.every((p) => !p.needs));
  assert.equal(parts.map((p) => p.text).join(''), 'Nothing needs you.');
});
