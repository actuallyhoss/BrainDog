/**
 * ONE PRESS ANSWERS (DIRECTION §37): which answer each of Decide's keys gives, when the suggestion is drawn, the amount
 * a button names when money moves, and when a note is offered after the answer instead of a reason before it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { acceptKey, amountSaid, declineKey, keyAct, labelOf, movesOf, notedAfter, suggestionShown, twoWords } from './press.ts';
import { words } from './words.ts';

const change = (band = 'rows') => ({
  band,
  options: [
    { key: 'accept', title: 'Accept', body: '' },
    { key: 'reject', title: 'Reject', body: '' },
  ],
});
const options = (suggested: string | null, band = 'call') => ({
  band,
  options: ['Flat', 'Per seat', 'Usage'].map((t) => ({ key: t.toLowerCase(), title: t, body: '', ...(t.toLowerCase() === suggested ? { recommended: true } : {}) })),
});

test('Enter accepts, e edits, Backspace declines, and no other key is Decide’s', () => {
  assert.equal(keyAct('Enter'), 'accept');
  assert.equal(keyAct('e'), 'edit');
  assert.equal(keyAct('Backspace'), 'decline');
  for (const key of ['j', 'k', 'E', 'Delete', ' ', 'a', '1']) assert.equal(keyAct(key), null, key);
});

test('the suggestion is drawn only where the choice can be taken back, and never where money moves', () => {
  assert.equal(suggestionShown('call', false), true);
  assert.equal(suggestionShown('rows', false), true);
  assert.equal(suggestionShown(undefined, false), true);
  assert.equal(suggestionShown('undo', false), false);
  assert.equal(suggestionShown('rows', true), false);
});

test('Enter gives the suggested answer, or Accept, and nothing that is hard to undo or moves money', () => {
  assert.equal(acceptKey(options('per seat')), 'per seat');
  /* A QUESTION OF OPTIONS WITH NOTHING SUGGESTED HAS NO ONE ANSWER FOR ENTER: the reader picks it. */
  assert.equal(acceptKey(options(null)), null);
  assert.equal(acceptKey(change()), 'accept');
  assert.equal(acceptKey(change('undo')), null);
  assert.equal(acceptKey(change(), true), null);
  assert.equal(acceptKey(options('per seat', 'undo')), null);
});

test('Backspace declines a change, and a question of options has no decline', () => {
  assert.equal(declineKey(change()), 'reject');
  assert.equal(declineKey(change('undo')), 'reject');
  assert.equal(declineKey(options('flat')), null);
  assert.equal(twoWords(change()), true);
  assert.equal(twoWords({ options: [{ key: 'reject' }, { key: 'accept' }] }), false);
  assert.equal(twoWords(options(null)), false);
});

test('a note is offered after a decline or an edit, and never after a plain accept', () => {
  assert.equal(notedAfter('reject', false), true);
  assert.equal(notedAfter('accept', true), true);
  assert.equal(notedAfter('accept', false), false);
  assert.equal(notedAfter('per seat', false), false);
});

test('the money accepting writes is summed in each currency and never across two', () => {
  const registers = {
    expenses: { fields: [{ id: 'title', type: 'text' }, { id: 'amount', type: 'money' }, { id: 'vat', type: 'money' }] },
    tasks: { fields: [{ id: 'title', type: 'text' }] },
  };
  const rowset = {
    register: 'expenses',
    rows: [
      { title: 'Paper', amount: { amount: 1000, currency: 'GBP' }, vat: { amount: '200', currency: 'gbp' } },
      { title: 'Hosting', amount: { amount: 500, currency: 'USD' } },
      { at: 'expenses#4', patch: { amount: { amount: 98, currency: 'GBP' } } },
      { title: 'Broken', amount: { amount: 1.5, currency: 'GBP' } },
    ],
  };
  assert.deepEqual(movesOf(rowset, registers), [
    { amount: 1298, currency: 'GBP' },
    { amount: 500, currency: 'USD' },
  ]);
  /* ONLY THE ROWS TICKED, and none at all when every one is left out. */
  assert.deepEqual(movesOf(rowset, registers, [1]), [{ amount: 500, currency: 'USD' }]);
  assert.deepEqual(movesOf(rowset, registers, null), []);
  /* A LIST THAT HOLDS NO MONEY, and amounts of nothing, move none. */
  assert.deepEqual(movesOf({ register: 'tasks', rows: [{ title: 'Call Halden' }] }, registers), []);
  assert.deepEqual(movesOf({ register: 'expenses', rows: [{ amount: { amount: 0, currency: 'GBP' } }] }, registers), []);
  assert.deepEqual(movesOf(undefined, registers), []);
  /* AMOUNTS THAT CANCEL STILL MOVE MONEY: £3 out of one account and £3 into another is £3 moved, and a key never
     accepts it. */
  const transfer = movesOf(
    { register: 'expenses', rows: [{ amount: { amount: -300, currency: 'GBP' } }, { amount: { amount: 300, currency: 'GBP' } }] },
    registers,
  );
  assert.deepEqual(transfer, [{ amount: 300, currency: 'GBP' }]);
  assert.equal(acceptKey(change(), transfer.length > 0), null, 'Enter accepts money that cancels out');
  assert.equal(suggestionShown('rows', transfer.length > 0), false, 'money that cancels out is drawn with its suggestion');
});

