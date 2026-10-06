/**
 * What one agent run did, in plain lines (`run-lines.ts`): the plan Undo this run would put back, said the other way
 * round, with no id and no figure that may be money.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lineOf, RUN_LINES, runLines, runWords, type PlanStep } from './run-lines.ts';

const step = (s: Partial<PlanStep>): PlanStep => ({ title: 'Fix the login', label: null, from: null, to: null, do: 'set', ...s });

test('EACH CHANGE IS SAID AS WHAT THE RUN DID, the opposite of what Undo would do', () => {
  assert.equal(lineOf(step({ do: 'remove' })), 'Added Fix the login');
  assert.equal(lineOf(step({ do: 'restore' })), 'Deleted Fix the login');
  assert.equal(lineOf(step({ do: 'delete' })), 'Brought back Fix the login', 'Undo deletes again a row the run brought back');
  assert.equal(lineOf(step({ do: 'stop', title: 'a phone alert' })), 'Lined up a phone alert to go out');
  assert.equal(lineOf(step({ label: 'Status', from: 'Doing', to: 'Done' })), 'Set Status on Fix the login to Done');
  assert.equal(lineOf(step({ label: 'Due', from: '6 October 2026', to: 'empty' })), 'Cleared Due on Fix the login');
  assert.equal(lineOf(step({ do: 'untag', to: 'urgent' })), 'Added urgent to Fix the login');
  assert.equal(lineOf(step({ do: 'tag', to: 'urgent' })), 'Took urgent off Fix the login');
  assert.equal(lineOf(step({ label: null })), 'Changed Fix the login');
});

test('NO ID AND NO FIGURE IS SAID AS A VALUE, and a row with no name is a row', () => {
  assert.equal(lineOf(step({ label: 'Amount', from: 120000, to: 125000 })), 'Changed Amount on Fix the login', 'a number may be money in minor units');
  assert.equal(lineOf(step({ label: 'Estimate', from: '120000', to: '125000' })), 'Changed Estimate on Fix the login', 'nor a figure the record spoke as digits');
  assert.equal(lineOf(step({ label: 'Project', to: 'things#3' })), 'Changed Project on Fix the login');
  assert.equal(lineOf(step({ label: 'Owner', to: 'p_01M2PAZQ8X7H3K9V2N4B6C1D0E' })), 'Changed Owner on Fix the login');
  assert.equal(lineOf(step({ label: 'Notes', to: 'x'.repeat(60) })), 'Changed Notes on Fix the login', 'a long text is not read out');
  assert.equal(lineOf(step({ title: '', do: 'remove' })), `Added ${runWords.aRow}`);
});

test('THE PANEL SAYS EACH LINE ONCE, AT MOST EIGHT, then how many more', () => {
  const twice = runLines([step({ do: 'remove' }), step({ do: 'remove' })]);
  assert.deepEqual(twice, { lines: ['Added Fix the login'], more: null });
  const many = runLines(Array.from({ length: 12 }, (_, i) => step({ title: `Task ${i}`, do: 'remove' })));
  assert.equal(many.lines.length, RUN_LINES);
  assert.equal(many.more, 'and 4 more changes');
  assert.equal(runLines([]).lines.length, 0);
});

test('THE CONFIRM SAYS HOW MANY GO BACK AND HOW MANY ARE LEFT ALONE', () => {
  assert.equal(runWords.sure(12, 2), 'This puts back 12 changes. 2 are left as they are: they changed since or cannot come back.');
  assert.equal(runWords.sure(1, 0), 'This puts back 1 change.');
  assert.equal(runWords.sure(3, 1), 'This puts back 3 changes. 1 is left as it is: it changed since or cannot come back.');
});
