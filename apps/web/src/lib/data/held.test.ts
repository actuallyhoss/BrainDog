/**
 * `held.ts`: which press is held while the screen is a saved copy, and which goes through; and the shell and the
 * screens that hold it (`held.svelte.ts`, the root layout, Today, a page, Needs you, a question's card, a page's keys).
 *
 * THE RULE (VERIFY H45): nothing that writes is pressed until the record has answered, every control stays in its box
 * so nothing moves when it lands, and a link still goes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { heldControl, heldKey, isControl, type Pressed } from './held.ts';

/** An element as `held.ts` reads one. */
function el(nodeName: string, attrs: Record<string, string> = {}, parent: Pressed | null = null): Pressed {
  return {
    nodeName,
    parentElement: parent,
    getAttribute: (n) => (Object.hasOwn(attrs, n) ? attrs[n]! : null),
    hasAttribute: (n) => Object.hasOwn(attrs, n),
  };
}

const main = el('MAIN', { id: 'main' }, el('BODY'));

test('A BUTTON, A CHOICE AND A MENU ROW ARE HELD; A LINK, TEXT AND A BOX TYPED INTO ARE NOT', () => {
  const card = el('DIV', { class: 'card' }, main);
  const chase = el('BUTTON', { type: 'button' }, card);
  const label = el('SPAN', {}, chase);
  assert.equal(heldControl(label, main), chase, 'a press on the words inside a button is the button');
  assert.equal(heldControl(el('DIV', { role: 'menuitem' }, card), main)?.nodeName, 'DIV');
  assert.equal(heldControl(el('DIV', { role: 'radio' }, card), main)?.nodeName, 'DIV');
  assert.equal(heldControl(el('INPUT', { type: 'checkbox' }, card), main)?.nodeName, 'INPUT');
  assert.equal(heldControl(el('SELECT', {}, card), main)?.nodeName, 'SELECT');

  const link = el('A', { href: '/p/kiln' }, card);
  assert.equal(heldControl(el('SPAN', {}, link), main), null, 'a link still goes');
  assert.equal(heldControl(el('P', {}, card), main), null, 'text is not a press');
  assert.equal(heldControl(el('INPUT', { type: 'text' }, card), main), null, 'typing is never held');
  assert.equal(heldControl(el('INPUT', {}, card), main), null, 'an input with no type is typed into');
  assert.equal(isControl(el('TEXTAREA')), false);
});

test('A CONTROL MARKED data-free, OR IN A STRIP MARKED SO, ONLY OPENS WHAT IS DRAWN AND IS NOT HELD', () => {
  assert.equal(heldControl(el('BUTTON', { 'data-free': '' }, main), main), null);
  const strip = el('DIV', { 'data-free': '' }, main);
  assert.equal(heldControl(el('SPAN', {}, el('BUTTON', {}, strip)), main), null);
});

test('A CONTROL ALREADY DISABLED, AND ONE OUTSIDE THE SCREEN, ARE NOT THIS RULE TO HOLD', () => {
  assert.equal(heldControl(el('BUTTON', { disabled: '' }, main), main), null);
  const rail = el('NAV', {}, el('BODY'));
  assert.equal(heldControl(el('BUTTON', {}, rail), main), null, 'the rail is not the screen');
  assert.equal(heldControl(null, main), null);
});

