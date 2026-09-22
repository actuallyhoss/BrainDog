/**
 * The shape of `/pricing`, held to the rule the home page was rebuilt under.
 *
 * WHY A TEST OF MARKUP AND NOT OF PIXELS. `loop/research-site-now.md` change 5 found this page
 * grounding its four bands `page, sunk, page, sunk`, where `--sunk` against `--bg` is 1.07:1, and
 * opening three of them with the same three-span mark, one of them an eyebrow over the `h1`. Both
 * faults are in the source, so the check reads the source and needs no build and no browser.
 *
 * IT SITS BESIDE THE PAGE AND NOT IN `test/` because `test/` belonged to another agent when it was
 * written, and `pnpm test` globs `test/*.test.ts`, so it has to be run by name:
 * `node --test --experimental-strip-types "apps/site/src/routes/pricing/bands.test.ts"`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

/** The markup, without its comments and without the stylesheet, cut at every band. */
const bands = source
  .replace(/<!--[\s\S]*?-->/g, '')
  .split('<style>')[0]!
  .split('<section')
  .slice(1);

const ground = (band: string): string => /data-ground="([a-z]+)"/.exec(band)?.[1] ?? 'none';
const opener = (band: string): string => /class="(band-mark[^"]*)"/.exec(band)?.[1] ?? 'none';

test('/pricing turns its ground over once and never steps down to sunk', () => {
  const grounds = bands.map(ground);
  assert.equal(grounds.filter((g) => g === 'flip').length, 1, `grounds are ${grounds.join(', ')}`);
  assert.ok(!grounds.includes('sunk'), `grounds are ${grounds.join(', ')}`);
});

/* EVERY SEAM INVERTS, which three bands and one flip can say and four could not: the hairline alone
   is the seam the home page's own comment calls the one the eye does not read. */
test('/pricing puts no two bands on the same ground side by side', () => {
  const grounds = bands.map(ground);
  grounds.slice(1).forEach((g, i) => assert.notEqual(g, grounds[i], `grounds are ${grounds.join(', ')}`));
});

test('/pricing opens no two bands the same way, and the h1 carries no eyebrow', () => {
  const openers = bands.map(opener);
  assert.equal(new Set(openers).size, openers.length, `openers are ${openers.join(' | ')}`);
  assert.equal(openers[0], 'none', 'the first band opens with a mark over the h1');
});
