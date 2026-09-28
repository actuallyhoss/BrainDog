/**
 * One value in a box, and the same value back out, whichever screen the box is on.
 *
 * THE GRID EDITED FIVE TYPES AND THE ROW PAGE EDITED ALL BUT ONE. Measured on 24 September at HEAD `653ae663`: the
 * register screen's `EDITABLE` held `text enum day int decimal`, and every other type answered the pencil's key with
 * "open the row". The row page could do the rest because it had three closures over its own state, `draftOf`,
 * `wrongMoney` and `patchOf`, and nothing else could call them. So a money cell was refused in the grid for being "an
 * amount and a currency", when the one screen that did edit money had already solved exactly that.
 *
 * NOW THEY ARE ONE MODULE THAT BOTH SCREENS CALL, and the cases below are the row page's behaviour held as it was:
 * a money box is in major units and goes back with the currency the row held, a third decimal on a two-place currency
 * is refused where it was typed, and a list is typed as its tags with commas.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FIELD_TYPES as RECORD_TYPES } from '@braindog/kernel';

import { copy } from '../copy.ts';
/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load
   and takes the sweeps at the bottom down with it. */
import * as draft from './field-draft.ts';
import type { FieldDecl } from './schema.ts';

/* THE LIST SCREEN IS ITS PAGE AND ITS PARTS (ARC-7a): the editor's functions are the page's and the cell it becomes is `ListTable`'s, read as one text, page first. */
const GRID = ['+page.svelte', 'parts/ListTable.svelte']
  .map((at) => readFileSync(new URL(`../../routes/r/[register]/${at}`, import.meta.url), 'utf8'))
  .join('\n');
const ROW = readFileSync(new URL('../../routes/r/[register]/[seq]/+page.svelte', import.meta.url), 'utf8');

const AMOUNT: FieldDecl = { id: 'amount', type: 'money' };
const TAGS: FieldDecl = { id: 'tags', type: 'list', of: 'text' };
const PAID: FieldDecl = { id: 'paid', type: 'bool' };
const TITLE: FieldDecl = { id: 'what', type: 'text' };

test('a money box goes back as minor units in the currency the row held', () => {
  assert.equal(typeof draft.patchOf, 'function', 'field-draft.ts exports no patchOf');
  assert.deepEqual(draft.patchOf(AMOUNT, '12.50', { amount: 100, currency: 'EGP' }, null), { amount: { amount: 1250, currency: 'EGP' } });
  /* THE ROW'S OWN CURRENCY WINS OVER THE LIST'S. The fallback is what a list mostly holds, and a row in dinars on a
     list of pounds would otherwise be rewritten in pounds by somebody correcting its amount. */
  assert.deepEqual(draft.patchOf(AMOUNT, '1.25', { amount: 1000, currency: 'KWD' }, 'GBP'), { amount: { amount: 1250, currency: 'KWD' } });
  /* AN EMPTY ROW TAKES THE LIST'S CURRENCY, and an empty box is the record being told the row no longer has one. */
  assert.deepEqual(draft.patchOf(AMOUNT, '3', null, 'JPY'), { amount: { amount: 3, currency: 'JPY' } });
  assert.deepEqual(draft.patchOf(AMOUNT, '  ', { amount: 100, currency: 'EGP' }, null), { amount: null });
});

test('a third decimal is refused on a two-place currency and accepted on a three-place one', () => {
  assert.equal(typeof draft.wrongMoney, 'function', 'field-draft.ts exports no wrongMoney');
  assert.equal(draft.wrongMoney(AMOUNT, '1.234', { amount: 100, currency: 'EGP' }, null), copy.moneyPlaces(2));
  assert.equal(draft.wrongMoney(AMOUNT, '1.234', null, 'EGP'), copy.moneyPlaces(2));
  assert.equal(draft.wrongMoney(AMOUNT, '1.234', { amount: 100, currency: 'KWD' }, null), null);
  assert.equal(draft.wrongMoney(AMOUNT, '1.234', null, 'KWD'), null);
  assert.equal(draft.wrongMoney(AMOUNT, '12,50', null, 'EGP'), copy.moneyShape);
  /* ONLY MONEY IS ASKED: a decimal with four places is a decimal, and the record is the one to say otherwise. */
  assert.equal(draft.wrongMoney({ id: 'rate', type: 'decimal' }, '1.2345', null, 'EGP'), null);
  assert.equal(draft.wrongMoney(AMOUNT, '', null, 'EGP'), null);
});

