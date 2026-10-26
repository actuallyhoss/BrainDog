import assert from 'node:assert/strict';
import { test } from 'node:test';

import { movedFrom } from './moved.ts';

test('every old add-on address lands where it means now', () => {
  assert.equal(movedFrom('', ''), '/settings/addons');
  assert.equal(movedFrom('', '?tab=updates'), '/settings/addons');
  assert.equal(movedFrom('', '?tab=from'), '/settings/addons?from=1');
  assert.equal(movedFrom('browse', ''), '/addons');
  assert.equal(movedFrom('browse', '?q=stripe'), '/addons?q=stripe');
  assert.equal(movedFrom('browse/stripe', '?kind=pack'), '/addons/stripe?kind=pack');
  assert.equal(movedFrom('browse/founder', ''), '/addons/founder');
  assert.equal(movedFrom('money-core', ''), '/addons/money-core');
  assert.equal(movedFrom('bank-hsbc-eg/', ''), '/addons/bank-hsbc-eg');
  assert.equal(movedFrom('share', '?mode=addon'), '/addons/share?mode=addon');
});
