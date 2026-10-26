/**
 * One "today" in the record's zone, at half past midnight three hours east of Greenwich: Work, Today, a page's blocks and
 * a script's next run all say the same day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forgetZone, learnZone, recordMidnight, recordTime, recordToday, recordZone } from './zone.ts';
import { dayOf as workDay } from '../work/board.ts';
import { dayOf as todayDay, midnightOf } from './today-live.ts';
import { todayOf as cardDay } from '../decide/card.ts';
import { recordDay } from '../home/home-line.ts';
import { nextSaid } from './scripts.ts';

/** 00:30 on 27 October in Cairo, which is still 21:30 on the 26th in UTC. */
const HALF_PAST_MIDNIGHT = Date.parse('2026-10-26T21:30:00Z');

test('a zone the record said is kept, and nonsense or nothing leaves the reader\'s own', () => {
  forgetZone();
  assert.equal(recordZone(), 'UTC', 'no window and no zone said: UTC');
  assert.equal(learnZone('Africa/Cairo'), 'Africa/Cairo');
  assert.equal(learnZone('Not/A_Zone'), 'Africa/Cairo', 'a zone Intl cannot read is not kept');
  assert.equal(learnZone(undefined), 'Africa/Cairo', 'an older host that says nothing leaves it');
  forgetZone();
  assert.equal(recordZone(), 'UTC');
});

test('AT 00:30 IN A +03:00 ZONE every screen\'s today is the 27th, and in UTC it is still the 26th', () => {
  forgetZone();
  learnZone('Africa/Cairo');
  try {
    assert.equal(recordToday(HALF_PAST_MIDNIGHT), '2026-10-27');
    assert.equal(workDay(HALF_PAST_MIDNIGHT), '2026-10-27', 'Work');
    assert.equal(todayDay(HALF_PAST_MIDNIGHT), '2026-10-27', 'Today');
    assert.equal(cardDay(HALF_PAST_MIDNIGHT), '2026-10-27', 'a Decide card');
    assert.equal(recordDay(HALF_PAST_MIDNIGHT), '2026-10-27', 'the line under Home\'s title');
    assert.equal(recordTime(HALF_PAST_MIDNIGHT), '00:30');
    /* A MINUTE BEFORE MIDNIGHT it is the 26th, on every screen alike. */
    const before = Date.parse('2026-10-26T20:59:00Z');
    assert.equal(workDay(before), '2026-10-26');
    assert.equal(todayDay(before), '2026-10-26');
    /* AND THE DAY BEGAN AT THE RECORD'S MIDNIGHT, 21:00 UTC. */
    assert.equal(new Date(midnightOf(HALF_PAST_MIDNIGHT)).toISOString(), '2026-10-26T21:00:00.000Z');
    assert.equal(new Date(recordMidnight(before)).toISOString(), '2026-10-25T21:00:00.000Z');
  } finally {
    forgetZone();
  }
  assert.equal(recordToday(HALF_PAST_MIDNIGHT), '2026-10-26', 'with no zone held it counts in UTC');
});

test('A SCRIPT\'S NEXT RUN is said on the record\'s wall: today at its own hour, never one already passed', () => {
  forgetZone();
  learnZone('Africa/Cairo');
  try {
    /* 19:10 in Cairo on the 27th is later today at 00:30 on the 27th. */
    assert.equal(nextSaid('2026-10-27T16:10:00Z', HALF_PAST_MIDNIGHT), 'today at 19:10');
    assert.equal(nextSaid('2026-10-28T03:00:00Z', HALF_PAST_MIDNIGHT), 'tomorrow at 06:00');
    assert.equal(nextSaid('2026-11-05T15:00:00Z', HALF_PAST_MIDNIGHT), '5 Nov at 17:00');
    /* 19:10 on the 26th has passed: it is due, never "today at 19:10". */
    assert.equal(nextSaid('2026-10-26T16:10:00Z', HALF_PAST_MIDNIGHT), 'due');
    /* 23:00 UTC on the 26th is 02:00 on the 27th in Cairo: today, where UTC would have said today on the 26th. */
    assert.equal(nextSaid('2026-10-26T23:00:00Z', HALF_PAST_MIDNIGHT), 'today at 02:00');
  } finally {
    forgetZone();
  }
});
