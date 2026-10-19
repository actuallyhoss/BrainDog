/** Mail to the support address is told apart from a record's mailbox, so `email()` can forward it to a person. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSupportMail } from '../src/email.ts';

test('the support address matches whatever the case and spacing, and only itself', () => {
  assert.equal(isSupportMail('support@brain.dog', 'support@brain.dog'), true);
  assert.equal(isSupportMail(' Support@Brain.dog ', 'support@brain.dog'), true);
  assert.equal(isSupportMail('abc123@in.brain.dog', 'support@brain.dog'), false);
});

test('with no support address configured nothing is support mail, so a record token is never swallowed', () => {
  assert.equal(isSupportMail('support@brain.dog', undefined), false);
  assert.equal(isSupportMail('support@brain.dog', ''), false);
});
