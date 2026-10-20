/**
 * Look B's palette, held to the three blocks it is written in, and the string copy held to the sheet.
 *
 * THE SITE CODES AGAINST THESE NAMES. Batch 103's builders read `--page`, `--red`, `--head` and the rest straight from
 * the prototype's `:root`, so a name dropped or renamed here is a page that quietly loses its colour. The list below
 * is the one the wave was handed, with what integration added since.
 *
 * DARK IS WRITTEN TWICE AND MEANS ONE THING: under the reader's scheme unless the page says light, and under
 * `[data-theme="dark"]`. The two must be the same declarations, and they turn over every light token except the ones
 * that are the same both ways (the faces, and Claude's clay).
 *
 * ONE PALETTE, TWO SPELLINGS. `look-b.css` is what a page imports (through `@braindog/skin/look-b.css`) and
 * `LOOK_B_CSS` is what the Worker's admin page serves; they are equal word for word, so neither drifts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { contrast, fromHex } from './color.ts';
import { LOOK_B_CSS } from './look-b.ts';

const decomment = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//gu, '');

const file = readFileSync(new URL('../look-b.css', import.meta.url), 'utf8');
const sheet = decomment(file);

/** The body of the block a selector opens, from its brace to the brace that closes it. */
const blockAt = (text: string, opener: string): { body: string; from: number; to: number } => {
  const at = text.indexOf(opener);
  assert.ok(at >= 0, `the sheet has "${opener}"`);
  assert.equal(text.indexOf(opener, at + 1), -1, `"${opener}" is written once`);
  const open = text.indexOf('{', at + opener.length - 1);
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}' && --depth === 0) return { body: text.slice(open + 1, i), from: at, to: i + 1 };
  }
  assert.fail(`"${opener}" is closed`);
};

/** The custom properties a block declares, name to value, each once. */
const tokensOf = (body: string): Map<string, string> => {
  assert.ok(!body.includes('{'), 'a block of declarations, nothing nested');
  const out = new Map<string, string>();
  for (const decl of body.split(';')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/u.exec(decl);
    if (!m) continue;
    const [, name = '', value = ''] = m;
    assert.ok(!out.has(name), `${name} is declared once in its block`);
    out.set(name, value);
  }
  return out;
};

const layer = blockAt(sheet, '@layer tokens');
const inner = layer.body;
const light = blockAt(inner, ':root {');
const media = blockAt(inner, '@media (prefers-color-scheme: dark)');
const darkScheme = blockAt(media.body, ':root:not([data-theme="light"])');
const darkSet = blockAt(inner, ':root[data-theme="dark"]');

const L = tokensOf(light.body);
const D1 = tokensOf(darkScheme.body);
const D2 = tokensOf(darkSet.body);

/** The tokens that are the same in both schemes, and so are written only in the light block. */
const SAME_BOTH_WAYS = ['--agent-claude', '--head', '--ui', '--mono'];

/** The names the site's builders were handed (W103's house lines), every one of which the light block defines. */
const HANDED = [
  '--page', '--paper', '--night', '--night-2', '--night-rule', '--on-night', '--on-night-2', '--ink', '--ink2', '--muted',
  '--faint', '--rule', '--rule2', '--soft', '--red', '--red-press', '--red-ink', '--red-tint', '--redcard', '--on-red',
  '--on-red-2', '--red-rule', '--board', '--tile', '--bar', '--chart', '--good', '--good-tint', '--warn', '--term',
  '--term-ink', '--term-dim', '--agent-claude', '--agent-vscode', '--win-shadow', '--head', '--ui', '--mono',
  /* Added at integration, so the site's components name no colour of their own (the colour gate). */
  '--live', '--live-ring', '--term-red', '--term-green', '--term-bright', '--night-tint', '--night-tint-2', '--night-mark',
  '--night-accent', '--shadow-lift', '--shadow-pop',
  /* The solid red under white words, which `--red` cannot be in dark. */
  '--red-fill',
  /* The UI pass of 20 October: the app's red steps, the bands' grounds and tiles, the desk's app surfaces, and the
     category slots the site's tiles and the desk's projects take (SPEC 1.1, 1.3, 4.7). */
  '--red-fill-hover', '--red-fill-press', '--night-lift',
  '--band-who', '--band-ai', '--band-ai-tile', '--band-slash', '--band-slash-tile', '--band-yours', '--band-yours-tile',
  '--band-faq', '--band-faq-tile', '--band-red-tile', '--foot-rule',
  '--desk-board', '--desk-tile', '--desk-tile-2', '--desk-hover', '--desk-rule', '--desk-nav', '--desk-nav-on', '--desk-ink-3',
  '--cat-blue', '--cat-blue-tint', '--cat-violet', '--cat-violet-tint', '--cat-pink', '--cat-pink-tint', '--cat-teal',
  '--cat-teal-tint', '--cat-sky', '--cat-sky-tint', '--cat-amber', '--cat-amber-tint', '--cat-lime', '--cat-lime-tint',
];

