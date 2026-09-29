/**
 * `{{icon:<name>}}` and the two glyph slots, drawn by both renderers from one answer.
 *
 * WHAT IS HELD HERE: a name the set holds is a glyph and anything else is the author's text; the
 * host's `icon` is the only art there is, so without it nothing but a named, empty span is drawn;
 * no name off an object's prototype, and no hostile name, ever reaches the host; the word after a
 * glyph is held to it; and the Svelte drawers and `toHTML` draw one tree, with the host and without.
 *
 * THE SVELTE SIDE IS COMPILED FOR THE SERVER here, as `./parity.test.ts` does it and for its reason:
 * a `.svelte` file cannot be loaded by `node --test`, and it can be compiled and rendered to a string.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { glyphName, glyphPath, inline, magnitudeOfCell, text } from './inline.ts';
import { toHTML } from './html.ts';
import { parse, type Block as BlockSegment } from './parse.ts';
import { ALIASES } from './glyphs/aliases.ts';
import { CORE } from './glyphs/core.ts';
import { GLYPH_NAMES } from './glyphs/names.ts';

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

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts?: Record<string, unknown> }>;
};

/* Spelled by code point, so the file holds no character a reader cannot see. */
const NBSP = String.fromCharCode(0x00a0);
const WJ = String.fromCharCode(0x2060);

/** A host that has art for every name it is asked about, so whatever reaches it is drawn. */
const DRAWING = 'M4 12h16M12 4v16';
const everything = { icon: (_name: string): string | null => DRAWING };
/** A host with no art for anything, which is a host that passes `icon` and still draws nothing. */
const nothing = { icon: (_name: string): string | null => null };

