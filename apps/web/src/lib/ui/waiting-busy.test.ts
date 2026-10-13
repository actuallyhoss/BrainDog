/**
 * The skeleton says it is busy (`Waiting.svelte`): the block that stands in while the record answers is a status,
 * is marked `aria-busy`, and still speaks its one word. Its bars are shapes and stay out of a screen reader's way.
 *
 * Node cannot mount a Svelte component, so this reads the component's markup: the lines between its script and its
 * style, which are the lines that ship.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copy } from '../copy.ts';

const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Waiting.svelte'), 'utf8');
const cut = /<\/script>\n([\s\S]*?)\n<style>/.exec(SOURCE);
assert.ok(cut, 'Waiting.svelte keeps its markup between its script and its style');
const MARKUP = cut[1]!;

/** The skeleton's own opening tag: the first tag of the markup. */
const ROOT = /^\s*<div\b[^>]*>/.exec(MARKUP)?.[0] ?? '';

test('the skeleton is one block, and it is a status', () => {
  assert.match(ROOT, /class="waiting"/);
  assert.match(ROOT, /\brole="status"/);
});

test('the skeleton is marked busy, always, and not by a condition', () => {
  assert.match(ROOT, /\baria-busy="true"/);
  assert.equal(MARKUP.match(/aria-busy/g)?.length, 1, 'busy is said once, on the skeleton itself');
});

test('the spoken word is kept: one word from the copy, read and not hidden', () => {
  const said = /<span class="said"([^>]*)>([^<]*)<\/span>/.exec(MARKUP);
  assert.ok(said, 'the skeleton keeps its spoken word');
  assert.equal(said[2], '{copy.waiting}');
  assert.doesNotMatch(said[1]!, /aria-hidden/);
  assert.ok(MARKUP.indexOf(said[0]) > MARKUP.indexOf(ROOT), 'the word sits inside the skeleton');
});

test('the word is a real one', () => {
  assert.equal(typeof copy.waiting, 'string');
  assert.ok(copy.waiting.trim().length > 0);
  assert.doesNotMatch(copy.waiting, /—/);
});

test('every bar is a shape a screen reader skips', () => {
  const shapes = MARKUP.match(/<span class="(?:bar title|row)"[^>]*>/g) ?? [];
  assert.equal(shapes.length, 2, 'the title bar and the repeated line');
  for (const shape of shapes) assert.match(shape, /aria-hidden="true"/);
});
