/**
 * A step the runtime cut off twice in a row is held for six hours (`src/alarm-cuts.ts`). The case is 29 October: the
 * daily look was cut at 07:00, 08:00, 09:00 and 09:09, and each cut reset the record's object.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CUT_HOLD_MS, CUTS_TO_HOLD, cutAgain, cutsOf, heldUntil, resetSaid, stepOf } from '../src/alarm-cuts.ts';

const T0 = Date.parse('2026-10-29T07:00:00Z');

test('ONE CUT HOLDS NOTHING; THE SECOND IN A ROW HOLDS THE STEP FOR SIX HOURS', () => {
  const once = cutAgain(null, 'look', T0);
  assert.deepEqual(once, { step: 'look', times: 1, at: T0 });
  assert.equal(heldUntil(once, 'look', T0 + 60_000), null);
  const twice = cutAgain(once, 'look', T0 + 3_600_000);
  assert.equal(twice.times, CUTS_TO_HOLD);
  assert.equal(heldUntil(twice, 'look', T0 + 2 * 3_600_000), T0 + 3_600_000 + CUT_HOLD_MS);
  assert.equal(heldUntil(twice, 'look', T0 + 3_600_000 + CUT_HOLD_MS), null);
  assert.equal(heldUntil(twice, 'act', T0 + 2 * 3_600_000), null);
});

test('A CUT IN ANOTHER STEP STARTS THE COUNT AGAIN', () => {
  const look = cutAgain(null, 'look', T0);
  assert.deepEqual(cutAgain(look, 'act', T0 + 1), { step: 'act', times: 1, at: T0 + 1 });
});

test('A SCRIPT NAMED IN ACT COUNTS AS ACT', () => {
  assert.equal(stepOf('act:match_payment'), 'act');
  const one = cutAgain(null, 'act:match_payment', T0);
  const two = cutAgain(one, 'act:settle', T0 + 1);
  assert.equal(two.times, 2);
  assert.notEqual(heldUntil(two, 'act', T0 + 2), null);
});

test('THE DRAIN IS NEVER HELD: it is what arms the next alarm', () => {
  const two = cutAgain(cutAgain(null, 'drain', T0), 'drain', T0 + 1);
  assert.equal(heldUntil(two, 'drain', T0 + 2), null);
});

test('A STORED VALUE THAT IS NOT A COUNT IS NONE', () => {
  assert.equal(cutsOf(undefined), null);
  assert.equal(cutsOf('look'), null);
  assert.deepEqual(cutsOf({ step: 'look', times: 2, at: T0 }), { step: 'look', times: 2, at: T0 });
});

/* R4 (review of 30 October): an alarm that threw was counted as cut, so the platform's retries held `act` for six hours. */
test('A STEP THAT THREW IS NOT A CUT; THE PLATFORM SAYING IT RESET THE OBJECT IS ONE', () => {
  assert.equal(resetSaid('Durable Object storage operation exceeded timeout which caused object to be reset.'), true);
  assert.equal(resetSaid('Durable Object reset because its code was updated.'), true);
  assert.equal(resetSaid('The Directory did not answer: fetch failed'), false);
  assert.equal(resetSaid('presets were not found'), false);
});
