/**
 * Saved views: a record's are its pages under Views.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { savedViews, viewMovedTo } from './views.ts';

const nav = [
  { id: 'overview', title: 'Overview', href: '/p/overview', section: 'Pages' },
  { id: 'obligations-mf3', title: 'Overdue to pay', href: '/p/obligations-mf3', section: copy.viewsSection },
];

test("a live record's views are its pages under Views, and nothing else", () => {
  assert.deepEqual(savedViews({ nav }), [{ key: 'obligations-mf3', name: 'Overdue to pay', href: '/p/obligations-mf3', register: null }]);
  assert.deepEqual(savedViews({ nav: [] }), []);
});

test('an old view link on a live record goes to the page, and elsewhere it is drawn where it is', () => {
  assert.equal(viewMovedTo({ live: true }, 'obligations-mf3'), '/p/obligations-mf3');
  assert.equal(viewMovedTo({ live: false }, 'obligations-mf3'), null);
});
