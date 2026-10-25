/**
 * The Keychain opens without writing, says one name, and its folded projects sit as one list (audit of 25 October, X24).
 *
 * `/keychain` sent `clearVaultPassphrase` (a write, answered 501 on a self-host) just by opening, to learn whether a
 * passphrase was on. The key doors already say so when one is (`wantsPassphrase`), so the switch asks only when it is
 * pressed. Read from the screen's own text, as `one-list.test.ts` reads the Settings areas.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { copy } from '../../lib/copy.ts';
import { DEFAULT_GROUPS, rowsOf } from '../settings/[area]/place.ts';

const src = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const code = (text: string): string => text.replaceAll(/<!--[\s\S]*?-->/gu, '').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

test('opening the Keychain asks nothing that writes: the passphrase is asked about on the switch press', () => {
  const page = code(src('./+page.svelte'));
  const passphrase = code(src('./Passphrase.svelte'));
  /* THE ONE PROBE LEFT IS AFTER A KEY WAS PUT, the person's own write, on a Keychain that could not have one before it. */
  assert.deepEqual(page.match(/void probe\(\)/gu) ?? [], ['void probe()'], 'the page probes the passphrase somewhere besides after a key is put');
  assert.match(page, /if \(lock\.state === 'none'\) void probe\(\);/u);
  assert.match(page, /<Passphrase[^>]*onask=\{probe\}/u, 'the switch cannot ask when it is pressed');
  assert.match(passphrase, /await onask\(\)/u, 'the press does not ask before opening a sheet');
});

test('the folded projects sit as one list, with no gap between them', () => {
  const page = src('./+page.svelte');
  assert.match(page, /details\.key-group:not\(\[open\]\) \+ details\.key-group\s*\{\s*margin-block-start: 0;/u, 'folded groups still stand apart');
});

test('Settings and the page call it by one name', () => {
  const row = DEFAULT_GROUPS.flatMap(rowsOf).find((r) => r.href === '/keychain');
  assert.match(src('./+page.svelte'), /<PageHead icon="vault" title=\{copy\.keychain\}/u);
  assert.equal(row?.label, copy.keychain, 'Settings names the Keychain one way and the page another');
});
