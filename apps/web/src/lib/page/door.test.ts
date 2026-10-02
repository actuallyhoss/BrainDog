/**
 * What `o` opens from a block on a declared page (`door.ts`): its list where it has one, and Decide or Activity for the
 * blocks over questions and what changed, so the key acts on every row a page like Kiln's walks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { doorOf } from './door.ts';

test('A LIST OPENS AT ITS OWN NAME', () => {
  assert.equal(doorOf({ register: 'tasks', source: 'register.tasks' }), '/r/tasks');
});

test('A QUEUE OPENS DECIDE, AND WHAT CHANGED OPENS ACTIVITY', () => {
  assert.equal(doorOf({ source: 'governance.open', where: 'about is things#1' }), '/decide');
  assert.equal(doorOf({ source: 'activity' }), '/audit');
});

test('A SOURCE WITH NO SCREEN OF ITS OWN HAS NO DOOR', () => {
  assert.equal(doorOf({ source: 'forecast.runway' }), null);
  assert.equal(doorOf({}), null);
});
