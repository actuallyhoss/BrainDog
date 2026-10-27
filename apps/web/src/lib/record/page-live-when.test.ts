/**
 * A card's when over a figure: the days since its project was worked on, said in words in the card's head.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { whenSaid } from './page-live.ts';

test('A CARD SAYS HOW LONG SINCE IT WAS WORKED ON, quiet past its target, and nothing where the record read nothing', () => {
  assert.equal(whenSaid({ value: 2, met: true }, 'Worked on'), 'Worked on 2 days ago');
  assert.equal(whenSaid({ value: 1, met: true }, 'Worked on'), 'Worked on yesterday');
  assert.equal(whenSaid({ value: 0, met: null }), 'today');
  assert.equal(whenSaid({ value: 40, met: false }, 'Worked on'), 'Quiet for 40 days');
  assert.equal(whenSaid({ value: 1, met: false }), 'Quiet for 1 day');
  assert.equal(whenSaid(null), null);
  assert.equal(whenSaid({ value: -1, met: true }), null);
  assert.equal(whenSaid({ value: 2.5, met: true }), null);
});
