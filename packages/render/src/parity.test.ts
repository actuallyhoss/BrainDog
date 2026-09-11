/**
 * The two renderers, compared as trees: the Svelte drawers compiled and rendered on the server,
 * against `toHTML`, for every shape a `cards` and a `section` block can take.
 *
 * "EQUAL BY CONSTRUCTION" WAS A PROMISE AND NOTHING KEPT IT. The rest of this package asserts the
 * Svelte side by reading its source as text, because a `.svelte` file cannot be mounted under
 * `node --test`. It can be compiled, though: Node's module hooks hand each `.svelte` file to the
 * compiler on the way in, and `svelte/server` renders the result to a string. The hydration markers
 * and the whitespace between tags are the only differences a browser does not also see, so those
 * are what `tree` takes away before the two are held equal.
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

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    /* A runes module (`cards.svelte.ts`, which `Table` reads) is TypeScript the compiler does not
       strip, so the types come off first. */
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment }>;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** The markup as a browser would build it: no comments, no whitespace between tags, attributes in one order. */
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

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

const SHAPES: Record<string, string> = {
  'agents working now':
    '```cards\nmark: Project | title: Doing | who: Agent | fact: Next | when: Seen\nKiln | Fix the invoice export | Claude | Ship the fix | 3m ago | warn\nSite | Rewrite pricing | Codex |  | 2h ago\n```',
  'people, named by their faces': '```cards\nwho: Name | fact: Role | fact: Met at | when: Seen\nAmara Lee | Designer | Kiln kickoff | 2d ago\nthe assistant | Agent |  | \n```',
  'figures, trends, rings and a link':
    '```cards\ntitle | figure: Owed to you | trend: Weekly | ring: Done\n[Kiln](/r/things/1) | GBP 4,800.00 | 18 20 - 24 | 3/5\nSite |  | 7 | 60%\nMarsh | USD 12.00 | 1 2 3 | nearly\n```',
  'no cards at all': '```cards\ntitle | fact: Role\n```',
  'a section with a count': '```section | Working now\n | 3 | \n```',
  'a section that counts nothing': '```section | Working now\n | 0 | \n```',
  'a folded section with a glyph': '```section | Parked and retired\nthing | 4 | fold\n```',
  'a section that is only a heading': '```section | From everywhere\n```',
};

for (const [name, src] of Object.entries(SHAPES)) {
  test(`the two renderers draw one tree: ${name}`, () => {
    const block = page(src);
    const svelte = tree(render(Block, { props: { block } }).body);
    const html = tree(toHTML([block]));
    assert.equal(svelte, html);
  });
}

test('and the comparison is not vacuous: a tree that differs is told apart', () => {
  const a = tree(toHTML([page(SHAPES['a section with a count']!)]));
  const b = tree(toHTML([page(SHAPES['a section that counts nothing']!)]));
  assert.notEqual(a, b);
});
