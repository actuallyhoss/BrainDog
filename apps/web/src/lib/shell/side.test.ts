import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIDE_MAX, SIDE_MIN, SIDE_START, byWeek, factOf, groupsOf, lanesOf, pinsKept, playSaid, shownName, sideKept, splitOf, widthOf, type SideList } from './side.ts';

const HEADS = {
  money: { label: 'Money', icon: 'money' },
  kernel: { label: 'Agent work', icon: 'session' },
  lists: { label: 'Other lists', icon: 'rows' },
  views: { label: 'Saved views', icon: 'doc' },
  extras: { label: 'Tools', icon: 'packs' },
};
const list = (id: string, o: Partial<SideList> = {}): SideList => ({ id, name: id.toUpperCase(), icon: 'rows', count: 1, views: [], kernel: false, money: false, ...o });

test('lists group as the More sheet read them: places, money, the agents, the rest, views, tools', () => {
  const groups = groupsOf(
    [{ href: '/?work', label: 'Work', icon: 'work', count: 27 }],
    [list('a1', { money: true }), list('r1', { kernel: true, count: 5 }), list('n1', { views: [{ name: 'Mine', href: '/p/mine' }] }), list('a2', { money: true })],
    [{ href: '/p/board', label: 'Board', icon: 'doc' }],
    [{ href: '/vault', label: 'Vault', icon: 'vault' }],
    HEADS,
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.items.map((i) => i.label)]),
    [
      ['Work', ['Work']],
      ['Money', ['A1', 'A2']],
      ['Agent work', ['R1']],
      ['Other lists', ['N1']],
      ['Saved views', ['Board', 'Mine']],
      ['Tools', ['Vault']],
    ],
  );
  assert.equal(groups[2]?.items[0]?.count, 5);
  assert.equal(groups[1]?.items[0]?.href, '/r/a1');
});

test('an empty kind draws no group, and a kernel list that holds money stays with the agents', () => {
  const groups = groupsOf([], [list('r1', { kernel: true, money: true })], [], [], HEADS);
  assert.deepEqual(groups.map((g) => g.label), ['Agent work']);
});

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

test('a name typed as a slug is said in words, and any other name is kept as written (E2)', () => {
  assert.equal(shownName('sam-site'), 'Sam site');
  assert.equal(shownName('money_core'), 'Money core');
  for (const kept of ['Studio site', 'Otters.gg', 'Encore', 'iOS app', 'roomy', 'crumb.gg', 'Sam-site']) assert.equal(shownName(kept), kept);
});
