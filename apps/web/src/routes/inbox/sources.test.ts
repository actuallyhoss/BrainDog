/**
 * What comes in: each way in by the channel the record keeps, its last arrival, and a fortnight of arrivals on the
 * reader's own clock.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EVERYDAY, SOURCE_DAYS, countSaid, drawsLine, lastSaid, sourcesOf } from './sources.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOON = at(2026, 10, 7);
const iso = (ms: number) => new Date(ms).toISOString();

test('a new record says the three everyday ways in, with nothing through them', () => {
  const out = sourcesOf([], NOON);
  assert.deepEqual(out.map((s) => s.channel), [...EVERYDAY]);
  assert.deepEqual(out.map((s) => s.name), ['Mail', 'Texts and apps', 'Agents']);
  assert.ok(out.every((s) => s.last === null && s.total === 0 && s.days.length === SOURCE_DAYS));
  assert.equal(lastSaid(out[0]!, () => 'x'), 'Nothing has come in this way yet');
  assert.equal(countSaid(0), 'None in 14 days');
});

test('arrivals are counted by the day they came, today last, and the newest way in leads', () => {
  const lines = [
    { channel: 'webhook', ts: iso(at(2026, 10, 7, 9)) },
    { channel: 'webhook', ts: iso(at(2026, 10, 6, 9)) },
    { channel: 'webhook', ts: iso(at(2026, 10, 1, 9)) },
    { channel: 'email', ts: iso(at(2026, 10, 2, 9)) },
    { channel: 'email', ts: iso(at(2026, 9, 1, 9)) },
    { channel: 'paste', ts: iso(at(2026, 10, 3, 9)) },
    { channel: 'api', ts: 'not a time' },
  ];
  const out = sourcesOf(lines, NOON);
  assert.deepEqual(out.map((s) => s.channel), ['webhook', 'paste', 'email', 'api']);
  const texts = out[0]!;
  assert.equal(texts.total, 3);
  assert.equal(texts.days.at(-1), 1, 'today is the last day');
  assert.equal(texts.days.at(-2), 1);
  assert.equal(texts.days.at(-7), 1);
  assert.equal(texts.last, iso(at(2026, 10, 7, 9)));
  assert.ok(drawsLine(texts));
  const mail = out.find((s) => s.channel === 'email')!;
  assert.equal(mail.total, 1, 'a month-old arrival is past the fortnight');
  assert.equal(mail.last, iso(at(2026, 10, 2, 9)));
  assert.equal(drawsLine(mail), false, 'one day is a count, not a line');
  assert.equal(out.find((s) => s.channel === 'api')?.last, null, 'a time that will not read is no last arrival');
  assert.equal(countSaid(1200), '1,200 in 14 days');
});
