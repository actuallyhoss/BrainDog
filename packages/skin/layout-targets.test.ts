/**
 * Three presses that measured under 44px on a phone, held to the rules that grow them.
 *
 * THE LAYOUT GATE MEASURES THESE IN A BROWSER (`tools/gates/layout/target.mjs`): every control under a coarse pointer
 * is 44 by 44, counting its `::before`. This file is not that gate. It holds only that the rules the gate's finding
 * was fixed with are still written, and written under `(pointer: coarse)`, so a mouse sees no change.
 *
 * A NAME-ONLY CARD (`kinds/cards.css`): a run of cards that are each only a name takes a row's air, and the whole card
 * is its title's target, so it was 448x36 under Last confirmed on Money.
 * A SPLIT'S LEGEND NAME (`blocks-charts.css`): a part's name opens its rows, and its item is a thumb tall.
 * A HOLE THAT IS A BUTTON (`apps/web/src/lib/page/Hole.svelte`): "unknown" in a sentence was 74x23.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/** Every `@media (pointer: coarse) { ... }` body in a sheet, braces matched. */
const coarse = (css: string): string[] => {
  const out: string[] = [];
  const open = '@media (pointer: coarse) {';
  for (let at = css.indexOf(open); at !== -1; at = css.indexOf(open, at + 1)) {
    let depth = 1;
    let i = at + open.length;
    for (; i < css.length && depth > 0; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    out.push(css.slice(at + open.length, i - 1));
  }
  return out;
};

/** The declarations of the one rule with exactly this selector, inside any coarse block, or `null`. */
const ruleIn = (css: string, selector: string): string | null => {
  for (const body of coarse(css)) {
    const at = body.indexOf(`${selector} {`);
    if (at === -1) continue;
    const before = body.slice(0, at).trimEnd();
    if (before !== '' && !/[}/,]$/u.test(before)) continue;
    return body.slice(at + selector.length + 2, body.indexOf('}', at));
  }
  return null;
};

const TAP_BOX = /inset:\s*min\(0px, calc\(\(100% - var\(--tap\)\) \/ 2\)\)/u;

test('a card that is only a name is a thumb tall under a coarse pointer', () => {
  const css = source('./kinds/cards.css');
  const close = '.cards-grid:not(:has(> .cards-item > :not(.cards-head))) > .cards-item';
  assert.ok(css.includes(`${close} {\n    padding-block: var(--sp-2);`), 'the close-set card is still the rule the floor is written for');
  const rule = ruleIn(css, close);
  assert.ok(rule, 'the close-set card has a rule under (pointer: coarse)');
  /* NO HAIRLINE OVER A CARD SINCE 3c51d91db, so nothing stands outside the title's `inset: 0` box and the floor is a thumb. */
  assert.match(rule, /min-block-size:\s*var\(--tap\);/u);
  assert.doesNotMatch(css, /\.cards-item \{[^}]*border-block-start/u);
  /* The whole card is the target only through the title's own `::before`. */
  assert.match(css, /\.cards-title a::before \{[^}]*position: absolute;[^}]*inset: 0;/u);
  assert.match(css, /\.cards-item \{[^}]*position: relative;/u);
});

test("a split legend's name is a thumb tall under a coarse pointer", () => {
  const css = source('./blocks-charts.css');
  const item = ruleIn(css, '.split-item');
  assert.ok(item, 'the legend item has a rule under (pointer: coarse)');
  assert.match(item, /min-block-size:\s*var\(--tap\)/u);
  assert.match(ruleIn(css, '.split-label a') ?? '', /position:\s*relative/u);
  assert.match(ruleIn(css, '.split-label a::before') ?? '', TAP_BOX);
  assert.match(ruleIn(css, 'button.split-hole') ?? '', /min-block-size:\s*var\(--tap\)/u);
});

test('a hole that is a button is 44 both ways under a coarse pointer, and only there', () => {
  const file = source('../../apps/web/src/lib/page/Hole.svelte');
  const css = file.slice(file.lastIndexOf('<style>'));
  assert.match(ruleIn(css, ':global(button.hole)') ?? '', /position:\s*relative/u);
  const box = ruleIn(css, ':global(button.hole)::before');
  assert.ok(box, 'the button has a hit box under (pointer: coarse)');
  assert.match(box, /content:\s*''/u);
  assert.match(box, /position:\s*absolute/u);
  /* Both axes: one value for `inset`, so the box grows in width as well as height. */
  assert.match(box, new RegExp(`${TAP_BOX.source};`, 'u'));
  /* Nothing outside the coarse block touches the button, so a fine pointer draws what it drew. */
  const outside = coarse(css).reduce((rest, body) => rest.replace(body, ''), css);
  assert.ok(!outside.includes('button.hole'), 'no rule for the button outside (pointer: coarse)');
});

test('a row named in a sentence is 44 both ways under a coarse pointer', () => {
  /* `{{ref:tasks#3}}` in a note is `<a><span class="typed">`, which measured 16x19 on a project page. */
  const css = source('./blocks.css');
  assert.match(ruleIn(css, 'a:has(> .typed)') ?? '', /position:\s*relative/u);
  const box = ruleIn(css, 'a:has(> .typed)::before');
  assert.ok(box, 'the link has a hit box under (pointer: coarse)');
  assert.match(box, /content:\s*''/u);
  assert.match(box, new RegExp(`${TAP_BOX.source};`, 'u'));
});
