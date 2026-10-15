/**
 * A row's mark, picked in its panel (PGS-A06): the field a list declares, the one write a pick makes, and the names it
 * refuses. Invented lists and names only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGISTERS } from '../record/held.ts';
import { readableFields } from '../record/api.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { MARK_WORDS, markFieldOf, markPatch, mayBeMark } from './mark-pick.ts';

const field = (id: string, type = 'text') => ({ id, label: id, type }) as RegisterDecl['fields'][number];

REGISTERS.orchards = {
  id: 'orchards',
  name: 'Orchards',
  one: 'Orchard',
  title: 'title',
  mobile: ['title', 'emblem', 'tint'],
  fields: [field('title'), field('emblem'), field('tint', 'number'), field('acres', 'number')],
  identity: { mark: 'emblem', accent: 'tint' },
} as RegisterDecl;

REGISTERS.pebbles = {
  id: 'pebbles',
  name: 'Pebbles',
  one: 'Pebble',
  title: 'title',
  mobile: ['title', 'title', 'title'],
  fields: [field('title')],
} as RegisterDecl;

test('a list that declares a mark gives its field', () => {
  assert.equal(markFieldOf('orchards'), 'emblem');
});

test('a list that declares none, or no list at all, gives null', () => {
  assert.equal(markFieldOf('pebbles'), null);
  assert.equal(markFieldOf('nowhere'), null);
  assert.equal(markPatch('pebbles', 'gift'), null);
  assert.equal(markPatch('pebbles', null), null);
});

test('a pick writes the mark field and nothing else', () => {
  assert.deepEqual(markPatch('orchards', 'gift'), { emblem: 'gift' });
  assert.deepEqual(markPatch('orchards', '  rocket '), { emblem: 'rocket' });
});

test('clearing writes null to the mark field', () => {
  assert.deepEqual(markPatch('orchards', null), { emblem: null });
});

test('a name the host does not draw is refused', () => {
  assert.equal(markPatch('orchards', 'not-a-glyph-at-all'), null);
  assert.equal(markPatch('orchards', ''), null);
  assert.equal(mayBeMark('not-a-glyph-at-all'), false);
});

test('a control is refused as a mark, under any of its names', () => {
  for (const control of ['close', 'x', 'pencil', 'trash-2']) assert.equal(markPatch('orchards', control), null, control);
  assert.equal(MARK_WORDS.refused, 'Pick a picture that is not a button.');
});

test('the form still hides the mark: readableFields is unchanged', () => {
  assert.deepEqual(
    readableFields('orchards').map((f) => f.id),
    ['title', 'acres'],
  );
});

test('the words have no em dash', () => {
  const said = [MARK_WORDS.change, MARK_WORDS.heading, MARK_WORDS.clear, MARK_WORDS.close, MARK_WORDS.refused, MARK_WORDS.said('Pear'), MARK_WORDS.cleared('Pear')];
  for (const s of said) assert.ok(!s.includes('—'), s);
});

/* THE PANEL: the picker is loaded on press, never with the panel, and the write is the panel's own. */
const PANEL = readFileSync(new URL('./RowPanel.svelte', import.meta.url), 'utf8');

test('the panel loads the picker by import() on press, never statically', () => {
  assert.doesNotMatch(PANEL, /import\s+GlyphPicker\b/u);
  assert.match(PANEL, /import\('\.\/GlyphPicker\.svelte'\)/u);
});

test('the mark is a button only where the reader may edit and the list declares a mark', () => {
  assert.match(PANEL, /markField !== null && mayWrite/u);
  assert.match(PANEL, /aria-label=\{MARK_WORDS\.change\}/u);
});

test('a pick goes through the panel row write, which carries its Undo', () => {
  assert.match(PANEL, /host\.write\(r, patch,/u);
});

test('a pick or Done closes the picker and gives focus back to the mark', () => {
  assert.match(PANEL, /bind:this=\{markButton\}/u);
  assert.match(PANEL, /markButton\?\.focus\(\)/u);
  assert.doesNotMatch(PANEL, /onclick=\{\(\) => \(picking = false\)\}/u);
});
