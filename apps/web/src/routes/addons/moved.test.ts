import assert from 'node:assert/strict';
import { test } from 'node:test';

import { movedFrom } from './moved.ts';

test('every old add-on address lands where it means now', () => {
  assert.equal(movedFrom('', ''), '/settings/plugins');
  assert.equal(movedFrom('', '?tab=updates'), '/settings/plugins');
  assert.equal(movedFrom('', '?tab=from'), '/settings/plugins?from=1');
  assert.equal(movedFrom('browse', ''), '/plugins');
  assert.equal(movedFrom('browse', '?q=stripe'), '/plugins?q=stripe');
  assert.equal(movedFrom('browse/stripe', '?kind=pack'), '/plugins/stripe?kind=pack');
  assert.equal(movedFrom('browse/founder', ''), '/plugins/founder');
  assert.equal(movedFrom('money-core', ''), '/plugins/money-core');
  assert.equal(movedFrom('bank-hsbc-eg/', ''), '/plugins/bank-hsbc-eg');
  assert.equal(movedFrom('share', '?mode=addon'), '/plugins/share?mode=addon');
});
