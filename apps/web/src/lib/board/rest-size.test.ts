/**
 * A tile as tall as what it holds, on a laptop at rest (`rest-size.ts`, first-hour audit E6).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { restSize, rowsOf } from './rest-size.ts';

test('a large list with one row is laid one row tall, and a full one keeps its frame', () => {
  assert.equal(restSize('table', 'large', 1), 'wide');
  assert.equal(restSize('feed', 'tall', 1), 'wide', 'a kind with no small goes wide');
  assert.equal(restSize('table', 'large', 2), 'wide');
  assert.equal(restSize('table', 'large', 5), 'large');
  assert.equal(restSize('queue', 'large', 0), 'wide', 'Needs you with nothing asked');
});

test('a tall one with one row is laid small, and a figure is never resized', () => {
  assert.equal(restSize('table', 'tall', 1), 'small');
  assert.equal(restSize('table', 'tall', 3), 'tall');
  assert.equal(restSize('stat', 'large', null), 'large');
  assert.equal(restSize('table', 'wide', 0), 'wide', 'a frame one row tall stays');
});

test('rows are counted from what the block drew, and the most it matched', () => {
  assert.equal(rowsOf({ kind: 'table', rows: [1], matched: 1 }), 1);
  assert.equal(rowsOf({ kind: 'table', rows: [1, 2], matched: 9 }), 9, 'a list cut to its frame is not a short one');
  assert.equal(rowsOf({ kind: 'queue', queue: [] }), 0);
  assert.equal(rowsOf({ kind: 'stat', readings: [] }), null);
  assert.equal(rowsOf({ kind: 'note', desk: { kind: 'late', lines: [1] } }), 1);
  assert.equal(rowsOf({ kind: 'note', desk: { kind: 'cash' } }), null);
});
