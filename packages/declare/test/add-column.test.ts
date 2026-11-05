/**
 * A column one pack adds to another pack's block, read off its manifest (`add-column.ts`): what reads, and
 * each refusal the reader makes. Invented pages and packs only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ADD_COLUMNS_MOST, columnsFault, readAddColumn } from '../src/add-column.ts';

const COLUMN = { page: 'page.shelf', into: 'kshelf', column: { field: 'weight', label: 'Weight', as: 'fact' } };

const refusal = (r: ReturnType<typeof readAddColumn> | ReturnType<typeof columnsFault>): { code: string; at?: string } => {
  assert.ok(r && !r.ok && 'refusal' in r, 'expected a refusal');
  return r.refusal;
};

test('a column addition reads as its page, the block it goes into and the column', () => {
  const read = readAddColumn('pantry', 'adds.0', { ...COLUMN, note: 'what each jar weighs' });
  assert.deepEqual(read, { ok: true, value: { ...COLUMN, note: 'what each jar weighs' } });
});

test('a figure in place of a field reads, and the label is kept as written', () => {
  const read = readAddColumn('pantry', 'adds.0', { page: 'page.shelf', into: 'kshelf', column: { metric: 'jar-month:{{name}}', label: 'This month', as: 'figure' } });
  assert.ok(read.ok);
  assert.deepEqual(read.value.column, { metric: 'jar-month:{{name}}', label: 'This month', as: 'figure' });
});

test('into and block both, or neither, are refused', () => {
  assert.equal(refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, block: { kind: 'note' } })).code, 'PACK_MALFORMED');
  const neither = refusal(readAddColumn('pantry', 'adds.1', { page: 'page.shelf', column: COLUMN.column }));
  assert.equal(neither.code, 'PACK_MALFORMED');
  assert.equal(neither.at, 'adds.1');
});

test('a column with no label, or a blank one, is refused at its label', () => {
  for (const column of [{ field: 'weight' }, { field: 'weight', label: '  ' }]) {
    const r = refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column }));
    assert.equal(r.code, 'PACK_MALFORMED');
    assert.equal(r.at, 'adds.0.column.label');
  }
});

test('a column naming a field and a figure at once is refused', () => {
  const r = refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column: { field: 'weight', metric: 'jar-month', label: 'Weight' } }));
  assert.equal(r.code, 'PACK_MALFORMED');
  assert.equal(r.at, 'adds.0.column');
});

test('a page that is no page id, an empty into and a stray key are refused', () => {
  assert.equal(refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, page: 'shelf' })).at, 'adds.0.page');
  assert.equal(refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, into: ' ' })).at, 'adds.0.into');
  assert.equal(refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, after: 'Jars' })).at, 'adds.0.after');
  assert.equal(refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column: { ...COLUMN.column, width: 3 } })).at, 'adds.0.column.width');
});

test('a credential anywhere in the addition is refused as one', () => {
  const r = refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column: { ...COLUMN.column, label: 'sk_' + 'live_4eC39HqLyjWDarjtT1zdp7dc' } }));
  assert.equal(r.code, 'SECRET_IN_PACK');
});

test('a colour on a column is refused: the theme names colours', () => {
  const keyed = refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column: { ...COLUMN.column, colour: 'red' } }));
  assert.equal(keyed.code, 'COLOUR_OUTSIDE_THEME');
  const valued = refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column: { ...COLUMN.column, as: '#ff0000' } }));
  assert.equal(valued.code, 'COLOUR_OUTSIDE_THEME');
  assert.equal(valued.at, 'adds.0.column.as');
});

test('a third column from one pack into one block is refused, and two, or two blocks, are not', () => {
  assert.equal(ADD_COLUMNS_MOST, 2);
  const block = { page: 'page.shelf', block: { kind: 'note' } };
  assert.equal(columnsFault([COLUMN, COLUMN, block, { ...COLUMN, into: 'kother' }]), null);
  const r = refusal(columnsFault([COLUMN, block, COLUMN, COLUMN]));
  assert.equal(r.code, 'PACK_MALFORMED');
  assert.equal(r.at, 'adds.3');
  assert.equal(columnsFault([COLUMN, COLUMN, { ...COLUMN, page: 'page.larder' }]), null);
});

test('a column naming neither a field nor a figure is refused, since it would draw a label over nothing', () => {
  const r = refusal(readAddColumn('pantry', 'adds.0', { ...COLUMN, column: { label: 'Weight', as: 'fact' } }));
  assert.equal(r.code, 'PACK_MALFORMED');
  assert.equal(r.at, 'adds.0.column');
});
