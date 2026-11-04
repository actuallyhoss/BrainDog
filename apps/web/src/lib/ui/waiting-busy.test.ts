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

const read = (name: string): string => readFileSync(join(dirname(fileURLToPath(import.meta.url)), name), 'utf8');
/** A component's markup: the lines between its script and its style, comments out, which are the lines that ship. */
const markupOf = (source: string, name: string): string => {
  const cut = /<\/script>\n([\s\S]*?)\n<style>/.exec(source);
  assert.ok(cut, `${name} keeps its markup between its script and its style`);
  return cut[1]!.replaceAll(/<!--[\s\S]*?-->/gu, '');
};
/* SINCE 3 NOV `Waiting` DRAWS THE ONE SKELETON EVERY CARD DRAWS (`Skeleton.svelte`, ui-perfect): the status, busy and its
   word are the skeleton's, and `Waiting` hands it the word. */
const MARKUP = markupOf(read('Waiting.svelte'), 'Waiting.svelte');
const SKELETON = markupOf(read('Skeleton.svelte'), 'Skeleton.svelte');

/** The skeleton's own opening tag: the first tag of its markup. */
const ROOT = /^\s*<div\b[^>]*>/.exec(SKELETON)?.[0] ?? '';

test('the skeleton is one block, and it is a status', () => {
  assert.match(MARKUP, /^\s*<div class="waiting"/);
  assert.match(MARKUP, /<Skeleton kind="rows" count=\{count\} label=\{copy\.waiting\} \/>/u);
  /* WHAT THE LAST WAIT KEPT, OR THE ASKED ROWS (769f08a51). */
  assert.match(read('Waiting.svelte'), /const count = \$derived\(kept\?\.rows \?\? rows\);/u);
  assert.match(ROOT, /\brole="status"/);
});

test('the skeleton is marked busy, always, and not by a condition', () => {
  assert.match(ROOT, /\baria-busy="true"/);
  assert.equal(SKELETON.match(/aria-busy/g)?.length, 1, 'busy is said once, on the skeleton itself');
  assert.doesNotMatch(MARKUP, /aria-busy/u, 'Waiting says busy a second time');
});

test('the spoken word is kept: one word from the copy, read and not hidden', () => {
  const said = /<span class="sk-said"([^>]*)>([^<]*)<\/span>/.exec(SKELETON);
  assert.ok(said, 'the skeleton keeps its spoken word');
  assert.equal(said[2], '{label}');
  assert.doesNotMatch(said[1]!, /aria-hidden/);
  assert.ok(SKELETON.indexOf(said[0]) > SKELETON.indexOf(ROOT), 'the word sits inside the skeleton');
});

test('the word is a real one', () => {
  assert.equal(typeof copy.waiting, 'string');
  assert.ok(copy.waiting.trim().length > 0);
  assert.doesNotMatch(copy.waiting, /—/);
});

test('every bar is a shape a screen reader skips', () => {
  const title = MARKUP.match(/<span class="bar title"[^>]*>/g) ?? [];
  assert.equal(title.length, 1, 'the title bar');
  for (const shape of title) assert.match(shape, /aria-hidden="true"/);
  const rows = SKELETON.match(/<span class="sk-(?:row|line|fig|chips|table)"[^>]*>/g) ?? [];
  assert.ok(rows.length > 0, 'the skeleton draws its shapes');
  for (const shape of rows) assert.match(shape, /aria-hidden="true"/);
});
