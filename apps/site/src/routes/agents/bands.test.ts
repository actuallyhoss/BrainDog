/**
 * The shape of `/agents`, held to the rule the home page was rebuilt under.
 *
 * WHY A TEST OF MARKUP AND NOT OF PIXELS. `loop/research-site-now.md` change 5 found this page
 * opening all four bands with the same three-span mark and grounding them `page, sunk, page, sunk`,
 * where `--sunk` against `--bg` is 1.07:1: four bands that looked like one. Both faults are in the
 * source, not in the rendering, so the check reads the source and needs no build and no browser.
 *
 * IT SITS BESIDE THE PAGE AND NOT IN `test/` because `test/` belonged to another agent when it was
 * written, and `pnpm test` globs `test/*.test.ts`, so like `src/lib/claims.test.ts` it has to be run
 * by name: `node --test --experimental-strip-types "apps/site/src/routes/agents/bands.test.ts"`.
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

test('/agents turns its ground over once and never steps down to sunk', () => {
  const grounds = bands.map(ground);
  assert.equal(grounds.filter((g) => g === 'flip').length, 1, `grounds are ${grounds.join(', ')}`);
  assert.ok(!grounds.includes('sunk'), `grounds are ${grounds.join(', ')}`);
});

test('/agents opens no two bands the same way, and the h1 carries no eyebrow', () => {
  const openers = bands.map(opener);
  assert.equal(new Set(openers).size, openers.length, `openers are ${openers.join(' | ')}`);
  assert.equal(openers[0], 'none', 'the first band opens with a mark over the h1');
});

test('/agents draws the MCP surface as one figure on the flipped band', () => {
  const mcp = bands.find((band) => band.includes('aria-labelledby="mcp-title"'));
  assert.ok(mcp, 'there is no MCP band');
  assert.equal(ground(mcp), 'flip');
  /* ONE FIGURE HOLDS THE READS, THE WRITES AND THE ADDRESSES, which is the difference between a
     diagram and three lists that happen to sit near each other. */
  const figure = /<figure[\s\S]*<\/figure>/.exec(mcp)?.[0] ?? '';
  /* THE LOOP, NOT THE KEY. `a.mcp.reads` is also a prefix of `a.mcp.readsTitle`, so a bare
     `includes` held with the lists moved out and only their headings left inside: the checker
     renamed the resources loop and all three tests stayed green. */
  for (const key of ['a.mcp.reads', 'a.mcp.writes', 'a.mcp.resources']) {
    assert.ok(new RegExp(`\\{#each ${key.replaceAll('.', '\\.')} as\\b`).test(figure), `${key} is drawn outside the figure`);
  }
});
