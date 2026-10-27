/**
 * A run's helpers on its card: `helpersSaid` and the line both renderers draw under the card's sentence,
 * compared as trees the way `parity.test.ts` compares them, with the Svelte drawer compiled and rendered on the server.
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
import { helpersOf, helpersSaid } from './cards.ts';

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
  default: Component<{ block: BlockSegment; opts: Record<string, unknown> }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** The markup as a browser would build it: no comments, no whitespace between tags, attributes in one order. */
const tree = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)].map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!)).sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

const both = (block: BlockSegment, opts: Record<string, unknown>): [string, string] => [tree(render(Block, { props: { block, opts } }).body), tree(toHTML([block], opts))];

/** Two runs working, as the Agents page's Working cards declare them: the agent, what it said, and when. */
const WORKING = '```cards\ntitle: Agent | reply: Doing | when: Seen\nClaude | Rebuilding the specimen page | 3m ago\nCodex | Proofing the italics | 9m ago\n```';
const RUNS = [
  { run: 'S7', agent: 'claude', live: 'working' as const },
  { run: 'S8', agent: 'codex', live: 'working' as const },
];

/** The cards as the trees draw them, one string a card. */
const cardsOf = (html: string): string[] => [...html.matchAll(/<li class="cards-item"[^>]*>[\s\S]*?<\/li>/gu)].map((m) => m[0]);

test('helpersSaid says one helper and many, and nothing for nought, absent or not a count', () => {
  assert.equal(helpersSaid(1), '1 helper');
  assert.equal(helpersSaid(9), '9 helpers');
  assert.equal(helpersSaid(['a', 'b', 'c']), '3 helpers');
  assert.equal(helpersSaid([{}]), '1 helper');
  assert.equal(helpersSaid(0), null);
  assert.equal(helpersSaid([]), null);
  assert.equal(helpersSaid(undefined), null);
  assert.equal(helpersSaid(null), null);
  assert.equal(helpersSaid(Number.NaN), null);
  assert.equal(helpersSaid(-2), null);
  assert.equal(helpersOf([3, 0], 0), '3 helpers');
  assert.equal(helpersOf([3, 0], 1), null);
  assert.equal(helpersOf(undefined, 0), null);
});

test('A RUN WITH HELPERS SAYS HOW MANY UNDER ITS SENTENCE in both renderers, and a run with none says nothing', () => {
  const [svelte, html] = both(page(WORKING), { runs: RUNS, helpers: [3, 0] });
  assert.equal(svelte, html);
  const [first, second] = cardsOf(svelte);
  assert.ok(first && second, 'two cards were not drawn');
  assert.match(first, /<p class="cards-reply">Rebuilding the specimen page<\/p><p class="cards-reply" data-helpers>3 helpers<\/p>/u);
  assert.doesNotMatch(second, /helper/u);
});

test('THE HELPERS MAY COME AS THE HELPERS THEMSELVES, counted by their number, the same in both', () => {
  const [svelte, html] = both(page(WORKING), { runs: RUNS, helpers: [[], [{ run: 'S9' }]] });
  assert.equal(svelte, html);
  const [first, second] = cardsOf(svelte);
  assert.doesNotMatch(first ?? '', /helper/u);
  assert.match(second ?? '', /data-helpers>1 helper</u);
});

test('A BLOCK WITH NO HELPERS DRAWS AS BEFORE: no line, and the two renderers still one tree', () => {
  const block = page(WORKING);
  const [svelte, html] = both(block, { runs: RUNS });
  assert.equal(svelte, html);
  assert.doesNotMatch(svelte, /data-helpers|helper/u);
  const nought: Record<string, unknown> = { runs: RUNS, helpers: [0, 0] };
  assert.equal(tree(toHTML([block], nought)), html, 'a count of nought drew something');
});
