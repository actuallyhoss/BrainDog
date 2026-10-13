/**
 * The briefing on Today: the record's cards as lines a person can press, and nothing at all where there are none.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRIEFING_MOST, briefingRows, readBriefing } from './briefing.ts';

const card = (h: string, line: unknown, row: unknown, by: unknown = 'rule') => ({ h, line, row, cause: null, by });
const answer = (cards: unknown[]) => ({ ok: true as const, value: { cards, at: '2026-10-14T08:00:00.000Z', basis: 'b1' } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('A CARD IS ITS LINE, WHERE ITS OWN THING OPENS, AND WHO WROTE IT', () => {
  const rows = briefingRows(
    answer([
      card('b1', 'Studio rent is 3 days late, at GBP 1,200.00.', 'obligations#2', 'slash'),
      card('r1', 'Tidy the contacts is waiting on a check from you.', 'runs#5'),
    ]),
  );
  assert.deepEqual(rows, [
    { key: 'b1', line: 'Studio rent is 3 days late, at GBP 1,200.00.', href: '/r/obligations/2', by: 'slash' },
    { key: 'r1', line: 'Tidy the contacts is waiting on a check from you.', href: '/r/runs/5', by: 'rule' },
  ]);
});

test('AN ADDRESS IS ONLY EVER ONE INSIDE THE APP: anything else is a line that opens nothing', () => {
  const rows = briefingRows(
    answer([
      card('a', 'One.', '/decide'),
      card('b', 'Two.', 'https://elsewhere.example/x'),
      card('c', 'Three.', '//elsewhere.example/x'),
      card('d', 'Four.', 'tasks#0'),
      card('e', 'Five.', 'Tasks List#4'),
      card('f', 'Six.', null),
      card('g', 'Seven.', { register: 'tasks', seq: 9 }),
    ]),
  );
  assert.deepEqual(rows.map((r) => r.href), ['/decide', null, null, null, null, null, '/r/tasks/9']);
});

test('A QUESTION OPENS ON DECIDE AND A RUN OPENS AS ITS OWN ROW, as the record says each', () => {
  const rows = briefingRows(
    answer([
      card('q', 'One.', 'suggestion:SG7'),
      card('h', 'Two.', 'suggestion:q.4f2a'),
      card('s', 'Three.', 'S42'),
      card('x', 'Four.', 'suggestion:../settings'),
      card('y', 'Five.', 'suggestion:'),
      card('z', 'Six.', 'S0'),
      card('w', 'Seven.', ''),
    ]),
  );
  assert.deepEqual(rows.map((r) => r.href), ['/decide/SG7', '/decide/q.4f2a', '/r/session/42', null, null, null, null]);
});

test('A CARD WITH NO LINE IS DROPPED, and a line is trimmed, never drawn as spaces', () => {
  const rows = briefingRows(answer([card('a', '', 'tasks#1'), card('b', '   ', 'tasks#2'), card('c', 7, 'tasks#3'), card('d', '  Call the bank.  ', 'tasks#4'), null, 'x']));
  assert.deepEqual(rows, [{ key: 'd', line: 'Call the bank.', href: '/r/tasks/4', by: 'rule' }]);
});

test('WHO WROTE IT IS SLASH ONLY WHEN THE RECORD SAYS SO: any other word is a rule', () => {
  const rows = briefingRows(answer([card('a', 'One.', 'tasks#1', 'slash'), card('b', 'Two.', 'tasks#2', 'model'), card('c', 'Three.', 'tasks#3', undefined)]));
  assert.deepEqual(rows.map((r) => r.by), ['slash', 'rule', 'rule']);
});

test('SEVEN AT MOST, the first seven as the record ordered them, each under its own key', () => {
  const rows = briefingRows(answer(Array.from({ length: 12 }, (_, i) => card(i < 2 ? 'same' : `h${i}`, `Line ${i}.`, `tasks#${i + 1}`))));
  assert.equal(BRIEFING_MOST, 7);
  assert.deepEqual(rows.map((r) => r.line), ['Line 0.', 'Line 1.', 'Line 2.', 'Line 3.', 'Line 4.', 'Line 5.', 'Line 6.']);
  assert.equal(new Set(rows.map((r) => r.key)).size, 7);
});

test('A RECORD WITH NO BRIEFING ANSWERS NOTHING, so nothing is drawn', () => {
  for (const code of ['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN', 'FORBIDDEN', 'UNREACHABLE'])
    assert.deepEqual(briefingRows({ ok: false, refusal: { code, fix: 'No.' } }), []);
  for (const odd of [null, undefined, 'x', {}, { ok: true }, { ok: true, value: null }, { ok: true, value: { cards: 'none' } }, answer([])])
    assert.deepEqual(briefingRows(odd), []);
});

test('THE READ NEVER FAILS THE SCREEN: a host without the call, a refusal and a dead line all answer no cards', async () => {
  const none = { ok: true, value: [] };
  const absent = async () => json(501, { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog has no briefing yet.', at: 'briefing' } });
  assert.deepEqual(await readBriefing('http://record.test', absent), none);
  assert.deepEqual(await readBriefing('http://record.test', async () => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })), none);
  assert.deepEqual(await readBriefing('http://record.test', async () => Promise.reject(new Error('offline'))), none);
});
