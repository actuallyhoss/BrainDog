/**
 * Saved views: a record's are its pages under Views, the sample's are its own, and neither is read for the other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { VIEWS } from './data.ts';
import { savedViews, viewMovedTo } from './views.ts';

const nav = [
  { id: 'overview', title: 'Overview', href: '/p/overview', section: 'Pages' },
  { id: 'obligations-mf3', title: 'Overdue to pay', href: '/p/obligations-mf3', section: copy.viewsSection },
];

test("a live record's views are its pages under Views, and none of the sample's", () => {
  assert.deepEqual(savedViews({ live: true, nav }), [{ key: 'obligations-mf3', name: 'Overdue to pay', href: '/p/obligations-mf3', register: null }]);
  assert.deepEqual(savedViews({ live: true, nav: [] }), []);
});

test("the sample's views are its own, at /v/", () => {
  const drawn = savedViews({ live: false, nav });
  assert.ok(drawn.length > 0, 'the sample holds no views, so this proves nothing');
  assert.deepEqual(drawn.map((v) => v.key), Object.keys(VIEWS));
  assert.ok(drawn.every((v) => v.href === `/v/${v.key}` && v.register !== null));
});

test('an old view link on a live record goes to the page, and the sample draws its view', () => {
  assert.equal(viewMovedTo({ live: true }, 'obligations-mf3'), '/p/obligations-mf3');
  assert.equal(viewMovedTo({ live: false }, Object.keys(VIEWS)[0]!), null);
});
