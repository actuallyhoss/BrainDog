/**
 * Browse said "7 are already in your BrainDog" and
 * Installed said "9 add-ons installed". Browse counted only the installed add-ons its catalogue lists. Both tabs now say
 * the record's own count. Since the add-ons redesign the store says no count at all, so only Settings ›
 * Add-ons says it, and the two can never disagree.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as packWords from './words.ts';

test('Browse and Installed say one count of the add-ons in this BrainDog', () => {
  const installedCount = (packWords as Record<string, unknown>).installedCount as ((s: readonly unknown[] | null) => number | null) | undefined;
  assert.equal(typeof installedCount, 'function', 'the two tabs still count apart');
  assert.equal(installedCount!(Array.from({ length: 9 }, (_, n) => ({ id: `p${n}` }))), 9);
  assert.equal(installedCount!(null), null);
  const browse = readFileSync(new URL('../plugins/+page.svelte', import.meta.url), 'utf8');
  const installed = readFileSync(new URL('./Installed.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(browse, /words\.sentence\(|states\.length|\.filter\([^)]*installed/u, 'the store counts what the record holds its own way');
  /* AND THE HEADLINE COUNTS THE ADD-ONS ITS LIST SHOWS (`addons`), the built-ins and the starter left out, once the record
     has answered at all (29 October). */
  assert.match(installed, /words\.sentence\(installedCount\(states\) === null \? 0 : addons\.length,/u);
});
