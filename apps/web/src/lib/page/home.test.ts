/**
 * A declared page drawn as a home (`home.ts`): the blocks that hold nothing are not drawn, a long list folds in place,
 * and the row cursor steps, answers and opens the way Today's did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { LiveBlock } from '../record/page-live.ts';
import { emptyHidden, foldOf, FOLD_AT, holdsNothing, openOf, optionOf, stepRow } from './home.ts';

/** A block as the record answers one, holding nothing unless the case says what. */
const block = (over: Partial<LiveBlock> & { kind: string }): LiveBlock =>
  ({ rows: [], entries: [], matched: [], refusals: [], columns: [], shown: 0, total: 0, drawn: true, stale_at: '', ...over }) as LiveBlock;

const row = (title: string) => ({ key: title, cells: [title] });

/* ── hidden when empty ─────────────────────────────────────────────────────── */

test('A BLOCK THAT HOLDS NOTHING AND SAYS NOTHING ABOUT IT IS NOT DRAWN ON A HOME, at the index it was declared at', () => {
  const figures = block({ kind: 'stat', source: 'figures.home', metrics: [] });
  const runs = block({ kind: 'table', source: 'sessions.live' });
  const tasks = block({ kind: 'todo', source: 'register.tasks', rows: [row('Rent')], shown: 1, total: 1 });
  const out = emptyHidden([figures, runs, tasks]);
  assert.deepEqual(
    out.map((b) => b.drawn),
    [false, false, true],
  );
  assert.equal(out.length, 3, 'a hidden block kept its place, so every write and id after it still finds its block');
  assert.equal(out[2], tasks, 'a block that is drawn is handed on untouched');
});

test('AN EMPTY BLOCK WHOSE AUTHOR WROTE WHAT EMPTY MEANS KEEPS ITS SENTENCE, as Home kept "Nothing waiting"', () => {
  const queue = block({ kind: 'queue', source: 'governance.open', queue: [], empty: 'Nothing is waiting on you.' });
  assert.equal(emptyHidden([queue])[0]!.drawn, true);
  assert.equal(emptyHidden([{ ...queue, empty: '  ' }])[0]!.drawn, false, 'a blank sentence says nothing');
});

test('A REFUSED BLOCK, A SENTENCE AND A WAY TO ADD THE FIRST THING ARE NEVER HIDDEN', () => {
  const refused = block({ kind: 'todo', source: 'register.tasks', refusals: ['tasks has no field "ownr".'] });
  const cannot = block({ kind: 'todo', source: 'register.tasks', cannot: 'This block cannot be drawn here.' });
  const note = block({ kind: 'note', body: 'Morning.' });
  const capture = block({ kind: 'capture', register: 'tasks' });
  assert.deepEqual(
    emptyHidden([refused, cannot, note, capture]).map((b) => b.drawn),
    [true, true, true, true],
  );
});

test('WHAT A BLOCK HOLDS IS READ IN ITS OWN FIELD: figures, questions, a feed, a walk', () => {
  assert.equal(holdsNothing(block({ kind: 'stat', metrics: [{} as never] })), false);
  assert.equal(holdsNothing(block({ kind: 'queue', queue: [{} as never] })), false);
  assert.equal(holdsNothing(block({ kind: 'feed', feed: [{} as never] })), false);
  assert.equal(holdsNothing(block({ kind: 'forecast', walk: {} as never })), false);
  assert.equal(holdsNothing(block({ kind: 'calendar', answer: {} as never })), false, 'a registered kind is read by its own module');
  assert.equal(holdsNothing(block({ kind: 'chips', body: 'Kiln · Bake' })), false, 'what the author wrote on the block is what it holds');
  assert.equal(holdsNothing(block({ kind: 'todo' })), true);
});

test('A SECTION OVER NOTHING GOES WITH ITS BLOCKS, and a section with nothing after it is the author’s divider', () => {
  const empty = block({ kind: 'table', source: 'sessions.live' });
  const full = block({ kind: 'todo', rows: [row('Rent')], total: 1 });
  const out = emptyHidden([block({ kind: 'section', heading: 'Agents' }), empty, block({ kind: 'section', heading: 'Tasks' }), full, block({ kind: 'section', heading: 'End' })]);
  assert.deepEqual(
    out.map((b) => b.drawn),
    [false, false, true, true, true],
  );
});

test('A BLOCK WHOSE `when:` ALREADY SAID NO STAYS NOT DRAWN, and is not copied', () => {
  const off = block({ kind: 'todo', drawn: false });
  assert.equal(emptyHidden([off])[0], off);
});

/* ── the fold ──────────────────────────────────────────────────────────────── */

test('A LONG LIST FOLDS IN PLACE AFTER ITS FIRST ROWS, and "N more" counts the rest', () => {
  assert.deepEqual(foldOf('todo', 12, false), { shown: FOLD_AT, more: 12 - FOLD_AT });
  assert.deepEqual(foldOf('timeline', FOLD_AT + 2, false), { shown: FOLD_AT, more: 2 });
});

test('NOTHING FOLDS ONCE OPENED, FOR ONE ROW, OR ON A KIND THAT IS ONE PICTURE', () => {
  assert.equal(foldOf('todo', 12, true), null, 'an opened fold stays open');
  assert.equal(foldOf('todo', FOLD_AT + 1, false), null, '"1 more" saves nobody any reading');
  assert.equal(foldOf('stat', 40, false), null);
  assert.equal(foldOf('board', 40, false), null);
});

