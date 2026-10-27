/**
 * A declared page's head as the read sends it, narrowed: a full head kept whole, none and a malformed one
 * answered `null` so the page draws as it did, and a part this build cannot read left out alone. Invented names inline.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { headOf, searchQuery } from './declared-head.ts';

const FULL = {
  title: 'Workshop',
  head: {
    kicker: 'Thursday 15 October',
    count: { value: 7, said: '7' },
    state: { tone: 'bad', words: 'Two orders are late' },
    action: { verb: 'row.create', label: 'Add an order', hard: false, undo: true },
    search: { param: 'q' },
    back: { href: '/p/shop-floor', label: 'Shop floor' },
    byline: true,
  },
};

test('a full head is kept whole', () => {
  assert.deepEqual(headOf(FULL), FULL.head);
});

test('a page with no head has none', () => {
  assert.equal(headOf({ title: 'Workshop' }), null);
  assert.equal(headOf(null), null);
  assert.equal(headOf(undefined), null);
  assert.equal(headOf({ title: 'Workshop', head: {} }), null);
});

test('a malformed head is none, and a malformed part is left out alone', () => {
  assert.equal(headOf({ head: 'Workshop' }), null);
  assert.equal(headOf({ head: [FULL.head] }), null);
  assert.equal(
    headOf({ head: { kicker: 3, count: { value: 'seven' }, state: { tone: 'purple', words: 'Odd' }, action: { verb: 'row.create' }, search: { param: 'Two words' }, back: { href: 'https://elsewhere.example', label: 'Away' } } }),
    null,
  );
  assert.deepEqual(headOf({ head: { kicker: 'Shop floor', back: { href: '//elsewhere.example', label: 'Away' } } }), { kicker: 'Shop floor' });
  assert.deepEqual(headOf({ head: { count: { value: 4 }, byline: 'yes' } }), { count: { value: 4, said: '4' } });
});

test('a search sets its word in the address and keeps the rest', () => {
  const params = new URLSearchParams('f.stage=packed');
  assert.equal(searchQuery(params, 'q', ' blue mugs '), 'f.stage=packed&q=blue+mugs');
  assert.equal(searchQuery(new URLSearchParams('q=mugs&f.stage=packed'), 'q', ''), 'f.stage=packed');
});
