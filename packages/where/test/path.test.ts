/**
 * `readPath`, and the three ways a path into a stranger's body can be wrong quietly.
 *
 * The three: a step that reaches a prototype instead of a key, a fan-out that drops the element it
 * could not read, and a grammar that answers something for a path nobody wrote. Each of those looks
 * like a path that worked, which is why they are the assertions here rather than the happy ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fansOut, pathFault, readPath, type Json } from '../src/index.ts';

const BODY: Json = {
  object: 'list',
  has_more: true,
  data: [
    { id: 'in_1', amount: 100, status: 'ok' },
    { id: 'in_2', amount: 250, status: 'ok' },
    { id: 'in_3', amount: 0 },
  ],
  meta: { 'x-page': 2, sampled: false, nothing: null },
};

test('a key, a nested key and a key with a dash all read', () => {
  assert.equal(readPath(BODY, 'object'), 'list');
  assert.equal(readPath(BODY, 'meta.sampled'), false);
  assert.equal(readPath(BODY, 'meta.x-page'), 2);
});

test('an index reads, and [-1] is the last one — which is how Stripe is paged', () => {
  assert.equal(readPath(BODY, 'data[0].id'), 'in_1');
  assert.equal(readPath(BODY, 'data[-1].id'), 'in_3');
  assert.equal(readPath(BODY, 'data[9].id'), undefined);
});

test('[] fans out, and a missing field stays in the list rather than leaving it', () => {
  assert.deepEqual(readPath(BODY, 'data[].id'), ['in_1', 'in_2', 'in_3']);
  /* THE THIRD ROW HAS NO `status`, and the hole is the answer. Dropped, `data[].status is ok` would
     pass over two rows and report nothing about the third — a check over every element that quietly
     became a check over the elements that had the field. */
  assert.deepEqual(readPath(BODY, 'data[].status'), ['ok', 'ok', undefined]);
});

test('a list that is not there fans out to one missing element, not to none', () => {
  /* Otherwise `all` over an empty list is vacuously true and a body with no rows at all passes
     every expectation it was given. */
  assert.deepEqual(readPath(BODY, 'rows[].id'), [undefined]);
  assert.deepEqual(readPath({ data: [] }, 'data[].id'), []);
});

test('a missing step is undefined all the way down, and never a throw', () => {
  assert.equal(readPath(BODY, 'nope'), undefined);
  assert.equal(readPath(BODY, 'nope.deeper.still'), undefined);
  assert.equal(readPath(BODY, 'meta.nothing.deeper'), undefined);
  assert.equal(readPath(undefined, 'anything'), undefined);
});

test('a null is a value and not a missing step', () => {
  assert.equal(readPath(BODY, 'meta.nothing'), null);
});

/* THE ONE THAT IS ABOUT SAFETY AND NOT ABOUT SHAPE. The object on the left is JSON a provider sent,
   and a grammar that walks its prototype is a grammar that answers questions about the host. */
test('own properties only — a prototype is not reachable from a path', () => {
  for (const path of ['constructor', 'constructor.name', '__proto__', 'toString', 'valueOf'])
    assert.equal(readPath(BODY, path), undefined, path);
  /* A key spelled into the body IS readable, because it is the provider's own. */
  assert.equal(readPath({ constructor: 'acme' }, 'constructor'), 'acme');
});

test('a list is walked by index and never introspected', () => {
  assert.equal(readPath(BODY, 'data.length'), undefined);
  assert.equal(readPath(BODY, 'data.id'), undefined);
});

test('what is wrong with a path is a sentence, and a good one has none', () => {
  assert.equal(pathFault('data[-1].id'), null);
  assert.equal(pathFault('meta.x-page'), null);
  assert.equal(pathFault('data[]'), null);
  assert.equal(pathFault(''), 'an empty path');
  assert.match(pathFault('data[].rows[].id') ?? '', /fans out more than once/);
  for (const bad of ['1data', '.data', 'data.', 'data..id', 'data[a]', 'data[', 'a b', 'data[1]x'])
    assert.notEqual(pathFault(bad), null, bad);
});

/* A PATH LINT REFUSED READS AS MISSING RATHER THAN THROWING. A connector must not die halfway
   through a page over the shape of its own declaration; `declare` is where that is caught. */
test('a path this grammar cannot read is undefined at run time', () => {
  assert.equal(readPath(BODY, 'data[a]'), undefined);
  assert.equal(readPath(BODY, ''), undefined);
});

test('whether a path fans out is askable without reading anything', () => {
  assert.equal(fansOut('data[].id'), true);
  assert.equal(fansOut('data[-1].id'), false);
});
