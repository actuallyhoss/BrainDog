/**
 * `most`: a long block of cards draws its first six, the app with a "Show all N" that opens the rest in place
 * and the export with a line that says how many it left out, and the two are one tree but for those.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';
import { MOST_CARDS, isMost, moreSaid, mostOf, showAllSaid, type MostKeys } from './most.ts';

/* Each `.svelte` file through the compiler on the way in, as `parity.test.ts` does. */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment }>;
};

/** A block of `n` cards with invented names, each with a role. */
const grid = (n: number): BlockSegment => {
  const [seg] = parse(`\`\`\`cards\ntitle: Name | fact: Role\n${Array.from({ length: n }, (_, i) => `Person ${i + 1} | Role ${i + 1}`).join('\n')}\n\`\`\``, { page: true });
  assert.equal(seg?.type, 'block');
  return seg as BlockSegment;
};

const app = (block: BlockSegment): string => render(Block, { props: { block } }).body;
const titles = (html: string): string[] => [...html.matchAll(/<h3 class="cards-title"[^>]*>(?:<!--[^>]*-->)*([^<]*)/gu)].map((m) => m[1]!);

/** The markup as a browser builds it, as `parity.test.ts` reads it: no comments, no space between tags, attributes sorted. */
const tree = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)].map(([, name, value]) => (value ? `${name}="${value}"` : name!)).sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .trim();

test('fourteen cards show six and say the eight more; five show all five', () => {
  assert.equal(MOST_CARDS, 6);
  assert.deepEqual(mostOf({ kind: 'cards' }, 14), { shown: 6, more: 8 });
  assert.deepEqual(mostOf({ kind: 'cards' }, 5), { shown: 5, more: 0 });
  assert.deepEqual(mostOf({ kind: 'cards' }, 6), { shown: 6, more: 0 }, 'exactly six is not cut');
  assert.deepEqual(mostOf({ kind: 'cards' }, 0), { shown: 0, more: 0 });
  assert.equal(showAllSaid(14), 'Show all 14');
  assert.equal(moreSaid(8), 'and 8 more');
});

test("a block's own most is its cut, from 1 to 24, and one outside that leaves the default", () => {
  assert.deepEqual(mostOf({ kind: 'cards', most: 10 }, 14), { shown: 10, more: 4 });
  assert.deepEqual(mostOf({ kind: 'cards', most: 10 }, 9), { shown: 9, more: 0 });
  assert.deepEqual(mostOf({ kind: 'cards', most: 1 }, 3), { shown: 1, more: 2 });
  for (const bad of [0, 25, 2.5, -3]) assert.deepEqual(mostOf({ kind: 'cards', most: bad }, 14), { shown: 6, more: 8 }, `most: ${bad}`);
  assert.ok(isMost(24) && isMost(1) && !isMost(25) && !isMost('6'));
});

test('grouped cards and a block in a panel are never cut: they fold their own way, or are opened to read whole', () => {
  assert.deepEqual(mostOf({ kind: 'cards', group: 'organisation' }, 14), { shown: 14, more: 0 });
  assert.deepEqual(mostOf({ kind: 'cards', group: true, most: 3 }, 14), { shown: 14, more: 0 });
  assert.deepEqual(mostOf({ kind: 'cards', panel: true }, 14), { shown: 14, more: 0 });
  assert.deepEqual(mostOf({ kind: 'cards', group: false }, 14), { shown: 6, more: 8 }, 'a group taken off is no group');
});

test('a kind with no default is cut only where it says most, and a kind that takes no most never is', () => {
  assert.deepEqual(mostOf({ kind: 'series' }, 30), { shown: 30, more: 0 });
  assert.deepEqual(mostOf({ kind: 'series', most: 4 }, 30), { shown: 4, more: 26 });
  assert.deepEqual(mostOf({ kind: 'table', most: 4 }, 30), { shown: 30, more: 0 });
});

test('the app draws the first six of fourteen and a "Show all 14" button; the export the same six and "and 8 more"', () => {
  const block = grid(14);
  const drawn = app(block);
  const exported = toHTML([block]);
  const six = Array.from({ length: 6 }, (_, i) => `Person ${i + 1}`);
  assert.deepEqual(titles(drawn), six);
  assert.deepEqual(titles(exported), six);
  assert.match(drawn, /<button[^>]*type="button"[^>]*>Show all 14<\/button>/u);
  assert.match(exported, /<p class="cards-more">and 8 more<\/p>/u);
  assert.doesNotMatch(exported, /<button/u, 'an export has nothing to press');
  assert.doesNotMatch(drawn, /cards-more/u, 'the app says it with the button alone');
});

test('the parity case: a block of fourteen cards is one tree in both drawers but for the button and the line', () => {
  const block = grid(14);
  const svelte = tree(app(block)).replace(/<button [^>]*class="cards-all[^"]*"[^>]*>Show all 14<\/button>/u, '');
  const html = tree(toHTML([block])).replace('<p class="cards-more">and 8 more</p>', '');
  assert.equal(svelte, html);
  assert.notEqual(tree(app(block)), svelte, 'and the button was there to take off');
});

test('five cards draw all five, with no button and no line, in both drawers', () => {
  const block = grid(5);
  for (const drawn of [app(block), toHTML([block])]) {
    assert.equal(titles(drawn).length, 5);
    assert.doesNotMatch(drawn, /Show all|cards-more|cards-all/u);
  }
});

test("a block's own most reaches both drawers, and a grouped block is drawn whole in both", () => {
  const ten = { ...grid(14), most: 10 } as BlockSegment & MostKeys;
  assert.equal(titles(app(ten)).length, 10);
  assert.equal(titles(toHTML([ten])).length, 10);
  assert.match(toHTML([ten]), /and 4 more/u);
  const grouped = { ...grid(14), group: 'organisation' } as BlockSegment & MostKeys;
  for (const drawn of [app(grouped), toHTML([grouped])]) {
    assert.equal(titles(drawn).length, 14);
    assert.doesNotMatch(drawn, /Show all|cards-more/u);
  }
});
