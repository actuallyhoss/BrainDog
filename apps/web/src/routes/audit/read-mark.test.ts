/**
 * Activity stamps the reader's mark when they leave (PGS-C02).
 *
 * Only Home stamped it, and only where Home drew a feed of the log, so on a record whose home has none the mark never
 * moved: Activity said "More than 60 things changed while you were away" minutes after it had been read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { awaySaid, historyWords } from './lines.ts';
import { readMarkOf, seenAfter, stampOf } from './read-mark.ts';

const NO_NAMES: ReadonlyMap<string, string> = new Map();

test('NOTHING UNSEEN IS NOTHING TO STAMP, and neither is an away read that never answered', () => {
  assert.equal(readMarkOf(9, 0), null);
  assert.equal(readMarkOf(9, null), null, 'a page that could not say what was new marked it read');
  assert.equal(readMarkOf('e.01M1RQ3130J6MBME97EKYKKWZ2', 0), null);
});

test('NO CURSOR IS NO STAMP: a mark is never sent bare, which would mark lines this page never held', () => {
  assert.equal(readMarkOf(null, 3), null);
  assert.equal(readMarkOf(null, 3, 0), null);
});

test('WHAT IS UNSEEN IS STAMPED WITH THE CURSOR THE RECORD HANDED OVER, exactly as it came', () => {
  assert.equal(readMarkOf(9, 3), 9);
  const hers = 'e.01M1RQ3130J6MBME97EKYKKWZ2';
  assert.equal(readMarkOf(hers, 1), hers);
  /* HER LINES CARRY NO NUMBER (`readLog` draws them as 0), and a number is what the record refuses her. */
  assert.equal(readMarkOf(hers, 1, 0), hers);
  assert.equal(readMarkOf(hers, 1, 412), hers, 'a member held to named lists was sent back a number');
});

test('THE NEWEST LINE THE PAGE HELD WINS OVER AN OLDER CURSOR, since the shell keeps its answer for the tab', () => {
  /* The shell read 100 when the tab opened, sixty lines landed, and Activity drew them: stamping 100 leaves all sixty
     unseen, which is the sentence he read twice. */
  assert.equal(readMarkOf(100, 60, 160), 160);
  assert.equal(readMarkOf(null, 60, 160), 160, 'a shell that held nothing new when it was read kept the mark still');
  assert.equal(readMarkOf(160, 60, 100), 160, 'the mark was sent below the cursor the record handed over');
  assert.equal(readMarkOf(100, 0, 160), null);
});

test('THE AWAY LINE IS NOT DRAWN AFTER A STAMP: what was read is said as nothing new', () => {
  const before = { actors: ['p_1', 'run_2', 'run_2'], capped: true, byWho: null };
  assert.match(awaySaid(before.actors, 'p_1', NO_NAMES, before.capped, before.byWho), /while you were away/u);
  const after = seenAfter();
  assert.equal(awaySaid(after.actors, 'p_1', NO_NAMES, after.capped, after.byWho), historyWords.nothingNew);
  assert.equal(readMarkOf(9, after.actors.length), null, 'a page already stamped stamped again');
});

test('ONE STAMP A VISIT: leaving twice (a hidden tab, then another screen) sends one mark', async () => {
  const sent: unknown[] = [];
  const stamp = stampOf(async (upTo) => (sent.push(upTo), true));
  assert.equal(await stamp.leave(9), true);
  assert.equal(await stamp.leave(9), false);
  assert.deepEqual(sent, [9]);
  assert.equal(stamp.landed(), true);
});

test('NOTHING TO STAMP SENDS NOTHING', async () => {
  const sent: unknown[] = [];
  const stamp = stampOf(async (upTo) => (sent.push(upTo), true));
  assert.equal(await stamp.leave(null), false);
  assert.deepEqual(sent, []);
  assert.equal(stamp.landed(), false);
});

test('A STAMP THAT FAILS LEAVES THE MARK WHERE IT WAS, and the next leave tries again', async () => {
  const sent: unknown[] = [];
  let answer: () => Promise<boolean> = async () => false;
  const stamp = stampOf(async (upTo) => (sent.push(upTo), answer()));
  assert.equal(await stamp.leave(9), false, 'a refused mark was said as landed');
  assert.equal(stamp.landed(), false);
  answer = async () => {
    throw new TypeError('fetch failed');
  };
  assert.equal(await stamp.leave(9), false, 'a host nobody reached threw out of the leave');
  assert.equal(stamp.landed(), false);
  answer = async () => true;
  assert.equal(await stamp.leave(9), true);
  assert.deepEqual(sent, [9, 9, 9]);
  assert.equal(stamp.landed(), true);
});

test('TWO LEAVES AT ONCE SEND ONE MARK, while the first is still on its way', async () => {
  const sent: unknown[] = [];
  let land: (ok: boolean) => void = () => undefined;
  const stamp = stampOf((upTo) => (sent.push(upTo), new Promise<boolean>((done) => (land = done))));
  const first = stamp.leave(9);
  assert.equal(await stamp.leave(9), false);
  land(true);
  assert.equal(await first, true);
  assert.deepEqual(sent, [9]);
});