test('the light block defines every name the site was handed', () => {
  for (const name of HANDED) assert.ok(L.has(name), `${name} is defined`);
  assert.deepEqual([...L.keys()].sort(), [...HANDED].sort(), 'and no name besides');
});

test('both dark blocks turn over the same names, and are the same declarations', () => {
  const turned = [...L.keys()].filter((name) => !SAME_BOTH_WAYS.includes(name)).sort();
  assert.deepEqual([...D1.keys()].sort(), turned, 'the scheme block turns over every light token');
  assert.deepEqual([...D2.keys()].sort(), turned, 'the data-theme block turns over every light token');
  assert.deepEqual([...D1.entries()], [...D2.entries()], 'the two dark blocks are equal');
  assert.equal(darkScheme.body.replace(/\s+/gu, ' ').trim(), darkSet.body.replace(/\s+/gu, ' ').trim(), 'word for word');
  for (const name of SAME_BOTH_WAYS) assert.ok(L.has(name), `${name} is set once, in light`);
});

test('the faces: Lexend for titles, Geist for text, Geist Mono for code', () => {
  assert.match(L.get('--head') ?? '', /^"Lexend",/u);
  assert.match(L.get('--ui') ?? '', /^"Geist",/u);
  assert.match(L.get('--mono') ?? '', /^"Geist Mono",/u);
  assert.equal(L.get('--agent-vscode'), '#007ACC');
  assert.equal(D1.get('--agent-vscode'), '#3C9DF0');
});

test('--red-fill carries white words at 4.5:1 or more in both schemes, and the reds are the app\'s two tokens', () => {
  const white = fromHex('#FFFFFF');
  for (const [scheme, block] of [['light', L], ['dark', D1]] as const) {
    const fill = block.get('--red-fill') ?? '';
    assert.match(fill, /^#[0-9A-F]{6}$/u, `${scheme}: a hex`);
    assert.equal(block.get('--on-red'), '#FFFFFF', `${scheme}: the words on red are white`);
    const ratio = contrast(fromHex(fill), white);
    assert.ok(ratio >= 4.5, `${scheme}: ${fill} on white is ${ratio.toFixed(2)}:1`);
  }
  /* SPEC 1.1 and C1: the fill is #CF413A light and #C2362F dark; red words are #C2362F light and #EA645B dark. */
  assert.equal(L.get('--red-fill'), '#CF413A', 'the light fill');
  assert.equal(D1.get('--red-fill'), '#C2362F', 'the dark fill');
  assert.equal(L.get('--red'), '#C2362F', 'red words in light (C1 default)');
  assert.equal(D1.get('--red'), '#EA645B', 'red words in dark');
  for (const block of [L, D1]) {
    assert.equal(block.get('--red-ink'), block.get('--red'), '--red-ink is the red words');
    assert.equal(block.get('--redcard'), block.get('--red-fill'), 'the chores band is the fill');
  }
});

test('no colour is written outside the three blocks', () => {
  const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/iu;
  const rest = [
    sheet.slice(0, layer.from),
    sheet.slice(layer.to),
    inner.replace(light.body, '').replace(media.body, '').replace(darkSet.body, ''),
  ].join('\n');
  assert.doesNotMatch(rest, COLOUR);
  for (const block of [light.body, darkScheme.body, darkSet.body]) assert.ok(COLOUR.test(block), 'each block carries colours');
});

test('LOOK_B_CSS is the sheet word for word, its comment aside', () => {
  assert.equal(sheet.trim(), LOOK_B_CSS.trim());
  assert.ok(file.trimStart().startsWith('/*'), 'the sheet opens with its comment');
  assert.doesNotMatch(LOOK_B_CSS, /\/\*|@import|url\(/u, 'the string is the blocks and nothing else');
});