/* ── the row cursor ────────────────────────────────────────────────────────── */

test('THE CURSOR STARTS NOWHERE, AND j FROM NOWHERE IS THE FIRST ROW AND k THE LAST', () => {
  assert.equal(stepRow(5, -1, 1), 0);
  assert.equal(stepRow(5, -1, -1), 4);
  assert.equal(stepRow(0, -1, 1), -1, 'a home with no rows has nowhere to go');
});

test('THE ENDS HOLD, and a place past the end is read as nowhere', () => {
  assert.equal(stepRow(3, 2, 1), 2);
  assert.equal(stepRow(3, 0, -1), 0);
  assert.equal(stepRow(3, 1, 1), 2);
  assert.equal(stepRow(3, 7, 1), 0);
});

test('1 TO 9 ANSWER THE FIRST TO THE NINTH OPTION, and no other key answers', () => {
  assert.equal(optionOf('1'), 0);
  assert.equal(optionOf('9'), 8);
  for (const key of ['0', '10', 'x', 'Enter', '']) assert.equal(optionOf(key), null, key);
});

test('ENTER OPENS WHAT THE ROW CARRIES, else the row’s own page, else nothing', () => {
  assert.equal(openOf('/decide/q_1', 'q:q_1'), '/decide/q_1');
  assert.equal(openOf(undefined, 'tasks#12'), '/r/tasks/12');
  assert.equal(openOf(undefined, 'obligations:3'), '/r/obligations/3');
  assert.equal(openOf(undefined, 'Rent'), null);
  assert.equal(openOf(undefined, undefined), null);
});

/* ── the page that hosts it ────────────────────────────────────────────────── */

const BODY = readFileSync(new URL('./PageBody.svelte', import.meta.url), 'utf8');
const SLOT = readFileSync(new URL('./BlockSlot.svelte', import.meta.url), 'utf8');
const CARD = readFileSync(new URL('./QueueAnswer.svelte', import.meta.url), 'utf8');

test('A HOME DRAWS ITS BLOCKS THROUGH THE EMPTY RULE AND WALKS ROWS, and a page at its own address still walks blocks', () => {
  assert.match(BODY, /mode === 'home' \? emptyHidden\(blocks\) : blocks/);
  assert.match(BODY, /if \(mode === 'home'\) return homeKey\(e\);/);
  for (const key of ["case 'j':", "case 'k':", "case 'x':", "case 'Enter':", "case 'n':", 'optionOf(e.key)'])
    assert.ok(BODY.includes(key), `the home keys lost ${key}`);
  assert.match(BODY, /'\[data-row\], \.block \.list > li\.item'/, 'the rows are found by the renderer’s contract, and its list items until it carries it');
});

test('A HOME FOLDS ITS LONG LISTS AND HANDS THE RENDERER THE ROW CURSOR', () => {
  assert.match(BODY, /fold=\{mode === 'home'\}/);
  assert.match(BODY, /rows=\{mode === 'home' \|\| \(mode === 'page' && host\) \? \{ cursor: cursorIn\(slot\.i\), onrowfocus: rowFocus\(slot\.i\) \} : null\}/);
  assert.match(SLOT, /cursor=\{rows\?\.cursor \?\? null\}/);
  assert.match(SLOT, /onrowfocus=\{rows\?\.onrowfocus\}/);
  assert.match(SLOT, /words\.more\(/);
});

test('A PAGE AT ITS OWN ADDRESS IS WORKED ROW BY ROW TOO, and its rows open beside it, never on a home or a preview', () => {
  assert.match(BODY, /if \(host && rowsNow\(\)\.length > 0\) return homeKey\(e\);/);
  assert.match(BODY, /case 'e': \{\n\s+if \(!host \|\| !record \|\| !host\.open\(record, true\)\) return;/);
  assert.match(BODY, /case 'Delete':\n\s+case 'Backspace': \{\n\s+if \(inPanel \|\| !host/, 'Delete never reaches past the panel to a row');
  assert.match(BODY, /host && mode === 'page' && writes/, 'the renderer is handed onopen and onmenu only where the page hosts its rows');
  assert.match(SLOT, /onopen=\{w \? verbs\?\.onopen : undefined\}/);
  assert.match(SLOT, /onmenu=\{w \? verbs\?\.onmenu : undefined\}/);
});

test('A QUESTION CARD IS A ROW THE CURSOR REACHES, AND ITS NUMBER KEYS PRESS ITS OPTIONS', () => {
  assert.match(CARD, /data-row="q:\{question\.id\}"/);
  assert.match(BODY, /querySelectorAll<HTMLElement>\('\.queue-act'\)\[n\]/);  assert.doesNotMatch(CARD, /export function choose/, 'the card has one way to be answered from the keys, its own buttons');
});

test('"N MORE" HANDS THE FOCUS TO THE FIRST ROW THAT OPENED, so a keyboard is not dropped to the page when the button goes', () => {
  assert.equal((SLOT.match(/onclick=\{\(e\) => void unfold\(e, /g) ?? []).length, 2, 'both folds go through unfold');
  assert.match(SLOT, /\[from\];/);
  assert.match(SLOT, /to\.focus\(\)/);
});

test('THE HEADLINE LINE DROPS A WHOLE AMOUNT’S .00', () => {
  assert.match(SLOT, /symbolText\(text, homeCurrency\(\), block\.kind === 'note' && block\.lead === true\)/);
});