test('a list is typed as its tags with commas, and the tags the record keeps are kept', () => {
  assert.equal(typeof draft.draftOf, 'function', 'field-draft.ts exports no draftOf');
  assert.equal(draft.draftOf(TAGS, ['rent', 'home'], null), 'rent, home');
  assert.equal(draft.draftOf(TAGS, ['rent', 'formed', 'example'], null), 'rent');
  assert.deepEqual(draft.patchOf(TAGS, 'rent, bills', ['rent', 'formed'], null), { tags: ['rent', 'bills', 'formed'] });
});

test('a money value opens in major units at its own exponent, and comes back out the same', () => {
  for (const [minor, currency, typed] of [
    [1250, 'EGP', '12.5'],
    [1250, 'KWD', '1.25'],
    [1250, 'JPY', '1250'],
  ] as const) {
    const held = { amount: minor, currency };
    assert.equal(draft.draftOf(AMOUNT, held, null), typed);
    assert.deepEqual(draft.patchOf(AMOUNT, draft.draftOf(AMOUNT, held, null), held, null), { amount: held });
  }
  assert.equal(draft.draftOf(AMOUNT, null, 'EGP'), '');
  assert.equal(draft.draftOf(TITLE, 'Rent', null), 'Rent');
});

const EFFORT: FieldDecl = { id: 'effort', type: 'duration', unit: 'h' };

test('a duration opens in the unit it is said in, and a number typed there is read in that unit', () => {
  /* MEASURED BY THE CHECKER ON 24 SEPTEMBER: a cell drawn as `2 h` opened its box on `7200`, the seconds the record
     stores, and on the row page that box sat beside the letter `h`. Typing `3` there meaning three hours wrote three
     seconds, and the cell then read `0.001 h`. `work.ts` declares `effort` in days, so every effort edited on either
     screen was off by a factor of 86,400. */
  assert.equal(draft.draftOf(EFFORT, 7200, null), '2');
  assert.deepEqual(draft.patchOf(EFFORT, '3', 7200, null), { effort: 10_800 });
  assert.deepEqual(draft.patchOf({ id: 'effort', type: 'duration', unit: 'd' }, '0.5', null, null), { effort: 43_200 });
  /* LEFT ALONE IS NOT A WRITE: the box opened on `2` and still says `2`, which is the 7200 the row holds. */
  assert.equal(draft.unchanged(EFFORT, '2', 7200, null), true);
  assert.equal(draft.unchanged(EFFORT, '7200', 7200, null), false);
  /* A FIELD THAT NAMES NO UNIT IS SAID IN SECONDS, as `display` says it, so its box is the stored number. */
  const bare: FieldDecl = { id: 'wait', type: 'duration' };
  assert.equal(draft.draftOf(bare, 90, null), '90');
  assert.deepEqual(draft.patchOf(bare, '90', 90, null), { wait: 90 });
  /* A FRACTION OF A SECOND IS NOT ROUNDED AWAY IN A FIELD SAID IN SECONDS: it goes as typed, and the record's own
     sentence says a duration is whole. In hours a second is below what the unit says, so it is rounded to one. */
  assert.deepEqual(draft.patchOf(bare, '1.5', 90, null), { wait: 1.5 });
  assert.deepEqual(draft.patchOf(EFFORT, '1.0001', null, null), { effort: 3600 });
  /* WHAT IS NOT A NUMBER GOES AS TYPED, so the refusal under the box is the record's and names the field. */
  assert.deepEqual(draft.patchOf(EFFORT, 'soon', 7200, null), { effort: 'soon' });
  assert.deepEqual(draft.patchOf(EFFORT, '', 7200, null), { effort: '' });
});

test('every duration opens on a number that goes back as the seconds it came from', () => {
  /* A LENGTH THAT IS NOT A WHOLE NUMBER OF ITS UNIT opens on the shortest decimal that comes back as the same seconds,
     so `100` in hours is `0.0278` and not `0.027777777777777776`, and opening it and saving writes nothing new. */
  for (const unit of ['s', 'm', 'h', 'd', 'w'])
    for (const seconds of [0, 1, 59, 100, 3600, 5400, 86_399, 604_800, 1_234_567]) {
      const f: FieldDecl = { id: 'x', type: 'duration', unit };
      const opened = draft.draftOf(f, seconds, null);
      assert.deepEqual(draft.patchOf(f, opened, seconds, null), { x: seconds }, `${seconds} s in ${unit} opened as ${opened}`);
      assert.ok(opened.length <= 12, `${seconds} s in ${unit} opened as ${opened}`);
    }
  assert.equal(draft.draftOf(EFFORT, 100, null), '0.0278');
});

