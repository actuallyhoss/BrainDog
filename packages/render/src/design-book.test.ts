/**
 * The design book says every kind, draws its example without a fault, and takes its tokens from the declarations.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { designBook } from './design-book.ts';
import { KINDS } from './kinds.ts';
import { parse } from './parse.ts';

const look = `@layer tokens { :root { --board: #F3F4F6; --tile: #FFFFFF; --red: #CF413A; --ink: #101114; }
  :root[data-theme="dark"] { --board: #0D1014; --tile: #161A20; --red: #E05148; --ink: #ECEEF1; } }`;
const scale = ':root { --t-sm: 13px; --t-base: 15px; --sp-1: 4px; --r-md: 12px; }';
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
  assert.deepEqual(book.tokens.type, [{ name: '--t-sm', value: '13px' }, { name: '--t-base', value: '15px' }]);
  assert.equal(book.tokens.space[0]?.value, '4px');
  assert.equal(book.tokens.radii[0]?.value, '12px');
});
