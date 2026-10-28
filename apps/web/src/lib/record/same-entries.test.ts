import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sameEntries } from './same-entries.ts';
import type { Entry } from './schema.ts';

const row = (seq: number, version: number, what: string): Entry => ({ seq, version, fields: { what }, created: '2026-10-01T00:00:00Z', by: 'owner' });

test('AN ANSWER THAT SAYS NOTHING NEW DRAWS THE SAME CARDS, and any change of order, version or word is new', () => {
  const drawn = [row(1, 1, 'Call the bank'), row(2, 3, 'Pay the rent')];
  assert.equal(sameEntries(drawn, [row(1, 1, 'Call the bank'), row(2, 3, 'Pay the rent')]), true, 'the same rows from a new answer');
  assert.equal(sameEntries(drawn, [row(2, 3, 'Pay the rent'), row(1, 1, 'Call the bank')]), false, 'another order');
  assert.equal(sameEntries(drawn, [row(1, 1, 'Call the bank'), row(2, 4, 'Pay the rent')]), false, 'a row written since');
  assert.equal(sameEntries(drawn, [row(1, 1, 'Call the bank'), row(2, 3, 'Pay the rent now')]), false, 'the same version saying more');
  assert.equal(sameEntries(drawn, [row(1, 1, 'Call the bank')]), false, 'a row gone');
});
