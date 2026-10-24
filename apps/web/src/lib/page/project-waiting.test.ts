/**
 * A project's page caught while it waits still has its `h1`: the headless head draws none and the hero's own waits on
 * the read, so the waiting shape's name is the heading, and it is not hidden from a screen reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./ProjectWaiting.svelte', import.meta.url), 'utf8');

test('the waiting project names itself with an h1 that is not aria-hidden', () => {
  assert.match(src, /<h1 class="pw-title"/);
  const hero = src.match(/<section class="pw-hero"[^>]*>/)?.[0] ?? '';
  assert.doesNotMatch(hero, /aria-hidden/);
});
