/**
 * The Add-ons board: its tiles are the board's one gap apart, and an add-on's switch is the last thing in its row, on
 * the tile's own edge.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = readFileSync(new URL('./Installed.svelte', import.meta.url), 'utf8');
const css = src.slice(src.indexOf('<style>')).replace(/\/\*[\s\S]*?\*\//gu, '');
const rule = (selector: string): string => new RegExp(`(?:^|\\n)  ${selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')} \\{([^}]*)\\}`, 'u').exec(css)?.[1] ?? '';

test('the tiles are 12 apart, as on every other board', () => {
  assert.match(rule('.page'), /gap: var\(--tile-gap\);/u);
  assert.match(rule('.board'), /gap: var\(--tile-gap\);/u, 'the board\'s tiles are 32 apart again');
  const tokens = readFileSync(new URL('../../../../../packages/skin/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /--tile-gap: 12px;/u);
});

test('an add-on\'s switch ends its row, after the "…" that only shows under the pointer', () => {
  const row = src.slice(src.indexOf('<div class="line addon">'), src.indexOf('{#if block}'));
  const verbs = row.indexOf('<span class="line-verbs">');
  const sw = row.indexOf('class="switch"');
  assert.ok(verbs > 0 && sw > verbs, 'the switch is drawn before the menu, which leaves it 45px inside the tile\'s edge');
  assert.equal(row.slice(sw).includes('<Menu'), false);
  /* THE TRACK ENDS ON THE EDGE AT EVERY TARGET SIZE, the 44px one under a thumb included. */
  assert.match(rule('.addon > .switch'), /justify-items: end;/u);
  assert.match(rule('.addon'), /grid-template-columns: var\(--well-l\) minmax\(0, 1fr\) auto auto;/u);
});
