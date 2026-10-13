/**
 * THE CHOSEN SEGMENT'S HAIRLINE IS FOR A TRACK WITH NO THUMB (DIRECTION 39).
 *
 * WHAT WAS MEASURED. `controls.css` drew a hairline and a shadow on every chosen segment, and took them off again once
 * the part's track (`Segmented.svelte`, `data-slides`) had measured its thumb. Between the two the part's track showed
 * the old outlined fill. A track written by hand has no thumb and still needs them.
 *
 * A TEXT TEST OVER THE STYLESHEET, as `segmented-callers.test.ts` is over markup.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('controls.css', import.meta.url), 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** Every rule as its selector and its body. No rule in the sheet nests braces inside a segment's rule. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ selector: m[1]!.trim().replaceAll(/\s+/gu, ' '), body: m[2]! }));
const chosen = rules.filter((r) => /\.segment\[data-on\]/u.test(r.selector));
const HAIRLINE = /box-shadow:[^;]*var\(--rule\)/u;

test('the chosen segment is the tile colour on every track', () => {
  const plain = chosen.find((r) => r.selector === '.segment[data-on]');
  assert.ok(plain, 'the plain rule for a chosen segment is gone');
  assert.match(plain.body, /background:\s*var\(--tile\)/u);
  assert.doesNotMatch(plain.body, /box-shadow/u, 'the plain rule draws a shadow on every track again');
});

test('the hairline is drawn only where the part did not draw the track', () => {
  const drawn = chosen.filter((r) => HAIRLINE.test(r.body));
  assert.equal(drawn.length, 1, 'one rule draws the hairline');
  assert.equal(drawn[0]!.selector, ':not(.segmented[data-slides]) > .segment[data-on]');
});

test('the thumb is the selection, and a second chosen one keeps a flat fill', () => {
  const under = chosen.find((r) => r.selector === '.segmented[data-thumb] > .segment[data-on]');
  assert.ok(under, 'the rule under the thumb is gone');
  assert.match(under.body, /background:\s*none/u);
  assert.match(under.body, /box-shadow:\s*none/u);
  const more = chosen.find((r) => r.selector === '.segmented[data-thumb] > .segment[data-on] ~ .segment[data-on]');
  assert.ok(more, 'the rule for a second chosen segment is gone');
  assert.match(more.body, /background:\s*var\(--tile\)/u);
  assert.doesNotMatch(more.body, /box-shadow/u);
});