test('Accept names the amount when money moves, and the record’s Reject is Decline', () => {
  assert.equal(amountSaid([{ amount: 1298, currency: 'GBP' }], 'GBP'), '£12.98');
  /* A CURRENCY'S CODE IS HELD TO ITS FIGURE BY A NO-BREAK SPACE, so a button never wraps between them. */
  assert.equal(amountSaid([{ amount: 1298, currency: 'GBP' }, { amount: 500, currency: 'USD' }], 'GBP'), '£12.98 and $5\u00a0USD');
  assert.equal(amountSaid([], 'GBP'), '');

  const q = change();
  assert.match(labelOf(q.options[0]!, q, [{ amount: 1298, currency: 'GBP' }]), /^Accept £12\.98/u);
  assert.equal(labelOf(q.options[0]!, q, []), 'Accept');
  assert.equal(labelOf(q.options[1]!, q, []), words.decline);
  /* AN OPTION ITS ASKER WROTE KEEPS ITS OWN WORDS, money or none. */
  const o = options('flat');
  assert.equal(labelOf(o.options[0]!, o, [{ amount: 1298, currency: 'GBP' }]), 'Flat');
});

test('Decide’s words are plain: no em dash, and none of the system’s words', () => {
  const said: string[] = [];
  for (const value of Object.values(words)) {
    if (typeof value === 'string') said.push(value);
    else said.push((value as (...a: unknown[]) => string)(1, 2), (value as (...a: unknown[]) => string)(4, 9));
  }
  for (const line of said) {
    assert.doesNotMatch(line, /—/u, `"${line}" carries an em dash`);
    assert.doesNotMatch(line, /\b(row|rows|entity|list item)\b/iu, `"${line}" says a word of the system's`);
  }
  assert.equal(words.improved(1), 'BrainDog improved one of your pages');
  assert.equal(words.improved(4), 'BrainDog improved 4 of your pages');
});

/**
 * THE QUEUE'S OWN KEYS AND LOOK, read off `+page.svelte` and the skin's `kinds/queue.css`, since there is no DOM harness
 * in this app: the keys press the card's own buttons, Enter never answers a card that costs something, and the
 * suggestion is an outline with a dot that is not drawn at all where the choice is hard to undo.
 */
const queue = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
const skin = readFileSync(fileURLToPath(new URL('../../../../../packages/skin/kinds/queue.css', import.meta.url)), 'utf8');

/** Each rule of a sheet, its selector on one line and its declarations, comments left out. */
const rulesOf = (css: string): { on: string; says: string }[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({ on: m[1]!.trim().replace(/\s+/gu, ' '), says: m[2]! }));

test('on the queue a key presses the card’s own button, and Enter answers only a card that costs nothing', () => {
  assert.match(queue, /window\.addEventListener\('keydown', onkey, \{ capture: true \}\)/u, 'Decide’s keys no longer come before the page reader’s Enter');
  const at = queue.indexOf('function onkey(e: KeyboardEvent) {');
  const onkey = queue.slice(at, queue.indexOf('\n  }\n', at));
  assert.ok(at >= 0, 'the queue’s key handler no longer reads the way this test assumes');
  assert.match(onkey, /if \(card\.querySelector\('\.queue-cost'\) !== null\) return;/u, 'Enter answers a card that is hard to undo or may move money');
  assert.match(onkey, /press\.click\(\);/u, 'a key writes an answer of its own rather than pressing the card’s button');
  assert.doesNotMatch(onkey, /answerQuestion\(/u, 'a key sends an answer past the card');
  /* AND NEVER ON THE CARD THE RING WAS LEFT ON while a control elsewhere holds the focus: Backspace on Ask declined it. */
  const under = queue.slice(queue.indexOf('function questionUnder(): HTMLElement | null {'), at);
  assert.match(
    under,
    /if \(held\) return held;\n\s+if \(on instanceof HTMLElement && on\.closest\('button, a\[href\], summary, select, dialog'\) !== null\) return null;/u,
    'a key on a control outside every card answers the card the ring was left on',
  );
});

test('the suggestion on the queue is an outline with a dot, and is not drawn where the choice is hard to undo', () => {
  /* DRAWN ONCE, BY THE SKIN, so Decide, Today and every page that draws a queue mark it the same way. Decide drew its own
     copy over the skin's ink fill until the skin drew the outline itself. */
  const rules = rulesOf(skin);
  const SUGGESTED = '.queue-option[data-recommended] > .queue-act:not([data-on])';
  const UNDOABLE = ".queue-card:not(:has(.queue-cost[data-cost='undo']))";
  const marked = (r: { on: string }, tail = '') => r.on.split(',').some((one) => one.trim() === `${UNDOABLE} ${SUGGESTED}${tail}`);
  const outline = rules.find((r) => marked(r));
  assert.ok(outline, 'the skin no longer marks the suggested answer only where the choice can be taken back');
  assert.match(outline.says, /background: transparent;/u, 'the suggested answer is filled again');
  assert.match(outline.says, /border-color: var\(--ink\);/u, 'the suggested answer has lost its outline');
  const dot = rules.find((r) => marked(r, '::before'));
  assert.ok(dot && /background: currentColor;/u.test(dot.says), 'the suggested answer has lost its dot');
  const unmarked = rules.find((r) => r.on.split(',').some((one) => one.trim() === ".queue-card:has(.queue-cost[data-cost='undo']) .queue-rec"));
  assert.ok(unmarked && /display: none;/u.test(unmarked.says), 'a card that is hard to undo still says which answer is suggested');
  const style = queue.slice(queue.indexOf('<style>'));
  assert.doesNotMatch(style, /data-recommended|\.queue-rec\b/u, 'Decide draws its own copy of the suggestion again, which can drift from the skin’s');
  /* NOTHING MOVES OR FADES WHEN A KEY LANDS: the by-line is always there, and nothing on the card is transitioned. */
  assert.match(queue, /\.page :global\(\.queue-card > \.queue-by\) \{\n\s+display: flex;\n\s+transition: none;/u, 'the by-line waits for the cursor and moves the card under it');
});
