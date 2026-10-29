/**
 * Delete and Export say what they are about.
 *
 * A RECORD NAMED AFTER ITS OWNER read "Delete Marta" over the delete control, which says deleting her. The title says
 * "this record", and the record's own name stays in the sentence under it. Export named the first three lists the
 * shell happened to hold ("Exchange rates, Books, Updates"), two of them nearly empty; it names the three that hold
 * the most now, and the tile about a key nobody can see is gone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { copy } from '../../lib/copy.ts';
import { biggestNames } from './[area]/areas/export-names.ts';

const strip = (text: string) => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('the delete title says this record, never the name it carries', () => {
  assert.equal(copy.deleteRecord, 'Delete my BrainDog');
  assert.doesNotMatch(copy.deleteWhat('Marta Quill'), /^Deleting Marta Quill removes/u, 'it reads as deleting her');
  assert.match(copy.deleteWhat('Marta Quill'), /Marta Quill/u, 'the record is still named once');
  assert.match(copy.deleteWhat('Marta Quill'), /cannot be undone/u);
});

test('export names the three lists that hold the most, then how many more', () => {
  const lists = [
    { id: 'rates', name: 'Rates of the day' },
    { id: 'shelves', name: 'Shelves' },
    { id: 'notes', name: 'Notes' },
    { id: 'kilns', name: 'Kiln firings' },
    { id: 'glazes', name: 'Glazes' },
  ];
  const counts = [
    { id: 'rates', count: 2 },
    { id: 'shelves', count: 0 },
    { id: 'notes', count: 40 },
    { id: 'kilns', count: 912 },
    { id: 'glazes', count: 75 },
  ];
  assert.deepEqual(biggestNames(lists, counts), ['Kiln firings', 'Glazes', 'Notes', '2 more']);
  assert.deepEqual(biggestNames(lists.slice(0, 2), counts), ['Rates of the day', 'Shelves']);
  assert.deepEqual(biggestNames([], counts), []);
  /* A LIST THE INDEX GIVES NO COUNT FOR sorts after those it does, in the shell's order. */
  assert.deepEqual(biggestNames([{ id: 'x', name: 'Unknown' }, { id: 'notes', name: 'Notes' }], counts), ['Notes', 'Unknown']);
});

test('the export screen draws no tile about a key it cannot show', () => {
  const page = strip(readFileSync(new URL('./[area]/areas/Export.svelte', import.meta.url), 'utf8'));
  assert.doesNotMatch(page, /notHereYet|theSignature/u);
  assert.match(page, /biggestNames\(/u, 'the lists are not named by size');
});
