import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { SlashStatus } from '@braindog/client';
import { asksShown, atCap, capOf, capSaid, nearCap, resetsWords } from './slash-asks.ts';

const RESETS = '2026-10-01T00:00:00.000Z';
const on = (used: number, cap = 80, tier: SlashStatus['tier'] = 'a'): SlashStatus => ({ tier, model: 'glm-5.3-flash', asks: { used, cap, resets: RESETS } });

test('tier a shows the month as used of cap, the unit an ask and nothing else', () => {
  assert.equal(asksShown(on(41)), '41 of 80');
  assert.equal(asksShown(on(0)), '0 of 80');
});

test('on byo the ask row is gone, not zeroed, and on his own key the count is listed with no cap', () => {
  assert.equal(asksShown(on(0, 80, 'byo')), null);
  assert.equal(asksShown(on(12, 80, 'b')), null);
  assert.equal(asksShown({ ...on(12, 80, 'b'), source: 'key', asks: { used: 12, cap: 80, resets: RESETS, capped: false } }), '12');
});

test('on his own key nothing is near or at a cap, since nothing stops at it', () => {
  const key: SlashStatus = { source: 'key', tier: 'b', model: 'claude-x', asks: { used: 500, cap: 80, resets: RESETS, capped: false } };
  assert.equal(nearCap(key), false);
  assert.equal(atCap(key), false);
});

test('near the cap is 80 per cent and at it is 100, both on tier a only', () => {
  assert.equal(nearCap(on(63)), false);
  assert.equal(nearCap(on(64)), true);
  assert.equal(atCap(on(79)), false);
  assert.equal(atCap(on(80)), true);
  assert.equal(atCap(on(81)), true);
  assert.equal(nearCap(on(80, 80, 'byo')), false);
  assert.equal(atCap(on(80, 80, 'b')), false);
});

test('a cap of zero is Slash turned off, which is at the cap from the first ask', () => {
  assert.equal(atCap(on(0, 0)), true);
  assert.equal(nearCap(on(0, 0)), true);
});

test('the reset is the first of the month in UTC, spoken as a day, whatever the zone the page is in', () => {
  assert.equal(resetsWords(RESETS), '1 October 2026');
  assert.equal(resetsWords('2027-01-01T00:00:00.000Z'), '1 January 2027');
});

test('a reset that is not a date is shown as it came rather than as a wrong day', () => {
  assert.equal(resetsWords('soon'), 'soon');
});

test('the typed limit: blank or not a number offers nothing to send', () => {
  assert.equal(capOf(''), null);
  assert.equal(capOf('   '), null);
  assert.equal(capOf('forty'), null);
});

test('the typed limit: any number goes to the engine, so a fraction or a negative gets its sentence and not ours', () => {
  assert.equal(capOf(' 40 '), 40);
  assert.equal(capOf('0'), 0);
  assert.equal(capOf('2.5'), 2.5);
  assert.equal(capOf('-1'), -1);
});

test('what saving says, with zero named for what it does', () => {
  assert.equal(capSaid(1), 'Slash answers up to 1 ask a month.');
  assert.equal(capSaid(40), 'Slash answers up to 40 asks a month.');
  assert.equal(capSaid(0), 'Slash is off until you raise the limit.');
});
