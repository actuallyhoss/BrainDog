/**
 * WHAT AN ANSWER SETS GOING (audit 6g, AG1): "Chase £4,800" says before the press that it drafts a reminder, and the
 * receipt says where the reminder is. Any other answer, or a question nobody's rule asked, says nothing more.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doesBefore, doesOf } from './does.ts';

test('a late invoice chased says it drafts a reminder, before and after', () => {
  assert.equal(doesBefore('rule:invoice-late', [{ title: 'Chase it' }, { title: 'Not yet' }]), 'Drafts a reminder for you to send.');
  const did = doesOf('rule:invoice-late', 'Chase it');
  assert.equal(did?.lead, 'A reminder is drafted on');
  assert.equal(did?.tail, 'Open it to read and send.');
});

test('another answer, or another asker, says nothing more', () => {
  assert.equal(doesOf('rule:invoice-late', 'Not yet'), null);
  assert.equal(doesOf('S12', 'Chase it'), null);
  assert.equal(doesOf(undefined, 'Chase it'), null);
  assert.equal(doesBefore('rule:recurring-missed', [{ title: 'It went through' }]), null);
});
