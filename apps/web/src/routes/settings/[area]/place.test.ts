/**
 * The settings index's grouping: every area once, in its group, in the registry's order.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GROUPS, LAST, ONLY_WIDE, grouped, type AreaRow } from './place.ts';

const ROWS: AreaRow[] = [
  { id: 'appearance', label: 'Appearance', icon: 'sun', group: 'you' },
  { id: 'delete', label: 'Delete this record', icon: 'trash', group: 'record' },
  { id: 'identity', label: 'Identity', icon: 'people', group: 'signin' },
  { id: 'keyboard', label: 'Keyboard', icon: 'keyboard', group: 'you' },
];

test('each area is drawn once, under its own group, in the order the registry lists it', () => {
  const groups = grouped(ROWS);
  assert.deepEqual(
    groups.map((g) => [g.id, g.areas.map((a) => a.id)]),
    [
      ['you', ['appearance', 'keyboard']],
      ['signin', ['identity']],
      ['record', ['delete']],
    ],
  );
  assert.equal(groups.flatMap((g) => g.areas).length, ROWS.length);
});

test('a row that names no group is still drawn, once, in the last group', () => {
  const about: AreaRow = { id: 'about', label: 'About', icon: 'info' };
  const groups = grouped([...ROWS, about]);
  assert.equal(groups.flatMap((g) => g.areas).filter((a) => a.id === 'about').length, 1);
  assert.equal(groups.find((g) => g.areas.some((a) => a.id === 'about'))?.id, LAST);
});

test('a group with no area draws no heading', () => {
  assert.ok(!grouped(ROWS).some((g) => g.id === 'sharing'));
  assert.deepEqual(grouped([]), []);
});

test('every group has a heading in sentence case, and the groups follow their declared order', () => {
  for (const g of GROUPS) assert.match(g.title, /^[A-Z][a-z ]*$/u);
  const order = grouped(ROWS).map((g) => GROUPS.findIndex((d) => d.id === g.id));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test('the keyboard area is the one a phone is not offered', () => {
  assert.deepEqual([...ONLY_WIDE], ['keyboard']);
});
