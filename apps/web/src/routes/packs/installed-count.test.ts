/**
 * AUDIT Z10 (packs-browse-390-light.png, packs-390-light.png): Browse said "7 are already in your BrainDog" and
 * Installed said "9 add-ons installed". Browse counted only the installed add-ons its catalogue lists. Both tabs now say
 * the record's own count.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as packWords from './words.ts';

test('Browse and Installed say one count of the add-ons in this BrainDog (audit Z10)', () => {
  const installedCount = (packWords as Record<string, unknown>).installedCount as ((s: readonly unknown[] | null) => number | null) | undefined;
  assert.equal(typeof installedCount, 'function', 'the two tabs still count apart');
  assert.equal(installedCount!(Array.from({ length: 9 }, (_, n) => ({ id: `p${n}` }))), 9);
  assert.equal(installedCount!(null), null);
  const browse = readFileSync(new URL('./browse/+page.svelte', import.meta.url), 'utf8');
  const installed = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.match(browse, /const held = \$derived\(installedCount\(states\)\);/u, 'Browse counts only the listings it holds');
  assert.match(installed, /words\.sentence\(installedCount\(states\) \?\? 0,/u);
});
