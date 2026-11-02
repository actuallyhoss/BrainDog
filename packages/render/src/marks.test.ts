/**
 * A row's mark is a picture or a letter, never a letter of a picture's name.
 *
 * `markOf` is the one answer the string drawer, `Cards.svelte` and the app's `IdentityMark` all read, so it is held
 * here directly, and then through both drawers, compiled the way `parity.test.ts` compiles them, so a card's mark is
 * proved to come out the same from each.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { markGlyphOf, markOf } from './cards.ts';
import { ALIASES, MARK_WORDS, canonical } from './glyphs/aliases.ts';
import { CONTROLS, CONTROL_GLYPHS, GLYPH_NAMES, isMark } from './glyphs/names.ts';
import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML } from './html.ts';

/* ── markOf ────────────────────────────────────────────────────────────────── */

test('A GLYPH IS THE MARK, by its own name', () => {
  assert.equal(markOf('rocket', 'Kiln'), 'rocket');
  assert.equal(markOf('music', 'Lanternfish'), 'music');
  assert.equal(markGlyphOf(markOf('music', 'Lanternfish')), 'music');
});

test('AN ALIAS IS THE MARK, drawn as the glyph it stands for: cake is the gift', () => {
  assert.equal(canonical('cake'), 'gift');
  assert.equal(markOf('cake', 'Oxbow.gg'), 'gift');
  assert.equal(markOf('shop', 'Quietcart'), 'store');
  assert.equal(markOf('site', 'Harbour site'), 'globe');
  assert.equal(markOf('cube', 'Harbour'), 'box');
});

test("A PICTURE'S NAME WITH A CAPITAL IS STILL THE PICTURE, never its first letter", () => {
  assert.equal(markOf('Cake', 'Oxbow.gg'), 'gift');
  assert.equal(markOf('Music', 'Lanternfish'), 'music');
  assert.equal(markOf('Close', 'Oxbow.gg'), 'O');
  assert.equal(markOf(' Pencil '), null);
});

test('NO GLYPH OR MARK WORD EVER YIELDS ITS OWN FIRST LETTER', () => {
  for (const name of [...GLYPH_NAMES, ...Object.keys(ALIASES)]) {
    for (const written of name.length > 1 ? [name, name[0]!.toUpperCase() + name.slice(1)] : [name]) {
      const mark = markOf(written, 'Zed');
      assert.ok(mark === 'Z' || markGlyphOf(mark) !== null, `${written} gave ${mark}`);
    }
  }
});

test('A CONTROL IS NEVER A MARK: the row wears its own letter instead', () => {
  for (const control of ['close', 'x', 'pencil', 'edit', 'trash', 'more', 'chevronDown', 'slash']) {
    assert.equal(isMark(control), false, `${control} is a control`);
    assert.equal(markOf(control, 'Oxbow.gg'), 'O', `${control} gives way to the title's letter`);
  }
  assert.equal(markOf('close'), null, 'and with no title, to nothing rather than to "C"');
});

test("A WORD THE SET DOES NOT DRAW IS THE TITLE'S FIRST LETTER, never the word's: O for Oxbow.gg, where C was", () => {
  assert.equal(markOf('paw', 'BrainDog'), 'B');
  assert.equal(markOf('koala', 'Fernly'), 'F');
  assert.equal(markOf('sword', 'Driftwood.gg'), 'D');
  assert.equal(markOf('paw'), null);
});

test('A NAME, A LETTER OR AN EMOJI IS ITS OWN MARK, which is what the one-argument call always answered', () => {
  assert.equal(markOf('Kiln'), 'K');
  assert.equal(markOf('Kiln', 'Fix the invoice export'), 'K');
  assert.equal(markOf('k', 'Oxbow.gg'), 'K');
  assert.equal(markOf('🎂', 'Oxbow.gg'), '🎂');
  assert.equal(markGlyphOf('K'), null);
});

test('A BARE SHAPE OR AN EMPTY CELL GIVES WAY TO THE TITLE', () => {
  assert.equal(markOf('●', 'Oxbow.gg'), 'O');
  assert.equal(markOf('', 'the Studio'), 'S');
  assert.equal(markOf('  '), null);
});

test('A WORD OFF AN OBJECT IS NO GLYPH', () => {
  assert.equal(markOf('constructor', 'Kiln'), 'K');
  assert.equal(isMark('constructor'), false);
});

