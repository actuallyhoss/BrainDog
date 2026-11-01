import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { SlashAsked, SlashStatus } from '@braindog/client';
import { asksShown, atCap, backgroundLine, capOf, capSaid, LEDGER_FETCHED, nearCap, purposeLines, resetsWords, spentIn } from './slash-asks.ts';

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
  assert.equal(capSaid(1), 'Slash answers up to 1 question a month.');
  assert.equal(capSaid(40), 'Slash answers up to 40 questions a month.');
  assert.equal(capSaid(0), 'Slash is off until you raise the limit.');
});

test('a background pattern call is named by its question, and any other unfiled pattern is a drafted pattern', () => {
  const NOW = Date.parse('2026-10-02T12:00:00.000Z');
  const row = (id: string, question: string | null): SlashAsked => ({ id, ts: '2026-10-02T09:00:00.000Z', kind: 'pattern', status: 'ok', code: null, question, model: 'glm-5.3-flash', filed: null });
  const month = spentIn(
    [row('a', "Slash's page headlines"), row('b', "Slash's skill draft"), row('c', "Slash's daily look"), row('d', 'What repeats in the inbox'), row('e', null)],
    '2026-10',
    NOW,
  );
  const lines = month.days.flatMap((d) => d.lines);
  assert.deepEqual(
    lines.map((l) => [l.id, l.what, l.background]),
    [
      ['a', 'Page headlines written', true],
      ['b', 'Skill revised', true],
      ['c', 'Daily look written', true],
      ['d', 'Pattern drafted for the inbox', true],
      ['e', 'Pattern drafted for the inbox', true],
    ],
  );
});

/* THE MONTH BY PURPOSE. The ledger says what each ask was for, so the section counts by that and no
   longer by the call's kind, and a host built before the column falls back to the kind. */
const NOON = Date.parse('2026-10-02T12:00:00.000Z');
const asked = (id: string, over: Partial<SlashAsked>): SlashAsked => ({
  id,
  ts: '2026-10-02T09:00:00.000Z',
  kind: 'pattern',
  status: 'ok',
  code: null,
  question: null,
  model: 'glm-5.3-flash',
  filed: null,
  ...over,
});
const many = (n: number, prefix: string, over: Partial<SlashAsked>): SlashAsked[] => Array.from({ length: n }, (_, i) => asked(`${prefix}${i}`, over));

test('the month is counted by what each ask was for, one line a purpose, and the lines add up to the two counts', () => {
  const month = spentIn(
    [
      ...many(4, 'u', { purpose: 'understand', question: "Slash's reading of who is who" }),
      ...many(9, 'h', { purpose: 'headline', question: "Slash's page headlines" }),
      ...many(2, 'q', { kind: 'read', purpose: 'ask', question: 'What is late' }),
      asked('r', { kind: 'read', purpose: 'automation', question: 'rule.01JABCDEFGHJKMNPQRSTVWXYZ0 step 2' }),
    ],
    '2026-10',
    NOON,
  );
  assert.deepEqual(purposeLines(month, true), ['Page headlines: 9', 'Read what arrived: 4']);
  assert.deepEqual(purposeLines(month, false), ['Your questions: 2', 'Automations: 1']);
  assert.equal(month.background, 13);
  assert.equal(month.asks, 3);
});

test('a purpose is read off the row and never off its kind: a headline that filed is still background work', () => {
  const month = spentIn([asked('h', { purpose: 'headline', filed: 'SG4', question: "Slash's page headlines" })], '2026-10', NOON);
  assert.equal(month.background, 1);
  assert.equal(month.asks, 0);
  assert.equal(month.days[0]?.lines[0]?.background, true);
});

test('a row with no purpose falls back to its kind', () => {
  const month = spentIn(
    [
      asked('a', { kind: 'read', question: 'What is late' }),
      asked('b', { question: "Slash's page headlines" }),
      asked('c', { kind: 'prose' }),
      asked('d', { question: "Slash's reading of who is who" }),
    ],
    '2026-10',
    NOON,
  );
  assert.deepEqual(purposeLines(month, false), ['Your questions: 1']);
  assert.deepEqual(purposeLines(month, true), ['Digest summaries: 1', 'Page headlines: 1', 'Read what arrived: 1']);
});

test('a purpose this screen has no word for is counted as other work, never under the host\'s own name', () => {
  const month = spentIn(many(3, 'x', { purpose: 'tidy_v2' }), '2026-10', NOON);
  assert.deepEqual(purposeLines(month, true), ['Other background work: 3']);
});

test('a call no model answered and an operator\'s test of a model are in no count', () => {
  const month = spentIn([asked('a', { purpose: 'headline', model: '-' }), asked('b', { purpose: 'probe' })], '2026-10', NOON);
  assert.equal(month.background, 0);
  assert.deepEqual(purposeLines(month, true), []);
});

test('the second model call of a question spends nothing, so one question is one ask', () => {
  const month = spentIn(
    [asked('p', { kind: 'propose', purpose: 'ask', question: 'Close the invoice', filed: 'SG7' }), asked('r', { kind: 'read', purpose: 'ask', question: 'Close the invoice' })],
    '2026-10',
    NOON,
  );
  assert.equal(month.asks, 1);
  assert.deepEqual(month.days[0]?.lines.map((l) => l.cost), [1]);
});

test('a list that came back full is a floor, and every line counted from it says at least', () => {
  const full = spentIn(many(LEDGER_FETCHED, 'u', { purpose: 'understand' }), '2026-10', NOON);
  assert.equal(full.whole, false);
  assert.deepEqual(purposeLines(full, true), ['Read what arrived: at least 100']);
  assert.equal(backgroundLine(full), 'At least 100 background questions this month');
  const short = spentIn(many(4, 'u', { purpose: 'understand' }), '2026-10', NOON);
  assert.equal(backgroundLine(short), '4 background questions this month');
  assert.equal(backgroundLine(short, { used: 41, cap: 600 }), '41 of 600 background questions this month');
});

test('an automation\'s ask is named as one, never by the rule\'s id', () => {
  const month = spentIn([asked('r', { kind: 'read', purpose: 'automation', question: 'rule.01JABCDEFGHJKMNPQRSTVWXYZ0 step 2' })], '2026-10', NOON);
  assert.equal(month.days[0]?.lines[0]?.what, 'An automation asked');
  const old = spentIn([asked('r', { kind: 'read', question: 'rule.01JABCDEFGHJKMNPQRSTVWXYZ0 step 2' })], '2026-10', NOON);
  assert.equal(old.days[0]?.lines[0]?.what, 'An automation asked');
});
