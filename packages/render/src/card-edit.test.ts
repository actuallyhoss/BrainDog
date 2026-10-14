/**
 * A card's line typed on in place (PGS-C15): which column is a box, and what a pause in the typing sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { CARD_EDIT_PAUSE, cardEdit, editAfter, editable } from './card-edit.ts';
import { parse, type Block } from './parse.ts';

/* THE DRAWER COMPILED AND RENDERED ON THE SERVER, as `parity.test.ts` does it, so the box is read off real markup. */
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('.svelte')) return next(url, context);
    const filename = fileURLToPath(url);
    return { format: 'module', source: compile(readFileSync(filename, 'utf8'), { generate: 'server', filename }).js.code, shortCircuit: true };
  },
});
/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Cards } = (await import(new URL('../svelte/Cards.svelte', import.meta.url).href)) as { default: Component<{ block: Block; opts?: Record<string, unknown> }> };

const TEXT = { type: 'text' };

test('A COLUMN IS A BOX ONLY WHERE IT SAYS EDIT, THE PAGE CAN WRITE, AND THE FIELD IS TEXT', () => {
  assert.equal(editable({ field: 'about', as: 'reply', edit: true }, TEXT, true), true);
  assert.equal(editable({ field: 'about', edit: true }, TEXT, true), true, 'no role is a fact');
  assert.equal(editable({ field: 'name', as: 'title', edit: true }, TEXT, true), true);
  assert.equal(editable({ field: 'about', as: 'reply', edit: true }, TEXT, false), false, 'a reader who cannot write sees text');
  assert.equal(editable({ field: 'about', as: 'reply' }, TEXT, true), false, 'a column that does not say edit');
  assert.equal(editable({ field: 'about', as: 'reply', edit: false }, TEXT, true), false);
  assert.equal(editable({ field: 'earned', as: 'reply', edit: true }, { type: 'money' }, true), false, 'a field that is not text draws as text');
  assert.equal(editable({ field: 'about', as: 'reply', edit: true }, undefined, true), false, 'a field the list does not hold draws as text');
  assert.equal(editable({ field: 'about', or: 'name', as: 'reply', edit: true }, TEXT, true), false, 'two fields are never a box');
  assert.equal(editable({ metric: 'done-by-week', as: 'trend', edit: true }, TEXT, true), false);
  for (const as of ['figure', 'trend', 'ring', 'hue', 'picture', 'mark', 'who', 'when', 'scope'])
    assert.equal(editable({ field: 'about', as, edit: true }, TEXT, true), false, as);
});

test("WHAT THE DRAWER IS HANDED: THE FIELD, AND ITS OWN MAX WHERE IT HAS ONE", () => {
  assert.deepEqual(cardEdit({ field: 'about', as: 'reply', edit: true }, { type: 'text', max: 120 }, true), { field: 'about', max: 120 });
  assert.deepEqual(cardEdit({ field: 'about', as: 'reply', edit: true }, TEXT, true), { field: 'about' });
  assert.deepEqual(cardEdit({ field: 'about', as: 'reply', edit: true }, { type: 'text', max: 0 }, true), { field: 'about' }, 'a max of nothing bounds nothing');
  assert.equal(cardEdit({ field: 'about', as: 'reply', edit: true }, TEXT, false), null);
});

test('NOTHING IS SENT BEFORE THE PAUSE, and the rest of it is waited', () => {
  assert.equal(CARD_EDIT_PAUSE, 700);
  assert.deepEqual(editAfter('A kiln for hire', 'A kiln for rent', 0), { send: null, wait: 700 });
  assert.deepEqual(editAfter('A kiln for hire', 'A kiln for rent', 500), { send: null, wait: 200 });
  assert.deepEqual(editAfter('A kiln for hire', 'A kiln for rent', 700), { send: 'A kiln for rent', wait: 0 });
  assert.deepEqual(editAfter('A kiln for hire', 'A kiln for rent', Infinity), { send: 'A kiln for rent', wait: 0 }, 'leaving the box sends at once');
});