/* ── the lists ─────────────────────────────────────────────────────────────── */

test('EVERY CONTROL IS A NAME THE SET OR THE APP DRAWS, and none is listed twice', () => {
  for (const c of CONTROLS) assert.ok(GLYPH_NAMES.has(c), `${c} draws nothing`);
  assert.equal(CONTROL_GLYPHS.size, CONTROLS.length);
});

test('EVERY MARK WORD LANDS ON A GLYPH THAT MAY BE A MARK, and shadows no glyph', () => {
  for (const [word, glyph] of Object.entries(MARK_WORDS)) {
    assert.ok(!GLYPH_NAMES.has(word), `${word} is already a glyph`);
    assert.equal(ALIASES[word], glyph);
    assert.ok(isMark(word), `${word} lands on ${glyph}, which is a control`);
  }
});

/* ── both drawers ──────────────────────────────────────────────────────────── */

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    /* A runes module (`rows-as-cards.svelte.ts`) is TypeScript the compiler does not strip, as in `parity.test.ts`. */
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

/** Every card's mark slot, as markup with no comments and no space between tags. */
const marks = (html: string): string[] =>
  [...html.replace(/<!--[\s\S]*?-->/gu, '').replace(/>\s+</gu, '><').matchAll(/<span class="cards-mark"[^>]*>.*?<\/span>/gu)].map((m) =>
    m[0].replace(/\s+/gu, ' '),
  );

const CARDS = '```cards\ntitle | mark: Picture\nOxbow.gg | cake\nBrainDog | paw\nLanternfish | music\nKiln | close\nStudio | Kiln\n```';

test("BOTH DRAWERS DRAW THE SAME MARKS: the picture where it names one, else the title's letter", () => {
  /* A card grid is a page's block, never one written in a note's fence, so it is read as a page reads it. */
  const [block] = parse(CARDS, { page: true });
  assert.equal(block?.type, 'block');
  if (block?.type !== 'block') return;
  const opts = { icon: (name: string) => (name === 'gift' || name === 'music' ? 'M4 4h16v16H4z' : null) };
  const html = marks(toHTML([block], opts));
  const svelte = marks(render(Block, { props: { block, opts } }).body);
  assert.equal(html.length, 5);
  assert.deepEqual(svelte, html);
  assert.match(html[0]!, /data-glyph="gift".*<path d="M4 4h16v16H4z"><\/path>/u);
  assert.match(html[1]!, />B<\/span>$/u);
  assert.match(html[2]!, /data-glyph="music"/u);
  assert.match(html[3]!, />K<\/span>$/u);
  assert.match(html[4]!, />K<\/span>$/u);
});

test('A CELL NAMING A PROJECT IS SAID IN THE CARD\'S META LINE: "on", the project\'s dot in its hue, and its name', () => {
  const [block] = parse('```cards\ntitle | fact: Project\nShip the export | Oxbow.gg\nFix the rail | BrainDog\nTidy | Everywhere\n```', { page: true });
  if (block?.type !== 'block') return assert.fail('the fixture did not parse as a block');
  const scope = {
    columns: [1],
    everywhere: 'Everywhere',
    glyph: null,
    marks: new Map([
      ['Oxbow.gg', { mark: 'cake', hue: 20 }],
      ['BrainDog', { mark: 'paw', hue: 200 }],
    ]),
  };
  const opts = { scope, icon: (name: string) => (name === 'gift' ? 'M4 4h16v16H4z' : null) };
  const body = render(Block, { props: { block, opts } }).body.replace(/<!--[\s\S]*?-->/gu, '');
  const lines = [...body.matchAll(/<p class="cards-scope[^"]*">(.*?)<\/p>/gu)].map((m) => m[1]!);
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^on <span class="cards-scope-dot[^"]*" style="--hue:20" data-slot="pink" aria-hidden="true"><\/span><span class="scope-name[^"]*">Oxbow\.gg<\/span>$/u);
  assert.match(lines[1]!, /style="--hue:200"/u);
  assert.match(lines[2]!, /^<span class="scope-name[^"]*">Everywhere<\/span>$/u, 'a row for every project is not "on" one');
  assert.doesNotMatch(body, /<dt>Project<\/dt>/u, 'never a fact in the label column');
});
