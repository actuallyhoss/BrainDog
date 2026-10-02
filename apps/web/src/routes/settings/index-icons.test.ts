/**
 * The Settings index's marks: every area wears a glyph this build draws, and none wears its group's. Backups wore the
 * box `This record` is headed with, so the heading and its first row carried one mark and read as one thing said twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isGlyph } from '../../lib/ui/icons.ts';
import { DEFAULT_GROUPS } from './[area]/place.ts';

test('every area wears a glyph this build draws', () => {
  for (const g of DEFAULT_GROUPS) {
    assert.ok(isGlyph(g.icon), `${g.title} is headed with ${g.icon}, which is no glyph`);
    for (const a of g.areas) assert.ok(isGlyph(a.icon), `${a.label} wears ${a.icon}, which is no glyph`);
  }
});

test('no area wears the mark its group is headed with', () => {
  for (const g of DEFAULT_GROUPS) {
    for (const a of g.areas) assert.notEqual(a.icon, g.icon, `${a.label} wears ${g.title}'s own mark`);
  }
});

test('no two areas wear one mark', () => {
  const worn = DEFAULT_GROUPS.flatMap((g) => g.areas.map((a) => a.icon));
  assert.equal(new Set(worn).size, worn.length, `a mark is worn twice: ${worn.join(', ')}`);
});
