/**
 * The live Work page draws the page as it was last drawn in this tab (`kept.ts`), asks nothing at the same version, and
 * keeps only an answer that landed live, so a refusal or an offline page is never drawn from the store.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const work = readFileSync(new URL('./Work.svelte', import.meta.url), 'utf8');

test('WORK DRAWS ITS KEPT PAGE AT ONCE, asks nothing at the same version, and keeps only a live answer', () => {
  assert.match(work, /const was = keptAnswer<Opened>\(WORK_PAGE, key, version\);/u);
  assert.match(work, /if \(was\.fresh\) return closed\(true, at\);\s*blank = false;/u, 'a moved version is asked over the kept page, not blanked');
  assert.match(work, /if \(out\.from === 'live'\) keep\(WORK_PAGE, key, version, \{ ok: true, value: out \}\);/u);
  /* THE KEY IS THE RECORD'S ADDRESS AND THE FILTER, so another record or another filter is never drawn. */
  assert.match(work, /const key = workKey\(apiBase\(\), asked\);/u);
});
