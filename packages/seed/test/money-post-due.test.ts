/**
 * A repeating line that posts itself (`src/modules/money/post-due.ts`): which accounts it may post to, and which posted
 * line a real charge takes the place of.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postable, postedTwin } from '../src/modules/money/scripts/post-due.js';
import { POST_DUE_RULES, POST_DUE_SCRIPT, REPLACE_POSTED_SCRIPT } from '../src/modules/money/post-due.ts';

const egp = (major: number) => ({ amount: Math.round(major * 100), currency: 'EGP' });
const account = (fields: Record<string, unknown>) => ({ id: 'acc_1', fields: { name: 'Cash box', ...fields } });

test('A LINE IS POSTED ONLY WHERE NO BANK FEED WRITES', () => {
  assert.deepEqual(postable(account({ no_feed: true })), { ok: true });
  assert.deepEqual(postable(account({})), { ok: true }, 'an account that says nothing and carries no feed mark');
  assert.equal(postable(account({ no_feed: false })).ok, false);
  assert.equal(postable(account({ last4: '4471' })).ok, false, 'bank messages may write it');
  /* A FEED SAYS SO IN "No bank feed" ITSELF (Mercury 1.3.0, Stripe 1.5.0), and its own field is no mark here. */
  assert.equal(postable(account({ no_feed: false, mercury_account: 'm_1' })).ok, false, 'a feed marks what it keeps');
  assert.equal(postable(account({ no_feed: true, mercury_account: 'm_1' })).ok, true, "a feed's own field is not read");
  assert.equal(postable(account({ no_feed: true, state: 'closed' })).ok, false);
  assert.equal(postable(null).ok, false);
});

test('A REAL CHARGE TAKES THE PLACE OF THE ONE POSTED LINE THAT IS THE SAME MONEY', () => {
  const line = (id: string, major: number, on: string) => ({ id, fields: { amount: egp(major), on } });
  const charge = line('real', 300, '2026-11-03');
  assert.equal((postedTwin(charge, [line('p1', 300, '2026-11-01')]) as { twin: { id: string } }).twin.id, 'p1');
  assert.equal((postedTwin(charge, [line('p1', 305, '2026-11-01')]) as { twin: { id: string } }).twin.id, 'p1', 'within 2%');
  assert.ok('none' in postedTwin(charge, [line('p1', 400, '2026-11-01')]), 'more than 2% off');
  assert.ok('none' in postedTwin(charge, [line('p1', 300, '2026-10-01')]), 'more than ten days apart');
  assert.ok('none' in postedTwin(charge, [line('p1', 300, '2026-11-01'), line('p2', 300, '2026-11-05')]), 'two that fit are left');
  /* NOTHING IS SAID WHERE NOTHING COULD BE THIS CHARGE, the ordinary cleared payment; two that fit are said, since one was not replaced. */
  assert.equal((postedTwin(charge, [line('p1', 400, '2026-11-01')]) as { quiet?: true }).quiet, true);
  assert.equal((postedTwin(charge, []) as { quiet?: true }).quiet, true);
  assert.equal((postedTwin(charge, [line('p1', 300, '2026-11-01'), line('p2', 300, '2026-11-05')]) as { quiet?: true }).quiet, undefined);
});

test('THE DAILY POST AND THE REPLACING RULE ARE MONEY-CORE SCRIPTS WITH NO EGRESS', () => {
  assert.deepEqual([POST_DUE_SCRIPT.runs, POST_DUE_SCRIPT.egress, POST_DUE_SCRIPT.writes], [{ every: '1d' }, [], ['recurring', 'transactions']]);
  assert.deepEqual([REPLACE_POSTED_SCRIPT.runs, REPLACE_POSTED_SCRIPT.writes], [{ rule: true }, ['transactions']]);
  assert.ok(POST_DUE_SCRIPT.source.includes('function postable('));
  assert.ok(REPLACE_POSTED_SCRIPT.source.includes('function postedTwin('));
  assert.equal(POST_DUE_RULES.length, 3);
});
