/**
 * ONE PRESS ANSWERS: which answer each of Decide's keys gives, when the suggestion is drawn, the amount
 * a button names when money moves, and when a note is offered after the answer instead of a reason before it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { acceptKey, amountSaid, declineKey, fromInput, hold, HOLD_MS, keyAct, labelOf, movesOf, notedAfter, queueAct, twoWords } from './press.ts';
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

test('Enter accepts, e edits, Backspace declines, and no other key belongs to Needs you', () => {
  assert.equal(keyAct('Enter'), 'accept');
  assert.equal(keyAct('e'), 'edit');
  assert.equal(keyAct('Backspace'), 'decline');
  for (const key of ['j', 'k', 'E', 'Delete', ' ', 'a', '1']) assert.equal(keyAct(key), null, key);
});

test('a key that starts inside a field, a box or anything editable is ever taken by Needs you', () => {
  /* WHAT `closest` WOULD FIND, as the DOM answers it: the element itself when it is one, else an ancestor that is. */
  const el = (inside: boolean, editable = false) => ({ closest: (s: string) => (inside && /input/u.test(s) ? {} : null), isContentEditable: editable });
  assert.equal(fromInput(el(true)), true, 'Backspace on a tick declined the question under it');
  assert.equal(fromInput(el(false, true)), true);
  assert.equal(fromInput(el(false)), false);
  assert.equal(fromInput(null), false);
  assert.equal(fromInput({}), false);
});

test('an answer that cannot be taken back is held six seconds with Undo, and sent once', () => {
  assert.equal(HOLD_MS, 6_000);
  /* A CLOCK THE TEST TURNS BY HAND. */
  const due = new Map<number, () => void>();
  let next = 0;
  const clock = {
    set: (fn: () => void, ms: number) => {
      assert.equal(ms, HOLD_MS);
      due.set(++next, fn);
      return next;
    },
    clear: (id: unknown) => void due.delete(id as number),
  };
  const tick = () => [...due.values()].forEach((fn) => fn());

  let sent = 0;
  const a = hold(() => sent++, HOLD_MS, clock);
  assert.equal(a.done, false);
  tick();
  assert.equal(sent, 1, 'the held answer was not sent when its time was up');
  assert.equal(a.undo(), false, 'an answer already sent was taken back');
  a.flush();
  assert.equal(sent, 1, 'an answer was sent twice');

  const b = hold(() => sent++, HOLD_MS, clock);
  assert.equal(b.undo(), true);
  tick();
  b.flush();
  assert.equal(sent, 1, 'an undone answer was sent');

  /* LEAVING THE PAGE SENDS IT AT ONCE, and its time running out after that sends nothing more. */
  const c = hold(() => sent++, HOLD_MS, clock);
  c.flush();
  tick();
  assert.equal(sent, 2);
  assert.equal(c.done, true);
});

/**
 * THE WINDOW'S OWN TIMERS, CALLED AS THE WINDOW'S. The clock was `{ set: setTimeout }`, and a browser refuses
 * `setTimeout` called on any object but the window ("Illegal invocation"): every press on a decision card threw, the
 * card showed its answered line with no Undo, and nothing was sent. Node lets the call through, so this stands in a
 * `setTimeout` that refuses the wrong `this` as the browser's does.
 */
test('a held answer waits on the window’s timers, called as the window’s, as a browser insists', () => {
  const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
  const strict = (fn: (...a: never[]) => unknown) =>
    function (this: unknown, ...args: unknown[]) {
      if (this !== globalThis && this !== undefined) throw new TypeError('Illegal invocation');
      return (fn as (...a: unknown[]) => unknown).apply(globalThis, args);
    };
  let sent = 0;
  try {
    globalThis.setTimeout = strict(real.set) as unknown as typeof setTimeout;
    globalThis.clearTimeout = strict(real.clear) as unknown as typeof clearTimeout;
    const held = hold(() => sent++);
    assert.equal(held.undo(), true, 'the held answer could not be taken back');
    const sentNow = hold(() => sent++);
    sentNow.flush();
  } finally {
    globalThis.setTimeout = real.set;
    globalThis.clearTimeout = real.clear;
  }
  assert.equal(sent, 1, 'a held answer was not sent once when flushed');
});