test('a yes or no is ticked, not typed', () => {
  assert.deepEqual(draft.patchOf(PAID, true, false, null), { paid: true });
  assert.deepEqual(draft.patchOf(PAID, false, true, null), { paid: false });
  /* WHETHER A PRESS CHANGED ANYTHING, which is what decides that a write is sent at all. */
  assert.equal(draft.unchanged(PAID, true, true, null), true);
  assert.equal(draft.unchanged(PAID, true, undefined, null), false);
  assert.equal(draft.unchanged(AMOUNT, ' 12.5 ', { amount: 1250, currency: 'EGP' }, null), true);
  assert.equal(draft.unchanged(AMOUNT, '12.51', { amount: 1250, currency: 'EGP' }, null), false);
});

test('every type the record has is editable but a secret', () => {
  assert.equal(typeof draft.editable, 'function', 'field-draft.ts exports no editable');
  /* THE RECORD'S TYPES, NOT THE APP'S, because a declaration the record serves can carry any of them. A quantity and
     structured data came back when a box could take each apart (MOD-22); a file when the file store could hold it
     (OPS-20). */
  const not = RECORD_TYPES.filter((type) => !draft.editable({ type: type as FieldDecl['type'] }));
  assert.deepEqual(not, ['secret']);
});

test('a file opens as its value written out, and goes back as the object the record stores', () => {
  const f = { id: 'receipt', type: 'file' } as unknown as FieldDecl;
  const held = { sha256: 'a'.repeat(64), mime: 'image/png', bytes: 1200, name: 'receipt.png' };
  const opened = draft.draftOf(f, held, null);
  assert.deepEqual(draft.fileOf(opened), held);
  assert.equal(draft.unchanged(f, opened, held, null), true);
  assert.deepEqual(draft.patchOf(f, opened, held, null), { receipt: held });
  assert.deepEqual(draft.patchOf(f, '', held, null), { receipt: null });
  /* A DRAFT THAT NAMES NO FILE IS SAID UNDER THE FIELD, and the hash is held to the record's own test. */
  assert.ok(draft.wrongValue(f, 'receipt.png', held, null) !== null);
  assert.equal(draft.fileOf(JSON.stringify({ ...held, sha256: 'A'.repeat(64) })), null);
});

test('no editable type opens on the words [object Object]', () => {
  /* MEASURED BY THE CHECKER ON 24 SEPTEMBER: with `editable` answering yes to all but `secret`, a `json` cell holding
     `{ a: 1 }` opened in the grid as `[object Object]`, and one character typed after it went back as the string
     `[object Object]x`, which the record's `json` coercion takes as it comes. A `quantity` opened the same way and
     went back as a bare `"3"` the record refuses. Each value below is the shape the kernel's `coerce.ts` stores. */
  const held: Record<string, unknown> = {
    money: { amount: 1250, currency: 'EGP' },
    quantity: { value: 2, unit: 'kg' },
    json: { a: 1 },
    file: { sha256: 'b'.repeat(64), mime: 'application/pdf', bytes: 5120, name: 'receipt.pdf' },
    list: ['rent'],
  };
  for (const type of RECORD_TYPES) {
    const f = { id: 'x', type: type as FieldDecl['type'] } as FieldDecl;
    if (!draft.editable(f)) continue;
    const opened = draft.draftOf(f, held[type] ?? 'plain', 'EGP');
    assert.ok(!opened.includes('[object'), `a ${type} opens as ${opened}`);
  }
});

test('the grid says why a cell is not the editor only for the types it cannot edit, and says it truly', () => {
  /* THE CHECKER'S SECOND REFUSAL. `copy.cellWhy` kept a reason for money, ref, document, instant, duration and bool
     after the grid learnt to edit all six, and the four it still refuses were told "Open the row to change it", when
     the row page asks the same `editable` and does not edit them either. */
  const reasons = Object.keys(copy.cellWhy);
  const edited = reasons.filter((type) => draft.editable({ type: type as FieldDecl['type'] }));
  assert.deepEqual(edited, [], `copy.cellWhy still explains types the grid edits: ${edited.join(', ')}`);
  const refused = RECORD_TYPES.filter((type) => !draft.editable({ type: type as FieldDecl['type'] }));
  const unexplained = refused.filter((type) => copy.cellWhy[type] === undefined);
  assert.deepEqual(unexplained, [], `a refused type falls back to a sentence about no type: ${unexplained.join(', ')}`);
  const said = String((copy as Record<string, unknown>).cellNotEdited instanceof Function ? copy.cellNotEdited('Password', copy.cellWhy.secret ?? '') : '');
  assert.ok(said !== '', 'copy.ts has no cellNotEdited');
  assert.ok(!/open the row/iu.test(said), `the grid sends a reader to a row that cannot change it either: ${said}`);
  assert.ok(!('cellOpensRow' in copy), 'copy.ts still keeps the sentence that sends a reader to the row');
  assert.ok(GRID.includes('copy.cellNotEdited('), 'the grid does not say cellNotEdited when it refuses a cell');
});

