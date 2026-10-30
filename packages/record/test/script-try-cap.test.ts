/**
 * Twenty trials by agents a UTC day on one record (`src/script-try-cap.ts`).
 *
 * The count is the caller's; this holds the line it is read against: nineteen run leaves one, twenty run refuses the
 * next in the words an agent reads, and a count that could not be read refuses rather than opening the cap.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TRIALS_A_DAY, TRIALS_SPENT, trialDay, trialsLeft } from '../src/script-try-cap.ts';

test('nineteen trials today leave one, and none leave twenty', () => {
  assert.deepEqual(trialsLeft(19), { ok: true, value: 1 });
  assert.deepEqual(trialsLeft(0), { ok: true, value: TRIALS_A_DAY });
});

test('the twentieth spent refuses the next with OUT_OF_BOUNDS and the sentence', () => {
  const out = trialsLeft(20);
  assert.equal(out.ok, false);
  if (out.ok || !('refusal' in out)) return assert.fail('refused with a refusal');
  assert.equal(out.refusal.code, 'OUT_OF_BOUNDS');
  assert.equal(out.refusal.fix, 'Agents have tried 20 scripts here today, the most they may. Propose it untried, or try again tomorrow.');
  assert.equal(out.refusal.fix, TRIALS_SPENT);
  assert.equal(trialsLeft(57).ok, false);
});

test('a count that could not be read is the cap, never an open door', () => {
  assert.equal(trialsLeft(Number.NaN).ok, false);
});

test('the day is the UTC day, so a trial a minute before midnight UTC and one a minute after are counted apart', () => {
  assert.equal(trialDay(Date.parse('2026-10-14T23:59:00Z')), '2026-10-14');
  assert.equal(trialDay(Date.parse('2026-10-15T00:01:00Z')), '2026-10-15');
});
