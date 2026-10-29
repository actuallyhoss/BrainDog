/** One order for the projects: the sidebar keeps the order it drew, by record, and Today's cards read it back. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MENU, placeOf } from '../nav.ts';
import { keepOrder, keptOrder } from './project-order.ts';

const store = (): Pick<Storage, 'getItem' | 'setItem'> => {
  const kept = new Map<string, string>();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => void kept.set(k, v) };
};

test('the order drawn is kept by record and read back as drawn', () => {
  const s = store();
  keepOrder('/a', ['things#3', 'things#1'], s);
  keepOrder('/b', ['things#9'], s);
  assert.deepEqual(keptOrder('/a', s), ['things#3', 'things#1']);
  assert.deepEqual(keptOrder('/b', s), ['things#9']);
  assert.deepEqual(keptOrder('/c', s), [], 'a record it never drew has no order');
});

test('nothing kept, or nothing to keep it in, is no order', () => {
  assert.deepEqual(keptOrder('/a', null), []);
  const s = store();
  s.setItem('bd_side_order', '{');
  assert.deepEqual(keptOrder('/a', s), []);
});

test('the phone’s Menu is a place of its own, and its address draws Today on a desk', () => {
  assert.equal(placeOf('/', new URLSearchParams('menu')), MENU);
  assert.equal(placeOf('/', new URLSearchParams('')), '/');
});
