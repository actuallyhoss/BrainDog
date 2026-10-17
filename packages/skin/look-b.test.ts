/**
 * Look B's tokens, held to the three blocks they are written in.
 *
 * THE SITE CODES AGAINST THESE NAMES. Batch 103's builders read `--page`, `--red`, `--head` and the rest straight from
 * the prototype's `:root`, so a name dropped or renamed here is a page that quietly loses its colour. The list below
 * is the one the wave was handed.
 *
 * DARK IS WRITTEN TWICE AND MEANS ONE THING: under the reader's scheme unless the page says light, and under
 * `[data-theme="dark"]`. The two must be the same declarations, and they turn over every light token except the ones
 * that are the same both ways (the faces, and Claude's clay).
 *
 * NO COLOUR OUTSIDE THE BLOCKS, so a value can only come from a token. And `tokens.css` names Lexend as the display
 * face, with no Poppins face left declared (DIRECTION §47).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const decomment = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//gu, '');

const sheet = decomment(source('./look-b.css'));

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

test('tokens.css names Lexend as the display face and declares no Poppins face', () => {
  const tokens = decomment(source('./tokens.css'));
  const faces = [...tokens.matchAll(/@font-face\s*\{([^}]*)\}/gu)].map((m) => m[1] ?? '');
  const families = faces.map((f) => /font-family:\s*'([^']+)'/u.exec(f)?.[1]);
  assert.ok(families.includes('Lexend'), 'a Lexend face');
  assert.ok(!families.includes('Poppins'), 'no Poppins face');
  const lexend = faces[families.indexOf('Lexend')] ?? '';
  assert.match(lexend, /url\('\/fonts\/lexend-600\.woff2'\)/u);
  assert.match(lexend, /font-weight:\s*600;/u);
  assert.match(tokens, /--font-display:\s*'Lexend',/u);
  assert.doesNotMatch(tokens, /Poppins/u);
});
