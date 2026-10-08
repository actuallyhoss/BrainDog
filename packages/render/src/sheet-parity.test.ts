/**
 * The rule sheet's Values and Blocks write-ups (`packs/rule-sheet`), drawn by both renderers and held to one tree.
 *
 * `parity.test.ts` holds every SHAPE a block can take, one fixture at a time, written by whoever wrote the renderer. The
 * rule sheet is the other direction: every path form, typed form, evidence tag and block rule the product has, written
 * as an add-on a person installs, and drawn here exactly as the page draws it. A difference between the two renderers
 * on the sheet is a difference on a page somebody reads.
 *
 * READ FROM THE ADD-ON, NEVER COPIED. The write-ups are the bodies of the blocks on the pages titled Values and Blocks
 * (a note's body is a whole document, blocks and all: `packages/kernel/src/pages.ts`). Until the add-on holds both
 * pages this skips, saying which is missing, rather than passing over nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Segment } from './parse.ts';
import { toHTML } from './html.ts';

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

const drawer = async (name: string): Promise<Component<Record<string, unknown>>> =>
  ((await import(new URL(`../svelte/${name}.svelte`, import.meta.url).href)) as { default: Component<Record<string, unknown>> }).default;
const Block = await drawer('Block');
const Markdown = await drawer('Markdown');
const Degraded = await drawer('Degraded');

const PACK = fileURLToPath(new URL('../../../packs/rule-sheet/', import.meta.url));

type Declared = { page?: unknown; title?: unknown; blocks?: unknown };

/** The write-up of the page titled `title`: its blocks' bodies in order, one blank line apart, or `null`. */
function writeUp(title: string): string | null {
  if (!existsSync(PACK)) return null;
  for (const file of readdirSync(PACK).filter((f) => f.endsWith('.pack.json'))) {
    const pack = JSON.parse(readFileSync(PACK + file, 'utf8')) as { declarations?: unknown };
    const decls = Array.isArray(pack.declarations) ? (pack.declarations as Declared[]) : [];
    const page = decls.find((d) => d && typeof d === 'object' && 'page' in d && String(d.title ?? '').toLowerCase() === title.toLowerCase());
    if (!page || !Array.isArray(page.blocks)) continue;
    const bodies = (page.blocks as { body?: unknown }[]).map((b) => b?.body).filter((b): b is string => typeof b === 'string' && b.trim() !== '');
    if (bodies.length) return bodies.join('\n\n');
  }
  return null;
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** A late part's pattern id as its place in the markup, since each side mints its own (`parity.test.ts`). */
const lateIds = (html: string): string =>
  [...html.matchAll(/<pattern [^>]*id="([^"]+)"/gu)]
    .map((m) => m[1]!)
    .reduce((h, id, i) => h.replaceAll(`"${id}"`, `"late${i}"`).replaceAll(`#${id})`, `#late${i})`), html);

/** The markup as a browser builds it, as `parity.test.ts` reads it: no comments or whitespace between tags, attributes sorted. */
function tree(html: string): string {
  return lateIds(html)
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/<([a-z][\w-]*)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*>/giu, (_, tag: string, attrs: string) => {
      const pairs = [...attrs.matchAll(/([^\s=>]+)(?:="([^"]*)")?/gu)].map(([, n, v]) => (v ? `${n}="${decode(v)}"` : n!)).sort();
      return `<${tag}${pairs.length ? ` ${pairs.join(' ')}` : ''}>`;
    })
    .replace(/>([^<]+)</gu, (_, t: string) => `>${decode(t)}<`)
    .trim();
}

/** The Svelte side, as `Document.svelte` draws a document: each segment by its own drawer. */
const svelteOf = (segments: Segment[]): string =>
  segments
    .map((s) =>
      s.type === 'block'
        ? render(Block, { props: { block: s } }).body
        : s.type === 'degraded'
          ? render(Degraded, { props: { segment: s } }).body
          : render(Markdown, { props: { segment: s, opts: {} } }).body,
    )
    .join('');

for (const title of ['Values', 'Blocks']) {
  const src = writeUp(title);
  const skip = src === null ? `packs/rule-sheet has no page titled ${title} with a written body yet (PGS-B01 job a)` : false;
  test(`the rule sheet's ${title} page draws one tree in both renderers, segment by segment`, { skip }, () => {
    const segments = parse(src!, { page: true });
    assert.ok(segments.length > 0, `${title} parsed to nothing`);
    for (const [i, s] of segments.entries()) {
      const what = s.type === 'block' ? `the ${s.kind} block` : s.type === 'degraded' ? 'the fence' : 'the prose';
      assert.equal(tree(svelteOf([s])), tree(toHTML([s])), `${title}, segment ${i + 1}, ${what}, is drawn two ways`);
    }
  });
}

test('the comparison is not vacuous: two write-ups that differ by one word are told apart', () => {
  const a = parse('```stat\nCash | 1\n```', { page: true });
  const b = parse('```stat\nCash | 2\n```', { page: true });
  assert.notEqual(tree(svelteOf(a)), tree(toHTML(b)));
  assert.equal(tree(svelteOf(a)), tree(toHTML(a)));
});
