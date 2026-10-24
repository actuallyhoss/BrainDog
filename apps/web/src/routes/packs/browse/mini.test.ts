/**
 * Every use case this build ships draws a card in miniature (`mini.ts`): four tiles at most, each with a heading and a
 * shape, never a voice key or a `{{`, and a glyph the app can draw.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USE_CASES } from '@braindog/seed/usecases';
import { isGlyph } from '../../../lib/ui/icons.ts';
import { copy } from '../../../lib/copy.ts';
import { words } from '../../../lib/market/words.ts';
import { readFileSync } from 'node:fs';
import { ADDON_GLYPHS, FOLDED_MOST, folds, sectionChips } from '../../../lib/market/categories.ts';
import { miniOf, shapeOf } from './mini.ts';

test('every use case draws one to four tiles, each named, with a glyph the app draws', () => {
  for (const u of USE_CASES) {
    const m = miniOf(u, (k) => (u.voice as Record<string, string | undefined>)[k] ?? null);
    assert.ok(m.tiles.length >= 1 && m.tiles.length <= 4, `${u.usecase} draws ${m.tiles.length} tiles`);
    for (const t of m.tiles) {
      assert.ok(t.title.trim() !== '', `${u.usecase} draws a tile with no name`);
      assert.doesNotMatch(t.title, /\{\{/u, `${u.usecase} draws a placeholder`);
    }
    if (m.glyph !== null) assert.ok(isGlyph(m.glyph), `${u.usecase}'s glyph ${m.glyph} is not drawn`);
  }
});

test('a use case that keeps the house Home draws its lists, never "The house Home"', () => {
  const shop = USE_CASES.find((u) => u.usecase === 'shop');
  assert.ok(shop);
  const m = miniOf(shop, () => null);
  assert.deepEqual(
    m.tiles.map((t) => t.title),
    ['Orders', 'Products'],
  );
});

test('a figure is a chart, a board is columns, and anything with rows is a list', () => {
  assert.equal(shapeOf('stat'), 'figure');
  assert.equal(shapeOf('board'), 'board');
  assert.equal(shapeOf('calendar'), 'calendar');
  assert.equal(shapeOf('table'), 'list');
  assert.equal(shapeOf(undefined), 'list');
});

test('ONE WORD FOR A SETUP EVERYWHERE, and the menu is never "Rail" (audit C of 25 October, X10)', () => {
  assert.equal(words.kinds.usecase, 'Ready-made setup');
  assert.equal(words.sections.setups, 'Ready-made setups');
  assert.equal(words.categories['ways-of-working'], 'Ready-made setups');
  assert.equal(copy.browseAll, 'All setups and add-ons');
  assert.equal(copy.browseRail, 'Menu');
  for (const w of [copy.browseAll, copy.browseRail, copy.browseNoRail, words.kinds.usecase]) assert.doesNotMatch(w, /use case|rail/iu, w);
});

/* BROWSE FITS A PHONE (audit C of 25 October, X14): every listed add-on its own glyph, chips short enough for one
   line, and each section showing a few with the rest a press away. */

test('every add-on the store lists wears a glyph of its own, and no two share one', () => {
  const listed = (JSON.parse(readFileSync(new URL('../../../../../../packs/listed.json', import.meta.url), 'utf8')) as { packs: string[] }).packs;
  for (const id of listed) assert.ok(ADDON_GLYPHS[id], `${id} has no glyph of its own`);
  const worn = listed.map((id) => ADDON_GLYPHS[id]!);
  assert.equal(new Set(worn).size, worn.length, 'two listed add-ons wear the same glyph');
  for (const g of worn) assert.ok(isGlyph(g), `${g} is not a glyph the app draws`);
});

test('the chips say each section in a word, and the headings say it whole', () => {
  const chips = sectionChips([{ kind: 'usecase', categories: [] }, { kind: 'pack', categories: [] }, { kind: 'pack', categories: ['themes'] }]);
  assert.deepEqual(chips.map((c) => c.name), ['Setups', 'Add-ons', 'Looks']);
});

test('a section shows four until asked for all, and a search or a chip shows them all', () => {
  assert.equal(FOLDED_MOST, 4);
  assert.equal(folds(13, { searching: false, picked: false, opened: false }), true);
  assert.equal(folds(4, { searching: false, picked: false, opened: false }), false);
  assert.equal(folds(13, { searching: true, picked: false, opened: false }), false);
  assert.equal(folds(13, { searching: false, picked: true, opened: false }), false);
  assert.equal(folds(13, { searching: false, picked: false, opened: true }), false);
  assert.equal(words.showAll(13), 'Show all 13');
});
