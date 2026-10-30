/**
 * `handlesSaid`: a note the record wrote with a run's or an instruction's handle in it ("Taken by S42.") is said in
 * words where it is drawn, and a note that only happens to hold such a word is left as written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlesSaid } from './names.ts';

const CLAUDE = { run: 'S42', agent: 'claude', client: 'claude-code', parent: null };

test('a run that took a thing says it took it, and another run is an agent', () => {
  assert.equal(handlesSaid('Taken by S42.', 'S42', CLAUDE), 'Took this.');
  assert.equal(handlesSaid('Taken by S42.', 'S42'), 'Took this.');
  assert.equal(handlesSaid('Taken by S42.', 'system'), 'Taken by an agent.');
});

test('the sweep and the instructions say what they are, never their handles', () => {
  assert.equal(handlesSaid('S883 ended before it saw this; it goes to the next run.', 'system'), 'The agent it was sent to ended before it saw this; it goes to the next one.');
  assert.equal(handlesSaid('S883 ended before it saw this.', 'system'), 'The agent it was sent to ended before it saw this.');
  assert.equal(handlesSaid('Passed over: S50 worked here after this step was left.', 'system'), 'Passed over: another agent worked here after this step was left.');
  assert.equal(handlesSaid('Redirected: IN5.', 'p_me'), 'Replaced by a newer instruction.');
  assert.equal(handlesSaid('Stopped by IN4.', 'p_me'), 'Stopped by an instruction.');
  assert.equal(handlesSaid('Paused by IN4.', 'p_me'), 'Paused by an instruction.');
  assert.equal(handlesSaid('Lifted by IN9.', 'p_me'), 'Lifted by a later instruction.');
});

test("a line's own run in a sentence of its own is its name, or an agent", () => {
  assert.equal(handlesSaid('S42 left a step for the release.', 'S42', CLAUDE), 'Claude Code left a step for the release.');
  assert.equal(handlesSaid('S42 left a step for the release.', 'S42'), 'An agent left a step for the release.');
  assert.equal(handlesSaid('Left by S42 for the release.', 'S42'), 'Left by an agent for the release.');
});

test('a word that only looks like a handle is kept', () => {
  assert.equal(handlesSaid('Moved the backups to S3.', 'p_me'), 'Moved the backups to S3.');
  assert.equal(handlesSaid('Moved the backups to S3.', 'S42'), 'Moved the backups to S3.');
  assert.equal(handlesSaid('Status set to Done', 'S42'), 'Status set to Done');
});
