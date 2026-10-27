/**
 * `engine-line.ts` `quietLine`: the one quiet line Today says under its brief. While the
 * model that writes is not answering, its key is closed or the record's own written brief is paused, the line says the
 * rules wrote what is above it; while it writes, nothing; and with the month spent, the month's own sentence.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { EngineHealth, SlashStatus } from '@braindog/client';
import { RULES_WRITE, quietLine, writingQuiet } from './engine-line.ts';

const engine = (state: EngineHealth['health']['state'], said = ''): EngineHealth =>
  ({ health: { state, last_ok: null, since: null }, said: { text: said, whose: null } }) as unknown as EngineHealth;
const PAUSED = 'The written brief is paused: the model did not answer the last time it was asked.';

test('WHILE THE MODEL WRITES NOTHING IS SAID', () => {
  assert.equal(quietLine(null), null);
  assert.equal(quietLine(engine('answering')), null);
  assert.equal(quietLine(engine('answering'), null, ''), null);
  assert.equal(writingQuiet(engine('answering')), false);
});

test('NOT ANSWERING, OR THE RECORD\'S BRIEF PAUSED, IS THE ONE QUIET LINE: the rules wrote what is above it', () => {
  assert.equal(quietLine(engine('not_answering', 'Slash’s model is not answering.')), RULES_WRITE);
  /* THE ENGINE MAY SAY "ANSWERING" FROM A HOST THAT COUNTED ANOTHER CALL: the record's own paused brief still says it. */
  assert.equal(quietLine(engine('answering'), null, PAUSED), RULES_WRITE);
  assert.equal(quietLine(null, null, PAUSED), RULES_WRITE);
  assert.equal(writingQuiet(null, PAUSED), true);
});

test('HIS OWN CLOSED KEY IS HIS TO FIX, so the line says what the engine says about it', () => {
  assert.equal(quietLine(engine('key_closed', 'Your own key was refused. Check it in Settings.')), `${RULES_WRITE} Your own key was refused. Check it in Settings.`);
  assert.equal(quietLine(engine('key_closed')), RULES_WRITE);
});

test('THE MONTH\'S ASKS SPENT IS THE MONTH\'S SENTENCE, said once', () => {
  const spent = { tier: 'a', model: 'included', asks: { used: 50, cap: 50, resets: '2026-11-01T00:00:00Z', capped: true } } as SlashStatus;
  const line = quietLine(engine('answering'), spent);
  assert.ok(line?.startsWith("Slash has used this month's 50 asks."), line ?? 'none');
  assert.equal(quietLine(engine('answering'), { ...spent, asks: { ...spent.asks, used: 3 } }), null);
});

test('PLAIN WORDS: no em dash, no model id', () => {
  assert.doesNotMatch(RULES_WRITE, /—|@cf|bge|llama/iu);
});
