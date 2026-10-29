import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clausesOf, sentenceOf, windowOfBlock, withChoice, withWindow } from './sentence.ts';

const block = {
  kind: 'table',
  source: 'register.transactions',
  where: 'state is cleared, transfer is false, direction is out, category is Software, on at least bom',
};
const fields = [{ id: 'category', type: 'ref', to: 'categories' }, { id: 'on', type: 'day' }];

test('a widget reads as one sentence in the record’s words, its housekeeping unsaid', () => {
  const said = sentenceOf(block, 'Transactions', fields).map((p) => p.text).join(' ');
  assert.equal(said, 'Show money out for Software over this month in the usual order as a list');
  const newest = sentenceOf({ ...block, order: [{ field: 'on', dir: 'desc' }] }, 'Transactions', fields).map((p) => p.text).join(' ');
  assert.equal(newest, 'Show money out for Software over this month newest first as a list');
});

test('a window is read off the block and changed in place, every other clause kept', () => {
  assert.deepEqual(windowOfBlock(block), { id: 'month', field: 'on' });
  const wider = withWindow(block, '90d', 'on');
  assert.match(String(wider.where), /on after -90d$/u);
  assert.match(String(wider.where), /category is Software/u);
  assert.equal(withWindow(block, 'any', 'on').where, 'state is cleared, transfer is false, direction is out, category is Software');
});

test('a choice is set, changed or taken out', () => {
  assert.match(String(withChoice(block, 'category', 'Travel').where), /category is Travel/u);
  assert.doesNotMatch(String(withChoice(block, 'category', null).where), /category/u);
  assert.equal(clausesOf(withChoice({ kind: 'table' }, 'party', 'Fenwick Cloud').where).length, 1);
});

test('a clause the sentence cannot say is counted, never dropped', () => {
  const said = sentenceOf({ kind: 'table', where: 'amount at least 100' }, 'Transactions', fields).map((p) => p.text);
  assert.ok(said.includes('and one more condition'));
});