const onPage = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'" };
const decode = (s: string): string => s.replace(/&(amp|lt|gt|quot|#39|#x27);/gu, (_, e: string) => ENTITY[e] ?? '');

/** The markup as a browser would build it, as `./parity.test.ts` reads it. */
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

test('A NAME THE SET HOLDS IS A GLYPH, and the word after it is held to it', () => {
  assert.deepEqual(inline('{{icon:rocket}} shipped'), [
    { type: 'icon', name: 'rocket' },
    { type: 'text', text: `${NBSP}shipped` },
  ]);
  assert.deepEqual(inline('{{icon:rocket}}shipped'), [
    { type: 'icon', name: 'rocket' },
    { type: 'text', text: `${WJ}shipped` },
  ]);
  assert.deepEqual(inline('shipped {{icon:rocket}}'), [
    { type: 'text', text: 'shipped ' },
    { type: 'icon', name: 'rocket' },
  ]);
  assert.deepEqual(inline('{{ icon: rocket }}'), [{ type: 'icon', name: 'rocket' }]);
  assert.deepEqual(inline('`{{icon:rocket}}`'), [{ type: 'code', text: '{{icon:rocket}}' }], 'a code span is text');
});

test('the name as written wins, and only a name the set does not hold is read as an alias', () => {
  assert.equal(glyphName('home'), 'home', 'the app draws its own home and the core its house');
  assert.equal(glyphName('house'), 'house');
  assert.equal(glyphName('invoice'), 'receipt-text');
  assert.deepEqual(inline('{{icon:invoice}}'), [{ type: 'icon', name: 'receipt-text' }]);
  for (const [alias, target] of Object.entries(ALIASES)) assert.ok(GLYPH_NAMES.has(target), `${alias} stands for ${target}, which is no glyph`);
  for (const name of Object.keys(CORE)) assert.ok(GLYPH_NAMES.has(name), `${name} is in the core and not a name`);
});

const HOSTILE = [
  'constructor',
  'toString',
  '__proto__',
  'hasOwnProperty',
  'valueOf',
  '',
  'Rocket',
  'rocket-2',
  '"><script>x</script>',
  'javascript:alert(1)',
  '../rocket',
  'rocket rocket',
];

test('ANY OTHER NAME IS THE AUTHOR\'S TEXT, and nothing drawn for it, even by a host with art for everything', () => {
  for (const name of HOSTILE) {
    const nodes = inline(`{{icon:${name}}}`);
    assert.equal(nodes.length, 1, name);
    assert.equal(nodes[0]?.type, 'unresolved', `${name} was taken for a glyph`);
    assert.equal(glyphPath(name, everything), null, `${name} reached the host`);
    const html = toHTML(parse(`{{icon:${name}}} shipped`), everything);
    assert.doesNotMatch(html, /<svg|glyph-inline/u, `${name} drew a glyph`);
  }
  assert.equal(GLYPH_NAMES.has('constructor'), false);
});

test('a glyph adds no words and no number to what a cell says', () => {
  assert.equal(text(inline('{{icon:rocket}} shipped')), `${NBSP}shipped`);
  assert.equal(magnitudeOfCell('{{icon:trash-2}} 5'), 5, 'the glyph moved the figure beside it');
});

const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const DRAWN = `<svg class="glyph-inline" role="img" aria-label="rocket" ${SVG_ATTRS}><path d="${DRAWING}"></path></svg>${NBSP}shipped`;
const UNDRAWN = `<span class="glyph-inline" data-glyph="rocket" role="img" aria-label="rocket"></span>${NBSP}shipped`;

test('A ROCKET IN A NOTE, A HEADING, A CARD AND A CELL, drawn where the host has art and named where it has none', () => {
  const where = [
    'a note: ```note | Launch\n{{icon:rocket}} shipped\n```',
    'a heading: ```note | {{icon:rocket}} shipped\nThe site is live.\n```',
    'a cell: ```todo\n[ ] {{icon:rocket}} shipped | due Friday\n```',
  ];
  for (const shape of where) {
    const src = shape.slice(shape.indexOf('```'));
    assert.ok(toHTML(parse(src), everything).includes(DRAWN), `${shape} drew no glyph`);
    assert.ok(toHTML(parse(src)).includes(UNDRAWN), `${shape} without a host`);
    assert.ok(toHTML(parse(src), nothing).includes(UNDRAWN), `${shape} with a host that has no art`);
  }
  const card = onPage('```cards\ntitle: Doing | fact: Project\n{{icon:rocket}} shipped | Kiln\n```');
  assert.ok(toHTML([card], everything).includes(DRAWN), 'a card drew no glyph');
  assert.ok(toHTML([card]).includes(UNDRAWN), 'a card without a host');
});

test('A SECTION AND A CHIP DRAW THEIR NAMED GLYPH IN THE SLOT, and the slot is as empty as ever otherwise', () => {
  const art = `<svg ${SVG_ATTRS}><path d="${DRAWING}"></path></svg>`;
  const section = onPage('```section | Launches\nrocket | 3 | \n```');
  assert.ok(toHTML([section], everything).includes(`<span class="sec-glyph" data-glyph="rocket" aria-hidden="true">${art}</span>`));
  assert.ok(toHTML([section]).includes('<span class="sec-glyph" data-glyph="rocket" aria-hidden="true"></span>'));
  const unknown = onPage('```section | Launches\nconstructor | 3 | \n```');
  assert.ok(toHTML([unknown], everything).includes('<span class="sec-glyph" data-glyph="constructor" aria-hidden="true"></span>'));

  const chips = parse('```chips\nrocket | 6 | shipped\n● | 2 | waiting\n```');
  const html = toHTML(chips, everything);
  assert.ok(html.includes(`<span class="pill-glyph" data-glyph="rocket" aria-hidden="true">${art}</span>`));
  assert.ok(html.includes('<span class="pill-glyph" data-glyph="●" aria-hidden="true"></span>'), 'a dot is not a glyph name');
  assert.ok(toHTML(chips).includes('<span class="pill-glyph" data-glyph="rocket" aria-hidden="true"></span>'));
});

const SHAPES: Record<string, BlockSegment> = {
  'a note with a glyph in its heading and its body': onPage('```note | {{icon:flag}} Heads up\n{{icon:rocket}} shipped, {{icon:rocket}}twice and {{icon:constructor}} not\n```'),
  'a card with a glyph in its title': onPage('```cards\ntitle: Doing | fact: Project\n{{icon:rocket}} shipped | Kiln\n```'),
  'a todo with a glyph in a cell': onPage('```todo\n[ ] {{icon:rocket}} shipped | due Friday\n```'),
  'a section with a glyph': onPage('```section | {{icon:flag}} Launches\nrocket | 3 | \n```'),
  'a section whose glyph is no glyph': onPage('```section | Launches\nconstructor | 3 | \n```'),
  'a run of chips, one named and one a dot': onPage('```chips\nrocket | 6 | shipped | good\n● | 2 | waiting\n```'),
};

for (const [name, block] of Object.entries(SHAPES)) {
  for (const [host, opts] of [['with the host\'s art', everything], ['with no art', nothing], ['with no host', {}]] as const) {
    test(`the two renderers draw one tree: ${name}, ${host}`, () => {
      const svelte = tree(render(Block, { props: { block, opts } }).body);
      const html = tree(toHTML([block], opts));
      assert.equal(svelte, html);
    });
  }
}
