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

test('an add-on\'s row has no bare switch: on and off are in its "…", and off is said in words at the row\'s end', () => {
  const row = src.slice(src.indexOf('<div class="line addon">'), src.indexOf('{#if block}'));
  assert.equal(row.includes('class="switch"'), false, 'a bare switch is back on the row');
  const verbs = row.indexOf('<span class="line-verbs">');
  assert.ok(verbs > 0 && row.slice(verbs).includes('words.turnOff'), 'turning an add-on off is not in its menu');
  assert.ok(row.indexOf('class="addon-off"') > verbs, 'off is not said at the end of the row');
  assert.match(rule('.addon > .addon-off'), /justify-self: end;/u);
  assert.match(rule('.addon'), /grid-template-columns: var\(--well-l\) minmax\(0, 1fr\) auto auto;/u);
});