test('a hard question keeps its suggestion and loses only Enter', () => {
  assert.equal(acceptKey({ ...options('per seat'), band: 'undo' }), null, 'no key answers what is hard to undo');
  /* NOR AN ANSWER THAT IS ITSELF THE HARD ONE, on a question whose band is only a call (batch 64): suggested, it loses
     Enter; a safe suggestion beside it keeps Enter. */
  const kept = (rec: string) => ({ options: [{ key: 'keep', recommended: rec === 'keep' }, { key: 'take', recommended: rec === 'take', hard: true }], band: 'call' });
  assert.equal(acceptKey(kept('take')), null, 'Enter gives a suggested answer that cannot be taken back');
  assert.equal(acceptKey(kept('keep')), 'keep');
  assert.equal(acceptKey(options('per seat'), true), null, 'no key answers what moves money');
  assert.equal(acceptKey({ ...options('per seat'), band: 'rows' }), 'per seat', 'a band that only adds still lets Enter give the suggestion');
  assert.doesNotMatch(readFileSync(new URL('./press.ts', import.meta.url), 'utf8'), /suggestionShown/u, 'nothing hides the suggestion any more');
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
  /* AMOUNTS THAT CANCEL STILL MOVE MONEY: £3 out of one account and £3 into another is £6 written, and a key never
     accepts it. */
  const transfer = movesOf(
    { register: 'expenses', rows: [{ amount: { amount: -300, currency: 'GBP' } }, { amount: { amount: 300, currency: 'GBP' } }] },
    registers,
  );
  assert.deepEqual(transfer, [{ amount: 600, currency: 'GBP' }]);
  /* AND AMOUNTS THAT POINT BOTH WAYS NAME ALL THEY MOVE, never the net: -£5 and +£3 is £8 written, not £2. */
  const mixed = { register: 'expenses', rows: [{ amount: { amount: -500, currency: 'GBP' } }, { amount: { amount: 300, currency: 'GBP' } }] };
  assert.deepEqual(movesOf(mixed, registers), [{ amount: 800, currency: 'GBP' }]);
  /* AMOUNTS THAT ALL POINT ONE WAY KEEP THEIR NET, sign and all: the net is what moves. */
  const out = { register: 'expenses', rows: [{ amount: { amount: -500, currency: 'GBP' } }, { amount: { amount: -300, currency: 'GBP' } }] };
  assert.deepEqual(movesOf(out, registers), [{ amount: -800, currency: 'GBP' }]);
  /* EACH CURRENCY ON ITS OWN, never added to another. */
  const two = { register: 'expenses', rows: [{ amount: { amount: -500, currency: 'GBP' } }, { amount: { amount: 300, currency: 'USD' } }] };
  assert.deepEqual(movesOf(two, registers), [{ amount: -500, currency: 'GBP' }, { amount: 300, currency: 'USD' }]);
  assert.equal(acceptKey(change(), transfer.length > 0), null, 'Enter accepts money that cancels out');
});

test('Accept names the amount when money moves, and the record’s Reject is Decline', () => {
  assert.equal(amountSaid([{ amount: 1298, currency: 'GBP' }], 'GBP'), '£12.98');
  /* ANOTHER CURRENCY BY ITS OWN SIGN (AM15); where it keeps its code (the home's sign is the same), a no-break space
     holds the code to its figure, so a button never wraps between them. */
  assert.equal(amountSaid([{ amount: 1298, currency: 'GBP' }, { amount: 500, currency: 'USD' }], 'GBP'), '£12.98 and $5');
  assert.equal(amountSaid([{ amount: 1298, currency: 'GBP' }, { amount: 500, currency: 'USD' }], 'CAD'), '£12.98 and $5\u00a0USD');
  assert.equal(amountSaid([], 'GBP'), '');

  const q = change();
  assert.match(labelOf(q.options[0]!, q, [{ amount: 1298, currency: 'GBP' }]), /^Accept £12\.98/u);
  assert.equal(labelOf(q.options[0]!, q, []), 'Accept');
  assert.equal(labelOf(q.options[1]!, q, []), words.decline);
  /* AN OPTION ITS ASKER WROTE KEEPS ITS OWN WORDS, money or none. */
  const o = options('flat');
  assert.equal(labelOf(o.options[0]!, o, [{ amount: 1298, currency: 'GBP' }]), 'Flat');
});

