/**
 * The page a failed start draws (`error.html`): it cannot read a token or import the mark, so it carries a copy of
 * each, and these hold the copies to the originals. And it says what happened in the house's words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MARK } from '../../../packages/skin/mark.ts';

const page = readFileSync(new URL('./error.html', import.meta.url), 'utf8');
const house = readFileSync(new URL('../../../packages/skin/house.css', import.meta.url), 'utf8');

test("THE MARK IS THE APP'S OWN DRAWING, in the theme's red", () => {
  const symbol = /<symbol id="start-mark" viewBox="([^"]+)">([\s\S]*?)<\/symbol>/u.exec(page);
  assert.ok(symbol, 'error.html has no #start-mark symbol');
  assert.equal(symbol[1], MARK.viewBox);
  assert.deepEqual([...symbol[2]!.matchAll(/<path d="([^"]+)" \/>/gu)].map((m) => m[1]), [...MARK.paths]);
  /* The light theme's red fill, the first `--red-fill` the generated theme writes. */
  const red = /--red-fill:\s*(#[0-9A-Fa-f]{6});/u.exec(house)?.[1];
  assert.ok(red, 'house.css names no --red-fill');
  assert.equal(/--brand:\s*(#[0-9A-Fa-f]{6});/u.exec(page)?.[1]?.toUpperCase(), red.toUpperCase());
});

test('IT SAYS LOADING WHILE IT TRIES AGAIN, THEN WHAT HAPPENED AND ONE WAY ON, with no dash a stranger reads', () => {
  const words = page.replace(/<!--[\s\S]*?-->/gu, '');
  assert.match(words, /<main id="start">/u);
  assert.match(words, /<p>Loading BrainDog…<\/p>/u);
  assert.match(words, /<h1 id="start-title">BrainDog didn't load<\/h1>/u);
  assert.match(words, /<p>Check your connection and try again\. Nothing in your BrainDog was lost\.<\/p>/u);
  assert.match(words, /<button>Try again<\/button>/u);
  assert.doesNotMatch(words, /—/u);
  /* Nothing here runs: SvelteKit moves this page into the document, which runs no script it parsed. */
  assert.doesNotMatch(words, /<script\b/u);
});
