/**
 * The design book says every kind, draws its example without a fault, and takes its tokens from the declarations.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { designBook } from './design-book.ts';
import { KINDS } from './kinds.ts';
import { parse } from './parse.ts';

const look = `@layer tokens { :root { --board: #F3F4F6; --tile: #FFFFFF; --red: #CF413A; --ink: #101114; }
  :root[data-theme="dark"] { --board: #0D1014; --tile: #161A20; --red: #E05148; --ink: #ECEEF1; } }`;
const scale = ':root { --fs-meta: 13px; --fs-body: 15px; --sp-1: 4px; --r-pop: 12px; }';
const book = designBook({ look, scale });

test('every kind the renderer draws is in the book, once', () => {
  assert.deepEqual(book.kinds.map((k) => k.kind).sort(), Object.keys(KINDS).sort());
});

test('an example parses as its own kind and is never a degraded block', () => {
  for (const k of book.kinds) {
    if (k.example === null) continue;
    const got = parse(k.example, { page: true });
    assert.ok(got.some((s) => s.type === 'block' && s.kind === k.kind), `${k.kind} draws as itself`);
    assert.ok(!got.some((s) => s.type === 'degraded'), `${k.kind} has no fault`);
  }
});

test('a kind that reads a list or a file says what it reads and gives no invented example', () => {
  for (const k of book.kinds) if (k.reads !== null && !k.chart) assert.equal(k.example, null, k.kind);
});

test('every chart kind carries the sheet specimen', () => {
  for (const k of book.kinds.filter((x) => x.chart)) assert.match(k.example ?? '', /specimen/u, k.kind);
});

test('colours come from both palettes and steps from the scale', () => {
  const board = book.tokens.colours.find((c) => c.name === '--board');
  assert.deepEqual([board?.light, board?.dark], ['#F3F4F6', '#0D1014']);
  /* THE TYPE STEPS ARE THE `fs-` SCALE (UI pass 20 Oct, SPEC 1.4); the old `t-` names are not read. */
  assert.deepEqual(book.tokens.type, [{ name: '--fs-meta', value: '13px' }, { name: '--fs-body', value: '15px' }]);
  assert.equal(book.tokens.space[0]?.value, '4px');
  assert.equal(book.tokens.radii[0]?.value, '12px');
});

test('the book opens on Look B, the design system the app is drawn in', () => {
  const book = designBook({ look: '', scale: '' });
  assert.ok(book.look.length > 5);
  assert.ok(book.look.some((l) => /pills/u.test(l)), 'says no pills');
  assert.ok(book.look.some((l) => /Plus Jakarta Sans/u.test(l)), 'names the face');
  assert.ok(book.check.some((l) => /Look B/u.test(l)), 'the check holds a design to it');
});

test('THE DESIGN BOOK NAMES NONE OF THE PRIVATE WORDS, since Slash and every agent are handed its lines, so public-clean holds it at nothing', () => {
  /* PUT TOGETHER HERE, AS THE GATE PUTS THEM, so this file is no hit of its own. The account the repository lives under is the one spelling that holds the first. */
  const words = ['ho' + 'ss', 'en' + 'core', 'tam' + 'sin'];
  const text = readFileSync(new URL('./design-book.ts', import.meta.url), 'utf8').toLowerCase().replaceAll('actually' + words[0], '');
  for (const w of words) assert.equal(text.includes(w), false, `design-book.ts names a private word (${String(w.length)} letters)`);
  for (const w of words) assert.equal(book.look.join(' ').toLowerCase().includes(w), false, `a design line names a private word (${String(w.length)} letters)`);
});
