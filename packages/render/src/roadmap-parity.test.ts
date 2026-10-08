/**
 * `roadmap` drawn by both renderers, compared as trees, the way `parity.test.ts` holds the other drawn kinds.
 *
 * A FILE OF ITS OWN AND NOT A ROW IN `parity.test.ts`'s `SHAPES`, because a roadmap draws today's line and that
 * table renders every shape with no clock: the two sides would each read `Date.now()` and agree only by the luck of
 * the same millisecond. Here both are handed one `now`, the way a host hands it.
 *
 * WHAT THIS CAUGHT: the kind was registered on `list`, and `List.svelte` has no arm for it, so the app drew a
 * roadmap as the generic list, each row a title, its due day as the detail and its effort as the state, while
 * `toHTML` drew the chart. Every shape below failed before `p/Roadmap.svelte` existed (measured).
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

/* The same hooks `parity.test.ts` registers: each test file is its own process under `node --test`. */
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
  default: Component<{ block: BlockSegment; opts: { now: number } }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** `parity.test.ts`'s `tree`: no comments, no whitespace between tags, attributes in one order, entities read. */
function tree(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)]
        .map(([, name, value]) => (value ? `${name}="${decode(value)}"` : name!))
        .sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

const NOW = Date.UTC(2026, 8, 22, 12); // 2026-09-22

const SHAPES: Record<string, string> = {
  'windows, a date, a tone, and a row that does not read':
    '```roadmap | Autumn\nBuild the kiln page | 2026-09-10 | 10\nRegate window | 2026-10-05 | 3 | warn\nLaunch | 2026-09-30\nSomeday | soon\n```',
  /* Three windows over one week put three tracks in the box, which is the vertical this drawer works out itself. */
  'three things in hand at once, and a date given its tone with no effort':
    '```roadmap\nA | 2026-09-20 | 5\nB | 2026-09-21 | 4 | good\nC | 2026-09-22 | 3\nShip | 2026-09-24 | bad\n```',
  'a fraction of a day, a link in a title, and today outside the span':
    '```roadmap | Next year\n[Kiln](/r/tasks/4) | 2027-07-20 | 0.5 d\nGlaze | 2027-08-02 | 1.5\n```',
  'nothing that can be drawn': '```roadmap | Later\nSomeday | soon\nWhenever | 2026-13-40 | 2\n```',
  /* KILN'S PLAN: short tasks end to end on one track, whose names do not fit on it, so each takes a lane of its own. */
  'short windows end to end, a lane each with the name beside it':
    '```roadmap | The plan\nTurn auto-renew back on for kilnfonts.example | 30 Aug 2026 | 1\nVariable axis QA on the new cut | 6 Sep 2026 | 3\nDecide the licensing tier split | 9 Sep 2026 | 1\nIllustrations for the specimen page | 13 Sep 2026 | 3 | warn\nRotate the Fenwick deploy key | 15 Sep 2026 | 1\nWrite the specimen page | 21 Sep 2026 | 2\n```',
};

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one roadmap: ${name}`, () => {
    const [seg] = parse(src);
    assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
    const block = seg as BlockSegment;
    const svelte = tree(render(Block, { props: { block, opts: { now: NOW } } }).body);
    const html = tree(toHTML([block], { now: NOW }));
    assert.equal(svelte, html);
  });
}

test('and the comparison is not vacuous: the chart is on both sides, and a different clock is told apart', () => {
  const [seg] = parse(SHAPES['windows, a date, a tone, and a row that does not read']!);
  const block = seg as BlockSegment;
  const svelte = tree(render(Block, { props: { block, opts: { now: NOW } } }).body);
  assert.match(svelte, /class="roadmap-list"/u);
  assert.match(svelte, /class="roadmap-today"/u);
  /* Today a week later moves its line, so a side that ignored the host's clock would be caught by the shapes above. */
  const later = tree(render(Block, { props: { block, opts: { now: NOW + 7 * 86_400_000 } } }).body);
  assert.notEqual(later, svelte);
});

test('TODAY\'S WORD TAKES ITS PLACE ON THE AXIS ON BOTH SIDES, and the Monday beside it gives way', () => {
  /* Kiln on 1 Sep: the 31 August tick sits a day from today's line, and the two names in one place were one smear. */
  const [seg] = parse(SHAPES['short windows end to end, a lane each with the name beside it']!);
  const block = seg as BlockSegment;
  const now = Date.UTC(2026, 8, 1, 12);
  const svelte = tree(render(Block, { props: { block, opts: { now } } }).body);
  assert.equal(svelte, tree(toHTML([block], { now })));
  assert.match(svelte, /<li class="roadmap-today" style="--at:[\d.]+">Today<\/li>/u);
  assert.doesNotMatch(svelte, />31 Aug</u);
});

test('THE KEY AND EACH NAME\'S TITLE ARE ON BOTH SIDES: the colours drawn are named, and a name cut short is whole on hover', () => {
  const src = '```roadmap\nA long name that the left column will cut with an ellipsis | 2026-09-20 | 5\nB | 2026-09-21 | 4 | good\nC | 2026-09-22 | 3 | bad\nD | 2026-09-28 | 2 | warn\n```';
  const block = parse(src)[0] as BlockSegment;
  const svelte = tree(render(Block, { props: { block, opts: { now: NOW } } }).body);
  assert.equal(svelte, tree(toHTML([block], { now: NOW })));
  assert.match(svelte, /<span class="roadmap-item-title" title="A long name that the left column will cut with an ellipsis">A long name/u);
  assert.match(
    svelte,
    /<ul aria-label="What the colours mean" class="roadmap-legend"><li class="roadmap-key">Under way<\/li><li class="roadmap-key" data-key="warn">Due soon<\/li><li class="roadmap-key" data-key="bad">Late<\/li><li class="roadmap-key" data-key="good">Done<\/li><\/ul>/u,
  );
  /* One colour has no key, on either side. */
  const plain = parse(SHAPES['a fraction of a day, a link in a title, and today outside the span']!)[0] as BlockSegment;
  const one = tree(render(Block, { props: { block: plain, opts: { now: NOW } } }).body);
  assert.equal(one, tree(toHTML([plain], { now: NOW })));
  assert.doesNotMatch(one, /roadmap-legend/u);
  assert.match(one, /<span class="roadmap-item-title" title="Kiln">/u, 'a link in a name is said as its words');
});
