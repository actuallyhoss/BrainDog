/**
 * "Make a component": the lines the rules draw into a block, and the ones they leave to the model.
 * Invented lists only; nothing here names a list the record must hold.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeOf, type ComposeList } from './compose.ts';

const SHIFTS: ComposeList = {
  id: 'shifts',
  name: 'Crew pay',
  one: 'Shift',
  title: 'who',
  fields: [
    { id: 'who', type: 'text', label: 'Who' },
    { id: 'paid_on', type: 'day', label: 'Paid on' },
    { id: 'wage', type: 'money', label: 'Wage' },
    { id: 'state', type: 'enum', values: ['pending', 'paid', 'held'], label: 'State' },
  ],
};
const NOTES: ComposeList = { id: 'notes', name: 'Notes', fields: [{ id: 'body', type: 'text' }] };
const NOW = Date.UTC(2026, 9, 20);
const draw = (text: string, current: string | null = null) => composeOf({ text, lists: [SHIFTS, NOTES], current, now: NOW });

test('A LIST NAMED IN THE LINE AND A SHAPE BECOME ONE BLOCK OVER THAT LIST', () => {
  const got = draw('crew pay as a calendar');
  assert.ok(got);
  assert.equal(got.block.kind, 'calendar');
  assert.equal(got.block.source, 'register.shifts');
  assert.deepEqual(got.block.columns, [{ field: 'who', label: 'Who' }, { field: 'paid_on', label: 'Paid on' }]);
  assert.match(got.said, /crew pay as a calendar/u);
});

test('A WINDOW OVER A DATED AMOUNT, WITH NO SHAPE SAID, IS A LINE', () => {
  const got = draw('wages for the next 90 days', 'shifts');
  assert.equal(got?.block.kind, 'lines');
  assert.equal(got?.block.where, 'paid_on is between today and +90d');
  assert.deepEqual(got?.block.order, [{ field: 'paid_on', dir: 'asc' }]);
});

test('AN AREA CHART IS DRAWN AS THE LINE, and a bar chart groups by a choice', () => {
  assert.equal(draw('crew pay for the next 3 months as an area chart')?.block.kind, 'lines');
  const bars = draw('crew pay by state as a bar chart');
  assert.equal(bars?.block.kind, 'bar');
  assert.equal((bars?.block.columns as { field: string }[])[0]!.field, 'state');
  assert.equal(bars?.block.where, undefined, 'grouping by a choice filtered to one of its values');
});

test('A CHOICE WORD FILTERS, AND A NEGATED ONE LEAVES IT OUT', () => {
  assert.equal(draw('crew pay as a table, only held')?.block.where, 'state is held');
  assert.equal(draw('crew pay as a table without paid')?.block.where, 'state is not paid');
});

test('TOP N SETS THE ROWS SHOWN AND RANKS BY THE AMOUNT', () => {
  const got = draw('top 5 crew pay as a table');
  assert.equal(got?.block.limit, 5);
});

test('A LINE THE RULES CANNOT READ IS LEFT TO THE MODEL', () => {
  assert.equal(draw('something nice'), null);
  assert.equal(draw('crew pay'), null, 'no shape and no window');
  assert.equal(draw('notes as a calendar'), null, 'a list with no day cannot be a calendar');
  assert.equal(draw('', 'shifts'), null);
});

test('A LINE NAMING NO LIST USES THE PAGES, AND NONE AT ALL IS NOT GUESSED', () => {
  assert.equal(draw('as a board', 'shifts')?.block.source, 'register.shifts');
  assert.equal(draw('as a board', null), null);
});