test('The words in Needs you are plain: no em dash, and none of the system’s words', () => {
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
  assert.match(queue, /window\.addEventListener\('keydown', onkey, \{ capture: true \}\)/u, 'The keys of Needs you no longer come before the page reader’s Enter');
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

test('on the queue every answer, Backspace’s too, is held six seconds with Undo by the card, and never fires from inside a field', () => {
  const at = queue.indexOf('function onkey(e: KeyboardEvent) {');
  const onkey = queue.slice(at, queue.indexOf('\n  }\n', at));
  assert.match(onkey, /if \(covered\(\) \|\| typing\(\) \|\| fromInput\(e\.target\) \|\| silenced\(e\)\) return;/u, 'a key from inside a field reaches Needs you');
  /* THE ONE DECISION CARD HOLDS EVERY PRESS FOR ITS UNDO (`lib/decide/DecisionCard.svelte`), so a key that presses its
     button is held the same way, and the page holds nothing of its own on top. */
  assert.match(onkey, /press\.click\(\);/u);
  assert.doesNotMatch(queue, /holdDecline|const held = hold\(/u, 'the page holds a decline on top of the card’s own hold');
  const card = readFileSync(fileURLToPath(new URL('../../lib/decide/DecisionCard.svelte', import.meta.url)), 'utf8');
  assert.match(card, /holding = hold\(\(\) => \{/u, 'the card sends a press at once, with no Undo');
  assert.match(card, /onclick=\{undo\}>\{cardWords\.undo\}/u, 'the answered line offers no Undo');
  /* AND AN ANSWER STILL HELD WHEN THE PAGE OR THE CARD GOES IS SENT, not dropped. */
  assert.match(card, /window\.addEventListener\('pagehide', leave\);/u, 'a held answer is dropped when the tab goes');
  assert.match(card, /removeEventListener\('pagehide', leave\);\n\s+leave\(\);/u, 'a held answer is dropped when the card goes');
});

test('the suggested answer is the chosen fill, and not marked where the choice is hard to undo', () => {
  /* THE SKIN MARKS THE SUGGESTION IN A ROW OF ANSWERS THE RENDERER DRAWS with the accent's first tint and the accent's
     words, only where the choice can be taken back; the one decision card draws its choices with
     `lib/decide/form.css` over the same classes, says "Suggested" in the accent's words in its list, and fills the
     suggested button of its row with the accent. the Needs you page draws no copy of its own. */
  const rules = rulesOf(skin);
  const SUGGESTED = '.queue-option[data-recommended] > .queue-act:not([data-on])';
  const UNDOABLE = ".queue-card:not(:has(.queue-cost[data-cost='undo']))";
  const marked = rules.find((r) => r.on.split(',').some((one) => one.trim().startsWith(UNDOABLE) && one.trim().endsWith(SUGGESTED)));
  assert.ok(marked, 'the skin no longer marks the suggested answer only where the choice can be taken back');
  assert.ok(marked.on.includes('.queue-options:not(:has(.queue-because))'), 'the tint reaches a choice in the form, where "Suggested" says it');
  /* THE ROLES, NOT THE RED (4ad21ac3f): in dark only the main action is the brand colour, so a suggestion is the chosen fill. */
  assert.match(marked.says, /background: var\(--chosen\);/u, 'the suggested answer is not the chosen fill');
  assert.match(marked.says, /color: var\(--link\);/u, 'the suggested answer is not in the link’s words');
  const unmarked = rules.find((r) => r.on.split(',').some((one) => one.trim() === ".queue-card:has(.queue-cost[data-cost='undo']) .queue-rec"));
  assert.ok(unmarked && /display: none;/u.test(unmarked.says), 'a card that is hard to undo still says which answer is suggested');
  const form = readFileSync(fileURLToPath(new URL('../../lib/decide/form.css', import.meta.url)), 'utf8');
  const rec = rulesOf(form).find((r) => r.on === '.dc-rec');
  assert.ok(rec && /color: var\(--red\);/u.test(rec.says), 'the card’s "Suggested" is not in the accent’s words');
  const style = queue.slice(queue.indexOf('<style>'));
  assert.doesNotMatch(style, /data-recommended|\.queue-rec\b|\.dc-rec\b/u, 'Needs you draws its own copy of the suggestion again, which can drift');
  /* NOTHING MOVES OR FADES WHEN A KEY LANDS: the by-line is always there, and nothing on the card is transitioned. */
  assert.match(queue, /\.page :global\(\.queue-card > \.queue-by\) \{\n\s+display: flex;\n\s+transition: none;/u, 'the by-line waits for the cursor and moves the card under it');
});

test('a and d are the queue keys, and no other key is', () => {
  assert.equal(queueAct('a'), 'approve');
  assert.equal(queueAct('d'), 'defer');
  for (const key of ['A', 'D', 'e', 'Enter', 'x', '1']) assert.equal(queueAct(key), null, key);
});
