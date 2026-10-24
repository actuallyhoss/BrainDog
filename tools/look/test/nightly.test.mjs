/**
 * The night's speed measure's own sums (`nightly.mjs`): what a read is called, the record's time read off its answer,
 * and when a night is slow. The walk itself opens a browser on a record and is run by hand or by launchd.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judge, methodOf, parse, plist, recOf } from '../nightly.mjs';

test('A READ IS NAMED BY ITS METHOD under either address, and anything else is not a read', () => {
  assert.equal(methodOf('/api/list'), 'list');
  assert.equal(methodOf('/app/sam/api/boot'), 'boot');
  assert.equal(methodOf('/api/slash/status'), 'slash/status');
  assert.equal(methodOf('/app/_app/immutable/x.js'), null);
});

test("THE RECORD'S TIME IS READ OFF Server-Timing, and an answer without it says nothing", () => {
  assert.equal(recOf('rec;dur=12, door;dur=80'), 12);
  assert.equal(recOf('door;dur=3, rec;dur=7.5'), 7.5);
  assert.equal(recOf('door;dur=3'), null);
  assert.equal(recOf(undefined), null);
});

test('A NIGHT IS SLOW WHEN TODAY, OPENED WARM, SETTLES OVER ITS BUDGET, and only then', () => {
  const S = { todaySettleMs: 2000 };
  const row = (over) => ({ screen: 'today', kind: 'warm', width: 390, settleMs: 300, ...over });
  assert.deepEqual(judge([row({})], S), []);
  assert.equal(judge([row({ settleMs: 2400 })], S).length, 1);
  assert.equal(judge([row({ settleMs: null })], S).length, 1);
  assert.deepEqual(judge([row({ kind: 'cold', settleMs: 2400 }), row({ screen: 'money', settleMs: 9000 })], S), []);
});

test('IT READS HIS RECORD UNLESS TOLD OTHERWISE, and refuses a flag it does not take', () => {
  assert.deepEqual(parse([]).source, { name: 'live', arg: 'sam' });
  assert.deepEqual(parse(['--source', 'seed', '--check']).source, { name: 'seed', arg: undefined });
  assert.equal(parse(['--check']).check, true);
  assert.throws(() => parse(['--fast']), /takes --source/u);
});

test('THE LAUNCHD JOB RUNS THIS CHECKOUT AT 04:30 WITH --check, and names no path it was not handed', () => {
  const xml = plist('/repo', '/node/bin/node');
  assert.match(xml, /<string>\/node\/bin\/node<\/string><string>\/repo\/tools\/look\/nightly.mjs<\/string><string>--check<\/string>/u);
  assert.match(xml, /<key>Hour<\/key><integer>4<\/integer><key>Minute<\/key><integer>30<\/integer>/u);
  assert.match(xml, /\/repo\/.ship\/logs\/speed-nightly.log/u);
});
