/**
 * A reading says its number with its unit and the day it was read (the audit of 25 October, Y17): Numbers printed
 * "CPU, kettle 16.4" with the "%" in a field nobody drew, and the row split "Value 16.4" from "Unit %" and never said
 * when.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readingOf, readingSaid, valueSaid } from './reading.ts';
import type { RegisterDecl } from './schema.ts';

const READINGS = {
  id: 'gauges',
  name: 'Gauges',
  one: 'gauge',
  title: 'name',
  mobile: ['name', 'value', 'at'],
  fields: [
    { id: 'name', type: 'text' },
    { id: 'value', type: 'decimal' },
    { id: 'unit', type: 'text' },
    { id: 'at', type: 'instant' },
  ],
} as unknown as RegisterDecl;

const TARGETS = {
  ...READINGS,
  id: 'aims',
  mobile: ['name', 'target'],
  fields: [
    { id: 'name', type: 'text' },
    { id: 'target', type: 'decimal' },
    { id: 'unit', type: 'text' },
  ],
} as unknown as RegisterDecl;

const NOW = Date.parse('2026-10-25T12:00:00Z');

test('A LIST OF READINGS IS ONE WITH A NUMBER, A UNIT AND THE MOMENT IT WAS READ, and a list of targets is not', () => {
  assert.deepEqual(readingOf(READINGS), { value: 'value', unit: 'unit', at: 'at' });
  assert.equal(readingOf(TARGETS), null, 'a target is not a reading, so it says no day');
  assert.equal(readingOf(undefined), null);
});

test('THE VALUE CARRIES ITS UNIT: a share on its figure, any other unit after a space, a count of one in the singular', () => {
  const r = readingOf(READINGS)!;
  assert.equal(valueSaid({ value: 16.4, unit: '%' }, r), '16.4%');
  assert.equal(valueSaid({ value: 54, unit: 'GB' }, r), '54 GB');
  assert.equal(valueSaid({ value: 45649, unit: '' }, r), '45,649');
  assert.equal(valueSaid({ value: 1, unit: 'players' }, r), '1 player');
  assert.equal(valueSaid({ value: 120, unit: 'USD' }, r), 'USD 120.00', 'a currency code makes it money, as a reading\'s unit does');
  assert.equal(valueSaid({ unit: '%' }, r), null, 'a reading with no number says nothing');
});

test('THE ROW SAYS WHEN IT WAS READ: "16.4% on 28 Sep", from the moment, else the day it was added', () => {
  const r = readingOf(READINGS)!;
  assert.equal(readingSaid({ value: 16.4, unit: '%', at: '2026-09-28T07:00:00.000Z' }, r, '2026-09-29T00:00:00.000Z', NOW), '16.4% on 28 Sep');
  assert.equal(readingSaid({ value: 16.4, unit: '%' }, r, '2026-09-29T00:00:00.000Z', NOW), '16.4% on 29 Sep');
});

test('THE LIST JOINS THE UNIT TO ITS VALUE, and the row page says the reading in its head', () => {
  const list = readFileSync(new URL('../../routes/r/[register]/+page.svelte', import.meta.url), 'utf8');
  assert.match(list, /valueSaid\(/u);
  const row = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');
  assert.match(row, /readingSaid\(/u);
});
