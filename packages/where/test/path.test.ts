/**
 * `readPath`, and the three ways a path into a stranger's body can be wrong quietly.
 *
 * The three: a step that reaches a prototype instead of a key, a fan-out that drops the element it
 * could not read, and a grammar that answers something for a path nobody wrote. Each of those looks
 * like a path that worked, which is why they are the assertions here rather than the happy ones.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fansOut, pathFault, readPath, selectAll, type Json } from '../src/index.ts';

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
   through a page over the doc of its own declaration; `declare` is where that is caught. */
test('a path this grammar cannot read is undefined at run time', () => {
  assert.equal(readPath(BODY, 'data[a]'), undefined);
  assert.equal(readPath(BODY, ''), undefined);
});

test('whether a path fans out is askable without reading anything', () => {
  assert.equal(fansOut('data[].id'), true);
  assert.equal(fansOut('data[-1].id'), false);
});

/**
 * `43 §4.4`, beside `readPath`'s own tests for `47 §4.3`.
 *
 * THE TWO SETS SIT TOGETHER SO THE DIVERGENCES ARE READABLE AS TESTS and not only as a comment: a
 * namespace-prefixed key, a second fan, and a hole in a fan are each a case here and each the opposite
 * case there.
 */

const doc = {
  data: [
    { id: 1, amount: '10.00', tags: ['a', 'b'] },
    { id: 2, amount: '20.00', tags: [] },
  ],
  page: { next: 'tok', empty: null },
};

/* ── select ──────────────────────────────────────────────────────────────── */

test('an empty path is the root', () => {
  assert.deepEqual(selectAll(doc, ''), [doc]);
});

test('a key reaches one value', () => {
  assert.deepEqual(selectAll(doc, 'page.next'), ['tok']);
});

test('null is a value and not an absence', () => {
  assert.deepEqual(selectAll(doc, 'page.empty'), [null]);
});

test('a missing key reaches nothing', () => {
  assert.deepEqual(selectAll(doc, 'page.missing'), []);
  assert.deepEqual(selectAll(doc, 'nope.deeper.still'), []);
});

test('an index reaches one element', () => {
  assert.deepEqual(selectAll(doc, 'data[0].id'), [1]);
  assert.deepEqual(selectAll(doc, 'data[1].id'), [2]);
});

test('an index past the end reaches nothing', () => {
  assert.deepEqual(selectAll(doc, 'data[9].id'), []);
});

test('[-1] is the last', () => {
  assert.deepEqual(selectAll(doc, 'data[-1].id'), [2]);
  assert.deepEqual(selectAll({ a: [] }, 'a[-1]'), []);
});

test('[] multiplies', () => {
  assert.deepEqual(selectAll(doc, 'data[].id'), [1, 2]);
  assert.deepEqual(selectAll(doc, 'data[].tags[]'), ['a', 'b']);
});

test('[] over a missing key in one row skips that row', () => {
  assert.deepEqual(selectAll({ a: [{ b: 1 }, {}, { b: 3 }] }, 'a[].b'), [1, 3]);
});

test('an index on a root array', () => {
  assert.deepEqual(selectAll([{ id: 7 }], '[0].id'), [7]);
  assert.deepEqual(selectAll([{ id: 7 }, { id: 8 }], '[].id'), [7, 8]);
});

test('an index on a non-array reaches nothing', () => {
  assert.deepEqual(selectAll(doc, 'page[]'), []);
  assert.deepEqual(selectAll(doc, 'page[0]'), []);
});

test('a key on a non-object reaches nothing', () => {
  assert.deepEqual(selectAll(doc, 'page.next.deeper'), []);
});

test('inherited properties are not reached', () => {
  assert.deepEqual(selectAll({}, '__proto__'), []);
  assert.deepEqual(selectAll({}, 'constructor'), []);
  assert.deepEqual(selectAll({}, 'toString'), []);
});

test('an own property named like a prototype member is reached', () => {
  assert.deepEqual(selectAll(JSON.parse('{"constructor": 5}'), 'constructor'), [5]);
});

test('keys are exact and case-sensitive', () => {
  assert.deepEqual(selectAll({ Amount: 1 }, 'amount'), []);
  assert.deepEqual(selectAll({ Amount: 1 }, 'Amount'), [1]);
});

const refuses = (path: string) => {
  assert.throws(
    () => selectAll(doc, path),
    (e: unknown) => (e as { code: string }).code === 'PATH_INVALID',
    `expected ${path} to be refused`,
  );
};

test('a malformed path is refused, and a path is a declaration', () => {
  refuses('a..b');
  refuses('a[');
  refuses('a[x]');
  refuses('a[1');
  refuses('a[-2]');
  refuses('a[0][1]');
  refuses('a]b');
  refuses('.a');
});

test('sixteen segments is the ceiling', () => {
  const ok = Array.from({ length: 16 }, () => 'a').join('.');
  assert.deepEqual(selectAll({}, ok), []);
  refuses(`${ok}.a`);
});


/* ── where the two grammars part company, as cases ───────────────────────── */

test('a key outside 47 §4.3’s charset is a key here', () => {
  assert.deepEqual(selectAll({ 'atom:entry': 1 }, 'atom:entry'), [1]);
  assert.deepEqual(selectAll({ 'Amount (EGP)': 2 }, 'Amount (EGP)'), [2]);
  assert.deepEqual(selectAll({ 'été': 3 }, 'été'), [3]);
});

test('a second fan is legal here and the answer stays flat', () => {
  const rows = { a: [{ b: [1, 2] }, { b: [3] }] };
  assert.deepEqual(selectAll(rows, 'a[].b[]'), [1, 2, 3]);
});

test('a hole in a fan is dropped here, where readPath keeps it', () => {
  assert.deepEqual(selectAll({ a: [{ b: 1 }, {}, { b: 3 }] }, 'a[].b'), [1, 3]);
});

test('a malformed path is refused here, where readPath answers undefined', () => {
  assert.throws(() => selectAll({}, 'a[x]'), (e: unknown) => (e as { code: string }).code === 'PATH_INVALID');
});
