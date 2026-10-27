/**
 * A store preview draws an add-on's pages before the record holds its lists: the add-on's
 * own list declarations are lent to the drawing and taken back, so no part says it "cannot be drawn from the record yet"
 * and no list the record does not hold is left behind for the rest of the tab to offer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../record/fixtures/fill.ts';
import { REGISTERS } from '../record/held.ts';
import { liveWords } from '../record/page-live.ts';
import { openedOf } from './preview.ts';

const GLAZES = { register: 'glazes_tried', name: 'Glazes tried', title: 'name', fields: [{ id: 'name', type: 'text', label: 'Glaze' }, { id: 'cone', type: 'number', label: 'Cone' }] };

const answer = {
  page: 'glazes',
  title: 'Glazes',
  blocks: [
    {
      kind: 'table',
      source: 'register.glazes_tried',
      heading: 'Tried lately',
      columns: [{ field: 'name', label: 'Glaze' }, { field: 'cone', label: 'Cone' }],
      rows: [{ seq: 1, fields: { name: 'Celadon', cone: 6 } }],
      matched: 1,
      refusals: [],
    },
  ],
};

test('an add-on’s own list is lent to its preview, so its table draws, and is taken back after', () => {
  const now = Date.UTC(2026, 9, 25);
  const drawn = openedOf(answer as never, now, [GLAZES]);
  assert.equal(drawn.from, 'live');
  if (drawn.from !== 'live') return;
  const table = drawn.page.blocks[0]!;
  assert.notEqual(table.cannot, liveWords.cannot);
  assert.equal(table.rows.length, 1);
  assert.equal(REGISTERS.glazes_tried, undefined, 'the list is not left for the tab to offer');
});

test('a list the record already holds is not replaced by the preview’s', () => {
  const before = REGISTERS.tasks;
  openedOf(answer as never, Date.UTC(2026, 9, 25), [{ ...GLAZES, register: 'tasks', name: 'Not tasks' }]);
  assert.equal(REGISTERS.tasks, before);
});
