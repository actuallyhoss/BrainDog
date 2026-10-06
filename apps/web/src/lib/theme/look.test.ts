/**
 * The look editor's row heights are the skin's: `ROW_H` drew 32, 36 and 44 while `tokens.css` draws 36, 44 and 52, so a
 * saved look shrank every row and the specimen showed rows no screen drew.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ROW_H, densityOf, draftFrom } from './look.ts';

const tokens = readFileSync(fileURLToPath(new URL('../../../../../packages/skin/tokens.css', import.meta.url)), 'utf8');

const px = (re: RegExp): number => {
  const m = re.exec(tokens);
  assert.ok(m, `tokens.css no longer says ${re}`);
  return Number(m[1]);
};

test('ROW_H is the row height tokens.css draws at each density', () => {
  /* COMFORTABLE IS `:root`'s, the first `--row-h` in the file; the other two are the density attributes'. */
  assert.equal(ROW_H.comfortable, px(/--row-h:\s*(\d+)px/u));
  assert.equal(ROW_H.compact, px(/data-density='compact'\]\s*\{\s*--row-h:\s*(\d+)px/u));
  assert.equal(ROW_H.roomy, px(/data-density='roomy'\]\s*\{\s*--row-h:\s*(\d+)px/u));
});

test('a saved row height reads back as the density it draws nearest to, old saves included', () => {
  for (const d of ['compact', 'comfortable', 'roomy'] as const) assert.equal(densityOf(ROW_H[d]), d);
  assert.equal(densityOf(null), 'comfortable');
  /* A LOOK SAVED WHEN ROW_H WAS 32, 36 AND 44: each is read by the rows it drew. */
  assert.equal(densityOf(32), 'compact');
  assert.equal(densityOf(36), 'compact');
  assert.equal(densityOf(44), 'comfortable');
  assert.equal(draftFrom({ light: { 'row-h': '52px' }, dark: {} }).density, 'roomy');
  assert.equal(draftFrom(null).density, 'comfortable');
});
