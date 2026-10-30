/**
 * WHO MAY SIGN UP IS ASKED BESIDE THE PAGE (speed-c FL3): `+page.svelte` asks as it draws, on the addresses that open on
 * the asking step, and `Signup.svelte` takes that answer once before it would ask again.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { asksFirst, takeEarly } from './early.ts';

const FIRST = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('./Signup.svelte', import.meta.url), 'utf8');
/** The body of `ask()`, up to the next part of the page. */
const ASK = PAGE.slice(PAGE.indexOf('async function ask('), PAGE.indexOf('/* ── keeping it'));

test('a plain visit and an invitation open on the asking step; a link to spend and a way back from paying do not', () => {
  assert.equal(asksFirst(''), true);
  assert.equal(asksFirst('#code=ABCD-EFGH'), true);
  assert.equal(asksFirst('#verify=' + 'a'.repeat(43)), false);
  assert.equal(asksFirst('#verify=' + 'a'.repeat(43) + '&said=x'), false);
  assert.equal(asksFirst('#paid'), false);
  assert.equal(asksFirst('#cancelled'), false);
  assert.equal(asksFirst('#paidx'), true);
});

test('nothing asked early is nothing to take', () => {
  assert.equal(takeEarly(), null);
});

test('the first paint asks, and the page takes it before asking itself', () => {
  assert.match(FIRST, /asksFirst\(location\.hash\)\)\s*askEarly\(\)/u);
  assert.match(ASK, /takeEarly\(\) \?\? askFirst\(\)/u);
  assert.doesNotMatch(ASK, /await methods\(\)|checkName\(/u);
});
