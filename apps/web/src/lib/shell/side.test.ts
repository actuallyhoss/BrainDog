import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIDE_MAX, SIDE_MIN, SIDE_START, byWeek, factOf, lanesOf, pinsKept, playSaid, sideKept, splitOf, widthOf } from './side.ts';

const p = (name: string, o: Partial<{ pinned: boolean; late: number; working: boolean; moved: boolean; lane: string }> = {}) => ({
  name,
  pinned: false,
  late: 0,
  working: false,
  moved: false,
  lane: 'earning',
  ...o,
});

test('by this week: pins, then late, then an agent at work, then money moved, then the record order', () => {
  const list = [p('Quiet'), p('Moved', { moved: true }), p('Busy', { working: true }), p('Late', { late: 2 }), p('Pinned', { pinned: true }), p('Also quiet')];
  assert.deepEqual(
    byWeek(list).map((x) => x.name),
    ['Pinned', 'Late', 'Busy', 'Moved', 'Quiet', 'Also quiet'],
  );
});

test('a late project an agent is on stays with the late ones, and two late ones keep their order', () => {
  const list = [p('A', { late: 1 }), p('B', { late: 3, working: true }), p('C', { working: true })];
  assert.deepEqual(
    byWeek(list).map((x) => x.name),
    ['A', 'B', 'C'],
  );
});

test('the width stays between 220 and 320, and anything unreadable is the start', () => {
  assert.equal(widthOf(100), SIDE_MIN);
  assert.equal(widthOf(900), SIDE_MAX);
  assert.equal(widthOf('260.4'), 260);
  assert.equal(widthOf('wide'), SIDE_START);
  assert.equal(widthOf(undefined), SIDE_START);
});

test('parked and finished are read from the list: its done states, else retired', () => {
  const values = ['building', 'earning', 'parked', 'retired'];
  const lanes = lanesOf({}, values);
  const split = splitOf([p('A'), p('B', { lane: 'parked' }), p('C', { lane: 'retired' }), p('D', { lane: 'building' })], lanes);
  assert.deepEqual(split.play.map((x) => x.name), ['A', 'D']);
  assert.deepEqual(split.parked.map((x) => x.name), ['B']);
  assert.deepEqual(split.finished.map((x) => x.name), ['C']);
  const own = lanesOf({ done: ['shipped'] }, ['live', 'shipped']);
  assert.deepEqual([...own.finished], ['shipped']);
  assert.equal(own.parked.size, 0);
});

test('one fact a project: late first, then an agent, then money, nothing for a quiet one', () => {
  assert.deepEqual(factOf({ late: 1, working: true, moved: true }), { text: '1 late', tone: 'late' });
  assert.deepEqual(factOf({ late: 4, working: false, moved: false }), { text: '4 late', tone: 'late' });
  assert.equal(factOf({ late: 0, working: true, moved: false })?.tone, 'live');
  assert.equal(factOf({ late: 0, working: false, moved: true })?.tone, 'quiet');
  assert.equal(factOf({ late: 0, working: false, moved: false }), null);
});

test('the sentence over the phone list names each lane by its own word and what is late in digits', () => {
  const label = (l: string) => ({ earning: 'Earning', building: 'Building' })[l] ?? l;
  const play = [p('A', { late: 1 }), p('B'), p('C', { lane: 'building', late: 2 })];
  assert.equal(playSaid(play, label), '3 in play: 2 earning, 1 building. 2 have something late.');
  assert.equal(playSaid([p('A')], label), '1 in play: 1 earning.');
  assert.equal(playSaid([], label), 'Nothing in play.');
  assert.doesNotMatch(playSaid(play, label), /—/u);
});

test('what the device keeps is read safely', () => {
  assert.deepEqual(sideKept(null), { hidden: false, width: SIDE_START });
  assert.deepEqual(sideKept('{"hidden":true,"width":300}'), { hidden: true, width: 300 });
  assert.deepEqual(sideKept('not json'), { hidden: false, width: SIDE_START });
  assert.deepEqual(pinsKept('["/p/a","/p/a",3,"b"]'), ['/p/a']);
  assert.deepEqual(pinsKept('{'), []);
});
