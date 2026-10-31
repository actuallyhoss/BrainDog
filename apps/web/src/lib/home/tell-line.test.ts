/**
 * Today's slim Tell line (AH9) and what it says was last added (AH23), as this browser keeps them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAST_FOR, WEEK, keepTell, lastLines, readTell, slimShown } from './tell-line.ts';

test('the slim line stays a week from when it was first offered, and never once hidden', () => {
  const now = Date.UTC(2026, 9, 31);
  assert.equal(slimShown({}, now), true);
  assert.equal(slimShown({ from: now - WEEK + 1 }, now), true);
  assert.equal(slimShown({ from: now - WEEK }, now), false);
  assert.equal(slimShown({ from: now, hidden: true }, now), false);
});

test('what was last added is said for two days, then not', () => {
  const now = Date.UTC(2026, 9, 31);
  const lines = [{ said: 'Salma Fahmy', list: 'People', href: '/r/people' }];
  assert.deepEqual(lastLines({ last: { at: now, lines } }, now), lines);
  assert.deepEqual(lastLines({ last: { at: now - LAST_FOR, lines } }, now), []);
});

test('a browser that keeps nothing reads as a first visit, and a keep still answers the change', () => {
  assert.deepEqual(readTell('/nadia', 'p1'), {});
  assert.deepEqual(keepTell('/nadia', 'p1', { hidden: true }).hidden, true);
});

test('RG11: with no person, nothing is read and the change is only answered', () => {
  assert.deepEqual(readTell('/nadia', null), {});
  assert.deepEqual(keepTell('/nadia', null, { hidden: true }, { from: 1 }), { from: 1, hidden: true });
});