/* ── the two screens, read as source, because a Svelte page does not mount under `node --test` ─────────────────── */

test('the grid asks the same question the row page asks about which fields it edits', () => {
  /* THE LIST OF FIVE IS GONE, and no second list has taken its place. */
  assert.ok(!/const EDITABLE\s*=\s*new Set\(\[/u.test(GRID), 'the grid still keeps its own list of editable types');
  const at = GRID.indexOf('const editableHere =');
  assert.ok(at > 0, 'the grid has no editableHere, so this sweep proves nothing');
  const here = GRID.slice(at, GRID.indexOf('};', at));
  assert.ok(/\beditable\(/u.test(here), `the grid's editableHere does not ask field-draft's editable: ${here}`);
  assert.ok(GRID.includes("from '$lib/record/field-draft.ts'"), 'the grid does not import field-draft.ts');
});

/* ASSERTED AS BOOLEANS, because a failed `match` over a screen prints all two hundred thousand characters of it. */
test('a cell save goes through the same three the row page saves through', () => {
  const commit = GRID.slice(GRID.indexOf('function commitEdit('), GRID.indexOf('const copyId ='));
  assert.ok(commit.length > 200, 'commitEdit was not found, so this sweep proves nothing');
  assert.ok(/\bpatchOf\(/u.test(commit), 'a cell save builds its own patch instead of patchOf');
  assert.ok(/\bwrongValue\(/u.test(commit), 'a cell save does not ask wrongValue, so EGP 1.234 would reach the record');
  const open = GRID.slice(GRID.indexOf('function openEditor('), GRID.indexOf('function leftTheRow('));
  assert.ok(/\bdraftOf\(/u.test(open), 'the cell opens on String(value), so a money opens as [object Object]');
  /* A YES OR NO IS A TOGGLE IN THE CELL, NOT A BOX to type `true` into. */
  const editor = GRID.slice(GRID.indexOf('{:else if editing?.seq === seq'), GRID.indexOf("{:else if column.field === 'act'}"));
  assert.ok(editor.includes('type="checkbox"'), 'the grid has no toggle for a yes or no');
});

test('the row page calls the lifted three and keeps no copy of its own', () => {
  for (const name of ['draftOf', 'wrongMoney', 'patchOf'])
    assert.ok(!ROW.includes(`function ${name}(`), `the row page still defines its own ${name}`);
  assert.ok(ROW.includes("from '$lib/record/field-draft.ts'"), 'the row page does not import field-draft.ts');
});

test('both screens open a box on draftOf of the held value and save it through patchOf of what was typed', () => {
  /* THE DURATION FIX IS IN `field-draft.ts`, so it reaches a screen only if that screen hands the three the value the
     row holds and the text in the box, rather than a number it has already turned into something else. */
  const start = ROW.slice(ROW.indexOf('function startEdit('), ROW.indexOf('function stopEdit('));
  assert.ok(start.includes('draftOf(f, row.fields[f.id]'), 'the row page opens its box on something other than the held value');
  const save = ROW.slice(ROW.indexOf('async function saveEdit('), ROW.indexOf('async function saveEdit(') + 2500);
  assert.ok(save.includes("patchOf(f, f.type === 'bool' ? ticked : draft, row.fields[f.id]"), 'the row page saves something other than the box');
  const open = GRID.slice(GRID.indexOf('function openEditor('), GRID.indexOf('function leftTheRow('));
  assert.ok(open.includes('draftOf(f, shown,'), 'the grid opens its box on something other than the value it draws');
  const commit = GRID.slice(GRID.indexOf('function commitEdit('), GRID.indexOf('const copyId ='));
  assert.ok(commit.includes('patchOf(f, typed, shown,'), 'the grid saves something other than the box');
});

test('a duration box says the unit it is typed in, on both screens', () => {
  /* THE NUMBER IN THE BOX MEANS NOTHING WITHOUT ITS UNIT, and a field that names none is said in seconds. The row page
     drew `f.unit` beside the box, so a field with no unit had a bare box, and the grid drew nothing at all. */
  assert.equal(typeof draft.unitOf, 'function', 'field-draft.ts exports no unitOf');
  assert.equal(draft.unitOf(EFFORT), 'h');
  assert.equal(draft.unitOf({ id: 'wait', type: 'duration' }), 's');
  const editor = GRID.slice(GRID.indexOf('{:else if editing?.seq === seq'), GRID.indexOf("{:else if column.field === 'act'}"));
  assert.ok(/f\?\.type === 'duration'[^\n]*unitOf\(f\)/u.test(editor), 'the grid draws no unit beside a duration box');
  assert.ok(/f\.type === 'duration'[^\n]*unitOf\(f\)/u.test(ROW), 'the row page draws no unit beside a duration with none declared');
});