test('WHAT IS SENT IS TRIMMED, AND A LINE UNCHANGED SENDS NOTHING', () => {
  assert.deepEqual(editAfter('A kiln for hire', '  A kiln for rent  ', Infinity), { send: 'A kiln for rent', wait: 0 });
  assert.deepEqual(editAfter('A kiln for hire', 'A kiln for hire', Infinity), { send: null, wait: 0 });
  assert.deepEqual(editAfter('A kiln for hire', 'A kiln for hire ', Infinity), { send: null, wait: 0 }, 'a space at the end is no change');
  assert.deepEqual(editAfter('', '   ', Infinity), { send: null, wait: 0 }, 'an empty line left empty');
  assert.deepEqual(editAfter('A kiln for hire', '', Infinity), { send: '', wait: 0 }, 'a line cleared is a change');
});

test("THE FIELD'S OWN MAX IS HELD, IN THE BYTES THE RECORD COUNTS, AND NEVER INSIDE A LETTER", () => {
  assert.deepEqual(editAfter('', 'Oxbow glaze', Infinity, 5), { send: 'Oxbow', wait: 0 });
  assert.deepEqual(editAfter('', 'Oxbow', Infinity, 5), { send: 'Oxbow', wait: 0 }, 'at the max is kept whole');
  /* `é` is two bytes: five letters and an é are seven, so a max of six keeps the five. */
  assert.deepEqual(editAfter('', 'Cafeté', Infinity, 6), { send: 'Cafet', wait: 0 });
  assert.deepEqual(editAfter('', 'Kiln work', Infinity, 5), { send: 'Kiln', wait: 0 }, 'a cut that ends in a space drops it');
  assert.deepEqual(editAfter('Kiln', 'Kiln works', Infinity, 4), { send: null, wait: 0 }, 'cut back to what it said is no change');
});

/* TWO OF THE INVENTED PROJECTS IN fixtures/names.ts, written here: a render test may not import outside the package (31 §3). */
const [ONE, TWO] = ['Lanternfish', 'Copperleaf'];
const fence = `\`\`\`cards\ntitle: Name | reply\n${ONE} | A kiln for hire\n${TWO} | \n\`\`\``;
const cards = (): Block => {
  const b = parse(fence, { page: true }).find((s) => s.type === 'block') as Block;
  b.rows.forEach((r, n) => n > 0 && (r.ref = { register: 'projects', seq: n, version: 1 }));
  return b;
};
const drawn = (opts?: Record<string, unknown>): string => render(Cards, { props: { block: cards(), ...(opts ? { opts } : {}) } }).body.replace(/<!--[^>]*-->/gu, '');
const EDITS = [null, { field: 'about', max: 120 }];

test('WITH NO WRITER THE CARD IS THE TEXT IT WAS, whatever the columns say, as the mirror draws it', () => {
  const text = drawn();
  assert.doesNotMatch(text, /<input/u);
  assert.doesNotMatch(text, /svelte-/u, "the box's styles scope nothing the text draws, so the mirror's tree is the same");
  assert.equal(drawn({ edits: EDITS }), text, 'edit with no writer is the text');
  assert.match(text, /<p class="cards-reply">A kiln for hire<\/p>/u);
});

test('WITH A WRITER THE LINE IS A BOX HOLDING ITS TEXT, readonly until opened, named for a screen reader', () => {
  const html = drawn({ edits: EDITS, write: () => null });
  const boxes = [...html.matchAll(/<input[^>]*>/gu)].map((m) => m[0]);
  assert.equal(boxes.length, 2, 'one a card, the empty line too, since the box is where it is written');
  assert.match(boxes[0]!, /class="cards-edit[^"]*"/u);
  assert.match(boxes[0]!, /value="A kiln for hire"/u);
  assert.match(boxes[0]!, /maxlength="120"/u);
  assert.match(boxes[0]!, /readonly/u);
  assert.match(boxes[0]!, new RegExp(`aria-label="Line under ${ONE}"`, 'u'));
  assert.match(boxes[1]!, /placeholder="Add a line"/u);
  assert.match(html, new RegExp(`<h3 class="cards-title[^"]*">${ONE}</h3>`, 'u'), 'a column without edit stays text');
});

test('A ROW THE HOST CANNOT NAME DRAWS TEXT, since the writer writes by its ref', () => {
  const b = cards();
  b.rows.forEach((r) => delete r.ref);
  const html = render(Cards, { props: { block: b, opts: { edits: EDITS, write: () => null } } }).body;
  assert.doesNotMatch(html, /<input/u);
});
