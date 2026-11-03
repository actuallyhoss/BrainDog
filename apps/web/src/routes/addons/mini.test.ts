/**
 * Every use case this build ships draws a card in miniature (`mini.ts`): four tiles at most, each with a heading and a
 * shape, never a voice key or a `{{`, and a glyph the app can draw.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USE_CASES } from '@braindog/seed/usecases';
import { isGlyph } from '../../lib/ui/icons.ts';
import { copy } from '../../lib/copy.ts';
import { words } from '../../lib/market/words.ts';
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

test('ONE WORD FOR A STARTER EVERYWHERE, and the menu is never "Rail"', () => {
  assert.equal(words.kinds.usecase, 'Starter');
  assert.equal(words.store.starters, 'Starters');
  assert.equal(words.categories['ways-of-working'], 'Starters');
  assert.equal(copy.browseAll, 'All starters and plugins');
  assert.equal(copy.browseRail, 'Menu');
  for (const w of [copy.browseAll, copy.browseRail, copy.browseNoRail, words.kinds.usecase]) assert.doesNotMatch(w, /use case|rail/iu, w);
});
