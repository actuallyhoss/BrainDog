/**
 * A next step as a checklist: split where a job ends, each with the day it names as a chip.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { daySaid, nextDay, nextSplit } from './next-split.ts';

const NOW = Date.UTC(2026, 9, 27, 9);
const texts = (s: string) => nextSplit(s, NOW).map((x) => x.text);

test('commas, a closing and, and then each end a job', () => {
  assert.deepEqual(texts('Send the draft, reply to Lena, pick the cleanup, and check the tickets.'), ['Send the draft', 'Reply to Lena', 'Pick the cleanup', 'Check the tickets']);
  assert.deepEqual(texts('Ship the beta, then the store review'), ['Ship the beta', 'The store review']);
  assert.deepEqual(texts('Ship the beta then write the post'), ['Ship the beta', 'Write the post']);
});

test('and splits only where a job starts after it', () => {
  assert.deepEqual(texts('Answer Lena and pick the feedback asks.'), ['Answer Lena', 'Pick the feedback asks']);
  assert.deepEqual(texts('Record the trailer with the video and deck'), ['Record the trailer with the video and deck']);
});

test('a day in brackets or after by comes out of the words and is the chip', () => {
  const got = nextSplit('Read the ad test (25 Oct), fix the two leaks, and the import before 31 Oct.', NOW);
  assert.deepEqual(got, [
    { text: 'Read the ad test', day: '2026-10-25', said: '25 Oct' },
    { text: 'Fix the two leaks', day: null, said: null },
    { text: 'The import', day: '2026-10-31', said: '31 Oct' },
  ]);
  assert.deepEqual(nextSplit('Apply to the fund (about 30 Oct)', NOW)[0], { text: 'Apply to the fund', day: '2026-10-30', said: '30 Oct' });
  assert.deepEqual(nextSplit('Launch by Sat 31 Oct', NOW)[0], { text: 'Launch', day: '2026-10-31', said: '31 Oct' });
});

test('a day said inside the words stays in them and still names the job', () => {
  const [one] = nextSplit('Check the codes before the tour starts 27 Oct', NOW);
  assert.equal(one!.text, 'Check the codes before the tour starts 27 Oct');
  assert.equal(one!.day, '2026-10-27');
});

test('a day with no year is the nearest one, and a written day is taken as it is', () => {
  assert.equal(nextSplit('Renew by 2 Jan', Date.UTC(2026, 11, 20))[0]!.day, '2027-01-02');
  assert.equal(nextSplit('File it by 2026-11-03', NOW)[0]!.day, '2026-11-03');
  assert.equal(nextSplit('Talk on Nov 9', NOW)[0]!.day, '2026-11-09');
});

test('no split inside brackets or a list after a colon', () => {
  assert.deepEqual(texts('Deals (one, two), and the review'), ['Deals (one, two)', 'The review']);
  assert.deepEqual(texts('Waves 3 to 6, then the sitting: billing, sign-in and legal.'), ['Waves 3 to 6', 'The sitting: billing, sign-in and legal']);
});

test('sentences split, a dotted name does not, and a name keeps its case', () => {
  assert.deepEqual(texts('Test a real payment (still in test mode). Pricing needs a login.'), ['Test a real payment (still in test mode)', 'Pricing needs a login']);
  assert.deepEqual(texts('Move example.gg to the new host'), ['Move example.gg to the new host']);
  assert.deepEqual(texts('a16z form and iOS build'), ['a16z form and iOS build']);
});

test('a clause that hangs on the job after a comma stays with it', () => {
  assert.deepEqual(texts('Settle the licence, before the spring issue announces it'), ['Settle the licence, before the spring issue announces it']);
  assert.deepEqual(texts('Ship the beta, once the store review lands, then tell the testers'), ['Ship the beta, once the store review lands', 'Tell the testers']);
});

test('nothing written is no job, and the soonest day is found', () => {
  assert.deepEqual(nextSplit('', NOW), []);
  assert.deepEqual(nextSplit(null, NOW), []);
  assert.equal(nextDay(nextSplit('A by 3 Nov, B by 1 Nov', NOW)), '2026-11-01');
  assert.equal(daySaid('2026-11-01'), '1 Nov');
});
