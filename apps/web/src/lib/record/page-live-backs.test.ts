/**
 * WHAT BACKS A FIGURE REACHES ITS TILE. The record says which entries a reading was added up from (`backs`, by handle),
 * and Home says two figures of one amount once only where one entry backs both (`default-home.ts` `oneBacks`). The tile
 * dropped the field, so that was never true, and an order paid in full was said twice: "was paid, and came in".
 *
 * Each test fails by itself on that code: the tile came back with no `backs`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { tileOf } from './page-live.ts';

const reading = (more: Record<string, unknown> = {}) => ({ value: 90000, unit: 'EGP', rows: 1, held: 4, met: null, refusals: [], ...more });
const tile = (metric: string, more?: Record<string, unknown>) => tileOf({ metric, reading: reading(more) } as never);

test('A TILE CARRIES WHAT BACKS ITS FIGURE, as the record sent it', () => {
  assert.deepEqual(tile('settled-in-7d', { backs: ['obligations#12'] }).backs, ['obligations#12']);
  assert.deepEqual(tile('received-7d', { backs: ['obligations#12', 'obligations#14'] }).backs, ['obligations#12', 'obligations#14']);
});

test('A FIGURE THE RECORD SENT NOTHING BEHIND SAYS NOTHING ABOUT IT, so two equal amounts stay two moneys', () => {
  assert.equal('backs' in tile('settled-in-7d'), false, 'an older record sends no backs');
  assert.equal('backs' in tile('settled-in-7d', { backs: [] }), false, 'and none behind it is not a list of none');
});

test('ONLY HANDLES ARE KEPT: the field is JSON from a record, and nobody checked it', () => {
  assert.equal('backs' in tile('settled-in-7d', { backs: 'obligations#12' }), false);
  assert.deepEqual(tile('settled-in-7d', { backs: ['obligations#12', 7, '', null] }).backs, ['obligations#12']);
});

test('A FIGURE IN SEVERAL CURRENCIES CARRIES IT TOO', () => {
  const parts = [
    { key: 'EGP', label: 'EGP', value: 90000, unit: 'EGP' },
    { key: 'USD', label: 'USD', value: 1500, unit: 'USD' },
  ];
  assert.deepEqual(tile('settled-in-7d', { value: null, unit: null, parts, backs: ['obligations#12'] }).backs, ['obligations#12']);
});

test('A FIGURE THAT COULD NOT BE READ IS BACKED BY NOTHING', () => {
  assert.equal('backs' in tile('settled-in-7d', { value: null, backs: ['obligations#12'] }), false);
});
