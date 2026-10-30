/**
 * Today's read waits on a small module (`page-drawn.ts`), never on what a proposal would do (`proposed.ts`), and its
 * first open learns the lists beside the look in the copy when every list came beside `boot` (finish W3).
 *
 * TEXT TESTS over the imports, since a component does not load under `node --test`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/** A file's code without its comments, so a comment quoting an import cannot fail or pass a check. */
const bare = (url: URL): string =>
  readFileSync(url, 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/^\s*\/\/.*$/gmu, '');

const drawn = bare(new URL('./page-drawn.ts', import.meta.url));
const home = bare(new URL('../home/Home.svelte', import.meta.url));
const proposed = bare(new URL('../../routes/decide/[id]/proposed.ts', import.meta.url));

test('the page body is drawn without the code that reads a proposal', () => {
  assert.doesNotMatch(drawn, /from '[^']*routes\/decide/u, 'page-drawn reaches into the decide screen');
  assert.doesNotMatch(drawn, /from '@braindog\/(kernel|seed)/u, 'page-drawn loads the kernel or the seed');
  assert.match(drawn, /export async function drawnOf\(/u);
});

test('Today asks through page-drawn, and proposed.ts hands the same drawnOf on', () => {
  assert.doesNotMatch(home, /import\('[^']*decide\/\[id\]\/proposed\.ts'\)/u, 'Today waits on the proposal code again');
  assert.match(home, /import\('\$lib\/record\/page-drawn\.ts'\)/u);
  assert.match(proposed, /export \{[^}]*\bdrawnOf\b[^}]*\} from '[^']*page-drawn\.ts';/u);
});

test("Today's first open learns the lists without waiting on the copy when every list came beside boot", () => {
  assert.match(home, /const every = everyAsked\(apiBase\(\)\) && !firstDrawn\(\);/u);
  assert.match(home, /!\(looked \|\| every\)/u);
});
