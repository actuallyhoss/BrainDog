/**
 * Screenshot mode's plate (`kinds/shot.css`), held to the rules it hides a record's words with.
 *
 * NOTHING HELD THESE BEFORE. The plate was first clear ink and a bar, which hides text and nothing else: a value the
 * browser filled into a field, a placeholder, selected text, a picture and a chart all showed through. Each got a rule
 * (batch 64), and a rule that goes missing here is a person's own words in a picture they meant to share.
 *
 * THIS FILE READS THE SHEET, IT DOES NOT DRAW IT. Whether `object-position` hides a picture in every browser is seen
 * on a screen, once the mode is mounted; what is held here is that each rule is written, that the two that hide carry
 * `!important`, and that nothing in the sheet moves a box, because a plated screen must have the same lines, wraps and
 * heights as the real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SHEET = readFileSync(new URL('./kinds/shot.css', import.meta.url), 'utf8');
/** The sheet with its comments taken out, so a word in a comment is never read as a declaration. */
const CSS = SHEET.replace(/\/\*[\s\S]*?\*\//gu, '');

/** Every rule of the sheet as its selector and its declarations, the `@layer` wrapper left out. */
const rules: { selector: string; body: string }[] = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
  .map((m) => ({ selector: m[1]!.replace(/\s+/gu, ' ').trim(), body: m[2]!.replace(/\s+/gu, ' ').trim() }))
  .map((r) => ({ ...r, selector: r.selector.replace(/^@layer components \{ ?/u, '') }));

const rule = (selector: string): string => {
  const found = rules.find((r) => r.selector === selector);
  assert.ok(found, `shot.css has no rule for ${selector}; it has ${rules.map((r) => r.selector).join(' | ')}`);
  return found.body;
};

test('THE PLATE ITSELF: clear ink over a ground in a role, and both that hide are !important', () => {
  const plate = rule('[data-plated]');
  assert.match(plate, /color: transparent !important;/u);
  assert.match(plate, /text-shadow: none !important;/u);
  assert.match(plate, /background: var\(--line\) !important;/u);
  assert.match(plate, /font-variant-numeric: tabular-nums;/u, 'a plated number is no longer as wide as it was');
});

test('A FIELD LOSES ITS FILL COLOUR TOO, and its placeholder has no ink; a tick box and a radio are left out by name', () => {
  const field = rule(":is(input:not([type='checkbox'], [type='radio']), textarea, select)[data-plated]");
  assert.match(field, /-webkit-text-fill-color: transparent !important;/u, 'a value the browser filled in would show');
  assert.match(field, /caret-color: var\(--ink\);/u, 'a person typing into a plated field cannot see where they are');
  const placeholder = rule(':is(input, textarea)[data-plated]::placeholder');
  assert.match(placeholder, /color: transparent !important;/u);
  assert.match(placeholder, /-webkit-text-fill-color: transparent !important;/u);
});

test('SELECTED TEXT ON A PLATE IS NOT INKED AGAIN', () => {
  const selection = rule('[data-plated]::selection');
  assert.match(selection, /color: transparent !important;/u);
  assert.match(selection, /-webkit-text-fill-color: transparent !important;/u);
});

test('A PICTURE, A CANVAS AND A VIDEO ARE PUSHED OUT OF THEIR OWN BOX, which only works with object-fit none', () => {
  const picture = rule(':is(img, canvas, video)[data-plated]');
  assert.match(picture, /object-position: \d+px \d+px !important;/u, 'a percentage places a picture inside its box, and a negative length shows its far edge');
  /* AT THE DEFAULT `fill` A PICTURE IS STRETCHED TO THE BOX AND A POSITION MOVES NOTHING (the checker's finding, batch 64). */
  assert.match(picture, /object-fit: none !important;/u);
  assert.doesNotMatch(CSS, /blur\(/u, 'a blur still shows a face from across the room');
});

test('A CHART KEEPS ITS BOX AND PAINTS NOTHING INSIDE IT', () => {
  assert.match(rule("svg[role='img'][data-plated] *"), /visibility: hidden !important;/u);
});

test('NOTHING IN THE SHEET MOVES A BOX OR TAKES THE FOCUS RING, and no colour is written', () => {
  for (const { selector, body } of rules) {
    for (const property of ['width', 'height', 'inline-size', 'block-size', 'padding', 'margin', 'display', 'outline', 'position', 'font-size', 'line-height']) {
      assert.doesNotMatch(body, new RegExp(`(?:^|; ?)(?:min-|max-)?${property}(?:-[a-z-]+)?:`, 'u'), `${selector} writes ${property}, so a plated screen is laid out differently from the real one`);
    }
    assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/iu, `${selector} writes a colour and not a role`);
  }
  /* EVERY RULE IS ABOUT A MARKED ELEMENT: with no mark on the page the sheet changes nothing, so it is inert until the mode is mounted. */
  for (const { selector } of rules) assert.match(selector, /\[data-plated\]/u, `${selector} reaches an element nobody marked`);
});
