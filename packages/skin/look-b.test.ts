/**
 * Look B as the site imports it: `look-b.css` here is the sheet a page names, and the palette it pulls in lives in the
 * theme package, where a colour may be written. `packages/theme/src/look-b.test.ts` holds the palette itself (the
 * names the site was handed, the two dark blocks, `--red-fill`'s contrast).
 *
 * THIS SHEET WRITES NO COLOUR AND ONLY PULLS ONE IN, so a value can only come from the theme. And `tokens.css` names
 * Lexend as the display face, with no Poppins face left declared.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const decomment = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//gu, '');

const SPECIFIER = '@braindog/theme/look-b.css';

test('look-b.css is one import of the theme package\'s palette, and writes no colour', () => {
  const sheet = decomment(source('./look-b.css')).trim();
  assert.equal(sheet, `@import '${SPECIFIER}';`);
  assert.doesNotMatch(source('./look-b.css'), /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/iu);
});

test('the import resolves to the theme package\'s sheet, which opens a tokens layer', () => {
  const path = fileURLToPath(import.meta.resolve(SPECIFIER));
  assert.ok(path.replace(/\\/gu, '/').endsWith('packages/theme/look-b.css'), path);
  assert.match(decomment(readFileSync(path, 'utf8')), /^\s*@layer tokens \{/u);
});

test('tokens.css names Lexend as the display face and declares no Poppins face', () => {
  const tokens = decomment(source('./tokens.css'));
  const faces = [...tokens.matchAll(/@font-face\s*\{([^}]*)\}/gu)].map((m) => m[1] ?? '');
  const families = faces.map((f) => /font-family:\s*'([^']+)'/u.exec(f)?.[1]);
  assert.ok(families.includes('Lexend'), 'a Lexend face');
  assert.ok(!families.includes('Poppins'), 'no Poppins face');
  const lexend = faces[families.indexOf('Lexend')] ?? '';
  assert.match(lexend, /url\('\/fonts\/lexend-600\.woff2\?v=[0-9a-f]{4}'\)/u);
  assert.match(lexend, /font-weight:\s*600;/u);
  assert.match(tokens, /--font-display:\s*'Lexend',/u);
  assert.doesNotMatch(tokens, /Poppins/u);
});
