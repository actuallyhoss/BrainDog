/**
 * Words agents repeat to the person (door audit D32): money as a person writes it, a choice's options by their words,
 * and a token's refusal said as what the call does and what the token may do, never as rungs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moneyPlain } from '../src/card.ts';
import { answersSaid } from '../src/methods/chat-answer.ts';
import { allows, type CallContext } from '../src/index.ts';

test('money in a question is said with its sign, and no minor part of nought', () => {
  assert.equal(moneyPlain('Renew Figma for GBP 39.00?'), 'Renew Figma for £39?');
  assert.equal(moneyPlain('Pay USD 1,250.50 to Wren'), 'Pay $1,250.50 to Wren');
  assert.equal(moneyPlain('EUR -12.00 back'), '−€12 back');
  assert.equal(moneyPlain('SAR 12,000.00 owed'), 'SAR 12,000.00 owed');
  assert.equal(moneyPlain('The API 2.00 release'), 'The API 2.00 release');
});

test('an option refusal names each option by its words', () => {
  const row = { body_kind: 'options', body: { options: [{ id: 'o1', label: 'Ship Friday' }, { id: 'o2', label: 'Wait a week' }] } };
  assert.equal(answersSaid(row, ['o1', 'o2']), 'o1 ("Ship Friday"), o2 ("Wait a week")');
  assert.equal(answersSaid({ body_kind: 'rowset' }, ['accept', 'reject']), 'accept, reject');
});

test('a read token asked to write is told what the call does and what the token may do', () => {
  const ctx = { principal: { kind: 'token', id: 't', scope: 'read', person: 'p_x', level: 'owner' } } as CallContext;
  const r = allows(ctx, 'append');
  assert.equal(r?.code, 'FORBIDDEN');
  assert.equal(r?.fix, 'This adds to the record, and this token only reads. Ask the owner for a token with a wider scope.');
  assert.doesNotMatch(r?.fix ?? '', /append|owner access/u);
});