test('ENTER AND SPACE ON A HELD CONTROL ARE HELD, AND SO IS ENTER THAT SENDS WHAT WAS TYPED; TYPING IS NOT', () => {
  const role = el('DIV', { role: 'button' }, main);
  const key = (k: string, target: Pressed, mods: Partial<{ metaKey: boolean; ctrlKey: boolean }> = {}) => heldKey({ key: k, metaKey: false, ctrlKey: false, ...mods, target }, main);
  assert.equal(key('Enter', role), true);
  assert.equal(key(' ', role), true);
  assert.equal(key('j', role), false, 'the cursor still walks');
  const line = el('INPUT', { type: 'text' }, main);
  assert.equal(key('Enter', line), true, 'Enter sends the line');
  assert.equal(key('a', line), false, 'a letter is typed');
  const note = el('TEXTAREA', {}, main);
  assert.equal(key('Enter', note), false, 'a new line in a note');
  assert.equal(key('Enter', note, { metaKey: true }), true, 'Cmd+Enter sends the note');
  assert.equal(key('Enter', el('A', { href: '/x' }, main)), false, 'Enter on a link goes');
  assert.equal(key('Enter', el('BUTTON', {}, el('BODY'))), false, 'outside the screen');
});

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('THE SHELL HOLDS THE SCREEN while the quiet mark is up, a screen draws what it kept, or the shell is the copy', () => {
  const layout = src('../shell/AppFrame.svelte');
  assert.match(layout, /<main id="main" class="body"[^>]*\{@attach holdIn\(\(\) => presses\.held \|\| data\.stale === true\)\}>/u);
  assert.match(layout, /:global\(#main\[data-held\] \[data-held-press\]\) \{[^}]*cursor: default;/u, 'quiet, and in the same box');
  /* THE RULE'S OWN BODY: read to the end of the file this caught every rule after it in the sheet, none of them about holding. */
  const heldRule = layout.slice(layout.indexOf(':global(#main[data-held]'));
  assert.doesNotMatch(heldRule.slice(0, heldRule.indexOf('}')), /^\s*(display|block-size|inline-size|margin|padding|visibility)\s*:/mu, 'nothing that moves a box');
  const held = src('./held.svelte.ts');
  assert.match(held, /return holds > 0 \|\| copyMark\.on;/u, 'the quiet mark holds every press under it');
  assert.match(held, /root\.addEventListener\('click', press, true\);/u, 'before any handler hears it');
  assert.match(held, /root\.addEventListener\('submit', turn, true\);/u);
  assert.match(held, /if \(el\.getAttribute\('aria-disabled'\) === 'true'\) el\.removeAttribute\('aria-disabled'\);/u, 'it takes back only its own mark');
});

test('TODAY, A PAGE AND NEEDS YOU HOLD THEIR PRESSES WHILE THEY DRAW A COPY OR WHAT THIS TAB KEPT, and Needs you is not inert', () => {
  const home = src('../home/Home.svelte');
  assert.match(home, /if \(!fromCopy\) return;\n\s+return untrack\(\(\) => holdCopyMark\(\)\);/u);
  assert.match(home, /if \(!fromMemory\) return;\n\s+return untrack\(\(\) => holdPresses\(\)\);/u);
  assert.match(home, /settled = true;\n\s+fromMemory = true;/u, 'drawn from memory, held');
  assert.match(home, /settled = true;\n\s+fromMemory = false;/u, 'let go once the read behind it has answered');
  const page = src('../../routes/p/[slug]/+page.svelte');
  assert.match(page, /if \(remembered === null\) return;\n\s+return untrack\(\(\) => holdPresses\(\)\);/u);
  assert.match(page, /answered\(asked, keptCopy\);\n\s+remembered = asked;/u);
  const decide = src('../../routes/decide/+page.svelte');
  assert.doesNotMatch(decide, /inert=\{fromCopy\}/u, 'a question on the copy still opens by its link');
  assert.match(decide, /if \(!fromCopy\) return;\n\s+return untrack\(\(\) => holdCopyMark\(\)\);/u);
});

test('A QUESTION\'S ANSWER BY KEY, AND A PAGE\'S KEYS THAT WRITE, ARE HELD AS A PRESS IS', () => {
  const card = src('../decide/DecisionCard.svelte');
  /* A PRESS ON THE COPY IS KEPT FOR THE RECORD, NOT DROPPED (fluid F5): it is remembered while the screen is held, and
     nothing is answered until it is not. */
  assert.match(card, /function press\(way: Way\) \{\n\s+if \(busy \|\| holding !== null\) return;\n\s+if \(kept \|\| presses\.held\) \{\n\s+if \(phase === 'open' && onpress === undefined\) waiting = /u);
  assert.match(card, /if \(waiting === null \|\| kept \|\| presses\.held\) return;/u, 'and it goes only once nothing holds the screen');
  assert.match(card, /function selectWay\(way: Way\) \{\n\s+if \(kept \|\| presses\.held \|\|/u);
  const body = src('../page/PageBody.svelte');
  assert.match(body, /if \(presses\.held && HELD_KEYS\.has\(e\.key\)\) return;/u);
  assert.match(body, /const HELD_KEYS = new Set\(\['x', 'e', 'm', 'd', 'Delete', 'Backspace'\]\);/u);
});

/* A CONTROL THAT KEEPS ITS OWN PRESS IS NOT TURNED AWAY (fluid F5): a question's answer waits for the record and goes. */
test('A CONTROL MARKED data-keeps IS LEFT TO KEEP ITS OWN PRESS, AND ITS KEYS ARE NOT HELD EITHER', () => {
  const card = el('ARTICLE', {}, main);
  const answer = el('BUTTON', { 'data-keeps': '' }, card);
  assert.equal(heldControl(el('SPAN', {}, answer), main), null, 'a press on the words in it is its own');
  assert.equal(heldControl(el('BUTTON', {}, card), main)?.nodeName, 'BUTTON', 'its neighbour with no mark is held');
  assert.equal(heldKey({ key: 'Enter', metaKey: false, ctrlKey: false, target: answer }, main), false, 'Enter on it reaches its click');
  const layout = src('../shell/AppFrame.svelte');
  assert.match(src('../decide/DecisionCard.svelte'), /data-keeps\n/u, 'the card marks its answers');
  assert.ok(layout.includes('holdIn('), 'and the shell still holds the rest');
});

test('A PRESS TURNED AWAY IS SAID, AND NOT MORE THAN ONCE IN A FEW SECONDS', () => {
  const held = src('./held.svelte.ts');
  assert.match(held, /toasts\.push\(copy\.stillOpening\)/u);
  assert.match(held, /if \(at - toldAt < 4_000\) return;/u);
  assert.match(held, /turn\(e\);\n\s+told\(\);/u, 'a click and a key are both said');
  assert.equal([...held.matchAll(/\btold\(\);/gu)].length, 2);
});
