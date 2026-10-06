/**
 * Where a page's waiting questions sit: never leading a page about something else (DIRECTION §39). Money opened on
 * three questions and its cash was under the fold; a project page with a side column takes them there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { asksAside, type Asked } from './asks.ts';

const b = (kind: string, more: Partial<Asked> = {}): Asked => ({ kind, drawn: true, area: 'main', ...more });
const order = (n: number) => [...Array(n).keys()];

/* Money as the gates' record draws it: its line, the book bar and the account line hidden, the questions the look led
   with, then Cash ahead, Accounts, Heads up with its lines, and Coming and going. */
const money: Asked[] = [
  b('note', { lead: true }),
  b('bar', { drawn: false }),
  b('capture', { drawn: false }),
  b('queue'),
  b('forecast'),
  b('split'),
  b('section', { box: true }),
  b('note'),
  b('note'),
  b('section'),
  b('calendar'),
];

test('Money opens on its cash and accounts, and the questions follow its figures', () => {
  const got = asksAside(money, order(money.length), false);
  assert.deepEqual(got.order, [0, 1, 2, 4, 5, 3, 6, 7, 8, 9, 10]);
  assert.deepEqual([...got.compact], [3]);
  assert.equal(got.rail.size, 0);
});

test('on a page with a side column the questions go there, after its figures', () => {
  const kiln = [b('note', { lead: true }), b('queue'), b('roadmap'), b('stat', { area: 'rail' }), b('ring', { area: 'rail' }), b('todo', { area: 'rail' })];
  const got = asksAside(kiln, order(kiln.length), true);
  assert.deepEqual(got.order, [0, 2, 3, 4, 1, 5]);
  assert.deepEqual([...got.rail], [1]);
  assert.deepEqual([...got.compact], [1]);
});

test('a side column that draws nothing leaves the questions in the main column', () => {
  const page = [b('queue'), b('todo'), b('stat', { area: 'rail', drawn: false })];
  const got = asksAside(page, order(page.length), true);
  assert.deepEqual(got.order, [1, 0, 2]);
  assert.equal(got.rail.size, 0);
});

test('with no figures first, the questions go after the first thing the page draws, never inside a box', () => {
  const work = [b('note', { lead: true }), b('queue'), b('todo'), b('todo')];
  assert.deepEqual(asksAside(work, order(4), false).order, [0, 2, 1, 3]);
  /* A BOX HOLDS EVERY BLOCK UP TO THE NEXT HEADING (`boxesOf`), so the questions go after the heading's last block. */
  const boxed = [b('queue'), b('section', { box: true }), b('note'), b('table'), b('section'), b('todo')];
  assert.deepEqual(asksAside(boxed, order(6), false).order, [1, 2, 3, 0, 4, 5]);
  const joined = [b('queue'), b('todo'), b('table', { joins: true }), b('table')];
  assert.deepEqual(asksAside(joined, order(4), false).order, [1, 2, 0, 3]);
});

test('a page that is its questions keeps them first', () => {
  const decide = [b('queue', { lead: true }), b('queue')];
  assert.deepEqual(asksAside(decide, order(2), false).order, [0, 1], 'the lead question leads');
  const only = [b('note', { lead: true }), b('queue')];
  const got = asksAside(only, order(2), false);
  assert.deepEqual(got.order, [0, 1], 'nothing else to lead with');
  assert.equal(got.compact.size, 0);
});

test('questions not drawn change nothing, and the order it is handed is kept', () => {
  const page = [b('queue', { drawn: false }), b('todo')];
  assert.deepEqual(asksAside(page, [0, 1], false).order, [0, 1]);
  const looked = [b('todo'), b('stat'), b('queue')];
  assert.deepEqual(asksAside(looked, [2, 1, 0], false).order, [1, 2, 0], 'after the figure the look put first');
});

test('on a wide page with no side column the questions are a side tile beside the figure that opens it', () => {
  const got = asksAside(money, order(money.length), false, true);
  assert.deepEqual(got.order, [0, 1, 2, 4, 3, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual([...got.spans], [
    [4, 8],
    [3, 4],
  ]);
  const halved = [b('stat', { span: 6 }), b('queue'), b('todo')];
  assert.equal(asksAside(halved, order(3), false, true).spans.size, 0, 'a figure the author gave half the row keeps it');
  const listFirst = [b('queue'), b('todo'), b('stat')];
  assert.equal(asksAside(listFirst, order(3), false, true).spans.size, 0, 'only beside a figure');
  assert.equal(asksAside(money, order(money.length), false, false).spans.size, 0, 'and only on a wide page');
});
