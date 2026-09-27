/**
 * The visible fence, drawn by both renderers as one tree: the reason first, then what was written under
 * `degraded-source`, which the host wraps inside its column rather than scrolling (05 §3).
 *
 * `parity.test.ts` compares blocks through `Block.svelte`; a degraded segment is drawn by `Degraded.svelte`
 * instead, so it is compiled here the same way: Node's module hooks hand the file to the Svelte compiler
 * and `svelte/server` renders it to a string.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Degraded } from './parse.ts';
import { toHTML } from './html.ts';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Fence } = (await import(new URL('../svelte/Degraded.svelte', import.meta.url).href)) as {
  default: Component<{ segment: Degraded; onfix?: () => void }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };

/**
 * The markup as a browser would build it: no comments, no whitespace between tags, and every entity
 * read back, because the compiler escapes only what it must (`<`, `&`) and the mirror escapes quotes
 * and `>` too, which a browser draws the same.
 */
const tree = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '')
    .trim();

const fence = (src: string): Degraded => {
  const [seg] = parse(src);
  assert.equal(seg?.type, 'degraded', `the fixture did not degrade: ${src}`);
  return seg as Degraded;
};

const SHAPES = {
  'a kind nobody wrote': '```widget | Revenue\nJan | 4\n```',
  'a row too wide, with markup in it': '```stat\nOwed | <b>£4,800</b> | due | 18 20 | x | y\n```',
  'a kind in capitals': '```Stat | Head\na | 1 | n\n```',
};

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one fence: ${name}`, () => {
    const segment = fence(src);
    assert.equal(tree(render(Fence, { props: { segment } }).body), tree(toHTML([segment])));
  });
}

test('THE REASON COMES FIRST AND THE SOURCE IS ITS OWN WRAPPING BLOCK, not a scrolling code block', () => {
  const segment = fence(SHAPES['a kind nobody wrote']);
  const html = tree(toHTML([segment]));
  assert.ok(html.indexOf('class="degraded-fix"') < html.indexOf('class="degraded-source"'), 'the source is drawn before its reason');
  assert.doesNotMatch(html, /class="media"/u, 'the fence is drawn as a code block, which scrolls sideways at 390');
  assert.doesNotMatch(html, /tabindex/u, 'a wrapping fence has nothing to scroll and needs no tab stop');
  // What was written is shown exactly, escaped, and never drawn as markup.
  const markup = toHTML([fence(SHAPES['a row too wide, with markup in it'])]);
  assert.match(markup, /&lt;b&gt;£4,800&lt;\/b&gt;/u);
  assert.doesNotMatch(render(Fence, { props: { segment: fence(SHAPES['a row too wide, with markup in it']) } }).body, /<b>/u);
});

test('A HOST THAT CAN FIX THE BLOCK GETS A BUTTON THAT SAYS WHAT IT DOES, and nothing else in the tree moves', () => {
  const segment = fence(SHAPES['a kind nobody wrote']);
  const withFix = tree(render(Fence, { props: { segment, onfix: () => {} } }).body);
  assert.match(withFix, /<button[^>]*>Fix this block<\/button>/u);
  assert.equal(withFix.replace(/ ?<button[^>]*>Fix this block<\/button>/u, ''), tree(toHTML([segment])));
});
