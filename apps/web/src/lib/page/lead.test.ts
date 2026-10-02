/**
 * The page's headline: the first block a reader sees, when it is the page's sentence. Kiln declares two sentences on
 * one figure's `when:` and the record draws one, so the rule reads the first block drawn and not the first declared.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { leadIndex } from './lead.ts';

const lead = (drawn = true) => ({ kind: 'note', lead: true, drawn });

test('a page that opens on its sentence opens on it as the headline', () => {
  assert.equal(leadIndex([lead(), { kind: 'table', drawn: true }]), 0);
});

test('the sentence the record drew is the headline, though another was declared first', () => {
  assert.equal(leadIndex([lead(false), lead(), { kind: 'stat', drawn: true }]), 1);
});

test('a page whose first drawn block is a tile has no headline, and a sentence further down is not lifted', () => {
  assert.equal(leadIndex([{ kind: 'stat', drawn: true }, lead()]), -1);
  assert.equal(leadIndex([{ kind: 'note', drawn: true }]), -1, 'a note that is not the page sentence');
  assert.equal(leadIndex([lead(false)]), -1, 'nothing drawn at all');
  assert.equal(leadIndex([]), -1);
});
