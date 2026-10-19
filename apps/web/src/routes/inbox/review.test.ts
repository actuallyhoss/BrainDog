/**
 * To review: the doubtful arrivals the inbox lists with one line each, read from the open questions marked `review`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heldRaws, reviewOf } from './review.ts';

const row = { id: 'SG7', question: 'Orchard Prints, EGP 12.00', body: { register: 'ledger', review: true, raws: ['r1', 'r2'] } };

test('A REVIEW READS ONE LINE, the list it would be filed in and the arrivals it holds', () => {
  assert.deepEqual(reviewOf(row), { id: 'SG7', line: 'Orchard Prints, EGP 12.00', register: 'ledger', raws: ['r1', 'r2'] });
});

test('A BODY SENT AS TEXT IS READ, and the context stands in when the row has no question', () => {
  const sent = { id: 'SG8', body: JSON.stringify({ register: 'ledger', review: true, context: 'A text from your bank.' }) };
  assert.equal(reviewOf(sent)?.line, 'A text from your bank.');
});

test('A QUESTION NOT MARKED FOR REVIEW, OR NAMING NO LIST, IS NOT DRAWN', () => {
  assert.equal(reviewOf({ ...row, body: { register: 'ledger' } }), null);
  assert.equal(reviewOf({ ...row, body: { review: true } }), null);
  assert.equal(reviewOf(null), null);
});

test('THE ARRIVALS HELD ARE NAMED, so the plain list leaves them out', () => {
  assert.deepEqual([...heldRaws([reviewOf(row)!])], ['r1', 'r2']);
});
