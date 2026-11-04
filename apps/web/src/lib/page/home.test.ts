/**
 * A declared page drawn as a home (`home.ts`): the blocks that hold nothing are not drawn, a long list folds in place,
 * and the row cursor steps, answers and opens the way Today's did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { LiveBlock } from '../record/page-live.ts';
import type { Entry } from '../record/schema.ts';
import type { BlockResult, PageRow } from '@braindog/kernel';
import { arranged, bare, emptyHidden, foldOf, FOLD_AT, holdsNothing, leadOf, markDrawn, openOf, optionOf, rowKeys, stepRow, unsaid, wholeKey, type Why } from './home.ts';

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
  const note = block({ kind: 'note', body: 'Morning.' });
  const capture = block({ kind: 'capture', register: 'tasks' });
  assert.deepEqual(
    emptyHidden([refused, note, capture]).map((b) => b.drawn),
    [true, true, true],
  );
});

test('A BLOCK THIS BUILD CANNOT DRAW IS NOT DRAWN, nor a section over only that, and a refused one that also cannot still is', () => {
  const cannot = block({ kind: 'todo', source: 'sessions.live', cannot: 'This part of the page cannot be drawn yet.' });
  assert.equal(emptyHidden([cannot])[0]!.drawn, false);
  assert.equal(emptyHidden([{ ...cannot, refusals: ['sessions has no field "who".'] }])[0]!.drawn, true, 'a refusal names a fix somebody has to see');
  assert.deepEqual(
    emptyHidden([block({ kind: 'section', heading: 'Working now' }), cannot]).map((b) => b.drawn),
    [false, false],
  );
});

test('WHAT A BLOCK HOLDS IS READ IN ITS OWN FIELD: figures, questions, a feed, a walk', () => {
  assert.equal(holdsNothing(block({ kind: 'stat', metrics: [{} as never] })), false);
  assert.equal(holdsNothing(block({ kind: 'queue', queue: [{} as never] })), false);
  assert.equal(holdsNothing(block({ kind: 'feed', feed: [{} as never] })), false);
  assert.equal(holdsNothing(block({ kind: 'forecast', walk: {} as never })), false);
  assert.equal(holdsNothing(block({ kind: 'calendar', answer: {} as never })), false, 'a registered kind is read by its own module');
  assert.equal(holdsNothing(block({ kind: 'chips', body: 'Kiln · Oxbow' })), false, 'what the author wrote on the block is what it holds');
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

/* ── one empty line a page ─────────────────────────────────────────────────── */

/** A row as a block's `matched` holds it: its number and its fields. */
const entry = (seq: number, fields: Entry['fields']): Entry => ({ seq, fields, version: 1, created: '', by: '' });

test('ONE EMPTY LINE A PAGE, ON ITS LEAD: an empty Work draws the field to add and one sentence, not a tile a list', () => {
  /* Every block on Work carries an `empty:`, and an empty list drew each of them. */
  const capture = block({ kind: 'capture', register: 'tasks' });
  const today = block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' });
  const late = block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing of yours is late.' });
  const agent = block({ kind: 'todo', source: 'register.tasks', empty: 'No agent holds a task.' });
  const pace = block({ kind: 'stat', source: 'figures.work', metrics: [], empty: 'Nothing done yet.' });
  const out = emptyHidden([capture, today, late, agent, pace]);
  assert.deepEqual(
    out.map((b) => b.drawn),
    [true, true, false, false, false],
  );
  assert.equal(leadOf([capture, today, late]), 1, 'the field to type into frames the page and is not its lead');
});

test('A PAGE WHOSE LEAD HOLDS SOMETHING DRAWS NO EMPTY LINE AT ALL, a sentence or a refusal leading as well', () => {
  const cash = block({ kind: 'stat', source: 'figures.home', metrics: [{} as never] });
  const orgs = block({ kind: 'bar', source: 'register.organisations', empty: 'No organisation lists an account yet.' });
  assert.deepEqual(
    emptyHidden([cash, orgs]).map((b) => b.drawn),
    [true, false],
    'Today said what you have, then that no organisation lists an account',
  );
  const lead = block({ kind: 'note', lead: true, body: 'Nothing is late.' } as never);
  assert.deepEqual(
    emptyHidden([lead, block({ kind: 'queue', source: 'governance.open', queue: [], empty: 'Nothing is waiting on you.' })]).map((b) => b.drawn),
    [true, false],
  );
  const refused = block({ kind: 'todo', source: 'register.tasks', refusals: ['tasks has no field "ownr".'] });
  assert.deepEqual(
    emptyHidden([refused, block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' })]).map((b) => b.drawn),
    [true, false],
  );
});

test('THE LEAD IS THE FIRST BLOCK THAT SAYS ANYTHING, so an empty block with no sentence does not take the line from the next', () => {
  const runs = block({ kind: 'table', source: 'sessions.live' });
  const tasks = block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' });
  assert.deepEqual(
    emptyHidden([runs, tasks]).map((b) => b.drawn),
    [false, true],
  );
  assert.equal(leadOf([runs]), -1, 'a page that says nothing has no lead');
});

test('A CHART OVER WHAT NO ROW HAS SAID IS NOT DRAWN, its empty line or not, and a list of the same rows still is', () => {
  /* No project has a health: "How they are going" was one track, all "Not said yet". */
  const health = block({ kind: 'split', source: 'metric.projects-by-health', parts: { metric: 'projects-by-health', value: 11, groups: [], more: 0 }, empty: 'No project is in play.' });
  assert.equal(unsaid(health), true);
  assert.deepEqual(emptyHidden([health]).map((b) => b.drawn), [false], 'it was the lead and still says nothing');
  const said = { ...health, parts: { metric: 'projects-by-health', value: 11, groups: [{ key: 'on_track', value: 4 }], more: 0 } };
  assert.equal(unsaid(said), false);
  /* A FIGURE THAT READ NO ROW AT ALL is not this: it holds nothing, and as the lead it says its one line. */
  const none = { ...health, parts: { metric: 'projects-by-health', value: 0, groups: [], more: 0 } };
  assert.equal(unsaid(none), false);
  assert.equal(holdsNothing(none), true);
  assert.deepEqual(emptyHidden([none, block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' })]).map((b) => b.drawn), [true, false]);

  /* No project says what it earns: a bar of nothing over its empty line. */
  const projects = [entry(1, { name: 'Oxbow', revenue: null }), entry(2, { name: 'Pinwheel' })];
  const earns = block({ kind: 'bar', source: 'register.things', register: 'things', columns: [{ field: 'name' }, { field: 'revenue' }] as never, matched: projects, entries: projects, total: 2, empty: 'No project in play says what it earns.' });
  assert.equal(unsaid(earns), true);
  assert.equal(unsaid({ ...earns, matched: [entry(1, { name: 'Oxbow', revenue: { amount: 10_500_000, currency: 'USD' } })] }), false);
  const list = block({ kind: 'todo', source: 'register.things', register: 'things', columns: [{ field: 'name' }, { field: 'revenue' }] as never, matched: projects, entries: projects, rows: [row('Oxbow'), row('Pinwheel')], total: 2 });
  assert.equal(unsaid(list), false, 'a list draws its rows’ names whatever else is empty');
  assert.deepEqual(emptyHidden([earns, list]).map((b) => b.drawn), [false, true]);

  /* A RANGE IS ITS BANDS: nothing spent yet is "Not spent" on each band, and a range with no band at all says nothing. */
  const quotes = [entry(1, { name: 'Design', low: { amount: 100_000, currency: 'GBP' }, high: { amount: 200_000, currency: 'GBP' } })];
  const range = block({ kind: 'progress', range: true, register: 'quotes', columns: [{ field: 'name' }, { field: 'spent' }, { field: 'low' }, { field: 'high' }] as never, matched: quotes, entries: quotes, total: 1 } as never);
  assert.equal(unsaid(range), false, 'a range nothing is spent on is still every band it was given');
  assert.equal(unsaid({ ...range, matched: [entry(1, { name: 'Design', spent: { amount: 5_000, currency: 'GBP' } })] }), true);
});

test('A FIGURE OVER A FIELD NOBODY FILLED IN GOES FROM ITS ROW, and a row of nothing else goes whole', () => {
  const earning = { id: 'projects-earning', label: 'Earning', value: '£0', note: 'Nothing matched, so there is nothing to add up.', unsaid: true };
  const live = { id: 'projects-live', label: 'In play', value: '11', note: '' };
  const [both] = emptyHidden([block({ kind: 'stat', metrics: [live, earning] })]);
  assert.equal(both!.drawn, true);
  assert.deepEqual(both!.metrics?.map((m) => m.label), ['In play']);
  assert.deepEqual(emptyHidden([block({ kind: 'stat', metrics: [earning] })]).map((b) => b.drawn), [false]);
});

test('A FIGURE OVER A LIST THAT HOLDS NOTHING IS NOT NEWS: an empty Work draws no "Done in 7 days 0"', () => {
  /* Zero held is not news at all, as the record says it; zero matched over rows that exist is, and stays. */
  const done = { id: 'tasks-done-7d', label: 'Done in 7 days', value: '0', note: '', nothingHeld: true };
  const late = { id: 'tasks-late', label: 'Late', value: '0', note: '' };
  const capture = block({ kind: 'capture', register: 'tasks' });
  const today = block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' });
  const pace = block({ kind: 'stat', metrics: [done], empty: 'Nothing done yet.' });
  assert.equal(holdsNothing(pace), true);
  assert.deepEqual(
    emptyHidden([capture, today, pace]).map((b) => b.drawn),
    [true, true, false],
    'the field to add the first task, one sentence, and no tile of zeros',
  );
  const [both] = emptyHidden([block({ kind: 'stat', metrics: [done, late] })]);
  assert.deepEqual(both!.metrics?.map((m) => m.label), ['Late'], 'nothing late out of tasks that exist is still said');

  /* AS THE LEAD IT SAYS ITS ONE LINE, and not its zeros: the tile goes and the sentence takes its place. */
  const [lead] = emptyHidden([pace, today]);
  assert.equal(lead!.drawn, true);
  assert.deepEqual(lead!.metrics, [], 'a lead of nothing but zeros over nothing draws its empty line');
  /* AND A PAGE AT ITS OWN ADDRESS KEEPS ONE SENTENCE, never the zeros it would otherwise fall back on. */
  const [kept] = emptyHidden([block({ kind: 'stat', metrics: [done] })], true);
  assert.equal(kept!.drawn, true);
  assert.deepEqual(kept!.metrics, []);
});

test('A PAGE AT ITS OWN ADDRESS SAYS ONE SENTENCE WHERE IT WOULD SAY NOTHING, and a home says nothing', () => {
  const tasks = block({ kind: 'todo', source: 'register.tasks' });
  const runs = block({ kind: 'table', source: 'sessions.live' });
  assert.deepEqual(emptyHidden([block({ kind: 'section', heading: 'Today' }), tasks, runs], true).map((b) => b.drawn), [true, true, false], 'the first block says the list holds nothing yet, under its heading');
  assert.deepEqual(emptyHidden([tasks, runs]).map((b) => b.drawn), [false, false]);
  const cannot = block({ kind: 'todo', source: 'sessions.live', cannot: 'This part of the page cannot be drawn yet.' });
  assert.deepEqual(emptyHidden([cannot, tasks], true).map((b) => b.drawn), [false, true], 'a block this build cannot draw is never the one kept');
});

/* ── the record's flag ─────────────────────────────────────────────────────── */

/* THE SAME ANSWERS AS THE KERNEL'S `drawn.test.ts`, over the app's shape: this file's rule is that one's copy until
   `@braindog/kernel` exports it, and the two are held equal by holding each to the same cases. */
const whyOf = (b: object): Why | undefined => (b as { why?: Why }).why;
const whys = (blocks: readonly LiveBlock[]): string[] => blocks.map((b) => (b.drawn ? 'drawn' : (whyOf(b) ?? 'no why')));
const held = (title: string, fields: Record<string, unknown> = {}) => ({ id: title, fields }) as unknown as Entry;
const full = () => block({ kind: 'table', rows: [row('Rent')], entries: [held('Rent')], shown: 1, total: 1 });

test('EACH WHY: a list of nothing is empty, a chart of a field nobody filled is unsaid, a when that said no is when, and cannot', () => {
  const chips = block({ kind: 'chips', columns: [{ field: 'health' }] as LiveBlock['columns'], matched: [held('Kiln', { health: null }), held('Oxbow', { health: '' })], rows: [row('Kiln')] });
  const out = markDrawn([
    full(),
    block({ kind: 'todo', empty: 'Nothing due today.' }),
    chips,
    block({ kind: 'note', body: 'Heads up', drawn: false }),
    block({ kind: 'todo', cannot: 'This part of the page cannot be drawn yet.' }),
  ]);
  assert.deepEqual(whys(out), ['drawn', 'empty', 'unsaid', 'when', 'cannot']);
});

test('THE RECORD LEFT IT OUT, SO IT IS OUT: a block the record marked keeps its mark, and the rest are judged here', () => {
  const marked = { ...full(), drawn: false, why: 'empty' } as LiveBlock;
  const out = emptyHidden([marked, block({ kind: 'todo' }), full()]);
  assert.equal(out[0], marked, 'the record\'s flag is read as it came');
  assert.deepEqual(whys(out), ['empty', 'empty', 'drawn']);
});

test('EMPTY: KEEP keeps a block that holds nothing, and its noughts', () => {
  const nought = { id: 'costs', label: 'Costs a year', nothingHeld: true } as never;
  const ledger = block({ kind: 'stat', metrics: [nought], empty: 'keep' });
  assert.equal(bare(ledger), false);
  const out = emptyHidden([full(), ledger]);
  assert.equal(out[1]!.drawn, true);
  assert.equal(out[1]!.metrics?.length, 1, 'its nought is still there');
  assert.equal(emptyHidden([full(), { ...ledger, empty: 'Nothing costs a year yet.' }])[1]!.drawn, false);
});

test('A SECTION HEADS ITS OWN COLUMN, and one carrying a host panel stays', () => {
  const out = emptyHidden([
    block({ kind: 'section', heading: 'Heads up' }),
    block({ kind: 'note', body: 'Rail note', area: 'rail' } as Partial<LiveBlock> & { kind: string }),
    block({ kind: 'todo' }),
    block({ kind: 'section', heading: 'Actions', panel: 'actions' } as Partial<LiveBlock> & { kind: string }),
    block({ kind: 'todo' }),
    full(),
  ]);
  assert.deepEqual(whys(out), ['empty', 'drawn', 'empty', 'drawn', 'empty', 'drawn']);
});

test('ARRANGING STILL DRAWS EVERY BLOCK the record left out, but one whose when said no', () => {
  const marked = markDrawn([full(), block({ kind: 'todo' }), block({ kind: 'note', drawn: false })]);
  assert.deepEqual(whys(marked), ['drawn', 'empty', 'when']);
  const laid = arranged(marked);
  assert.deepEqual(laid.map((b) => b.drawn), [true, true, false]);
  assert.equal(whyOf(laid[1]!), undefined);
  assert.equal(leadOf(laid), 0);
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

test('TWO LISTS IN ONE BLOCK THAT NUMBER THEIR ROWS ALIKE ARE STILL SIX ROWS, so j walks past the first three', () => {
  /* Kiln's notes draw two lists, each `0 1 2`. With one key for two rows the cursor found the fourth as the first, and
     `j` went round the same rows for ever. */
  const keys = rowKeys([
    { slot: 'b-11', row: '0' },
    { slot: 'b-11', row: '1' },
    ...['0', '1', '2', '0', '1', '2'].map((row) => ({ slot: 'b-12', row })),
  ]);
  assert.equal(new Set(keys).size, keys.length, keys.join(' '));
  assert.deepEqual(keys.slice(2), ['b-12|0', 'b-12|1', 'b-12|2', 'b-12|@3', 'b-12|@4', 'b-12|@5']);
  keys.forEach((key, at) => assert.equal(keys.indexOf(key), at, 'each row is found where it is drawn'));
});

test('A ROW WITH NO ID IS HELD BY ITS PLACE IN ITS BLOCK, and a whole block by a key no row can have', () => {
  assert.deepEqual(rowKeys([{ slot: 'b-1', row: undefined }, { slot: 'b-1', row: 'tasks#3' }, { slot: 'b-2', row: undefined }]), ['b-1|@0', 'b-1|tasks#3', 'b-2|@0']);
  assert.equal(wholeKey('b-8'), 'b-8|@block');
  assert.ok(!rowKeys([{ slot: 'b-8', row: 'block' }]).includes(wholeKey('b-8')));
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
  assert.match(BODY, /const quiet = \$derived\(\s*judgedWith\(blocks, held, \(bs\) => emptyHidden\(bs, mode === 'page'\)\)/, 'a page at its own address keeps one sentence where it would say nothing');
  assert.match(BODY, /const drawable = \$derived\(mode === 'preview' \|\| arranging \? arranged\(blocks\) : quiet\);/, 'every page being read hides its empty blocks; authoring draws them all, the record\'s marks undone');
  assert.match(BODY, /if \(mode === 'home'\) return homeKey\(e\);/);
  for (const key of ["case 'j':", "case 'k':", "case 'x':", "case 'Enter':", "case 'n':", 'optionOf(e.key)'])
    assert.ok(BODY.includes(key), `the home keys lost ${key}`);
  assert.match(BODY, /'\[data-row\], \.block \.list > li\.item'/, 'the rows are found by the renderer’s contract, and its list items until it carries it');
});

test('A HOME FOLDS ITS LONG LISTS AND HANDS THE RENDERER THE ROW CURSOR', () => {
  /* A HOME ASKED TO DRAW ITS LISTS WHOLE DOES NOT FOLD (Scripts). */
  assert.match(BODY, /fold=\{mode === 'home' && !unfolded\}/);
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
  assert.equal((SLOT.match(/onclick=\{\(e\) => \(?(?:fold \? )?void unfold\(e, /g) ?? []).length, 4, 'every fold goes through unfold: a table, a segment, Home`s own list and a queue');
  assert.match(SLOT, /\[from\];/);
  assert.match(SLOT, /to\.focus\(\)/);
});

test('THE HEADLINE LINE DROPS A WHOLE AMOUNT’S .00', () => {
  /* AND EVERY SENTENCE DOES, the headline among them: a sentence is a display figure, as the tile beside it is. */
  assert.match(SLOT, /symbolText\(text, homeCurrency\(\), block\.kind === 'note'\)/);
});

/* ── the kernel's cases, through this file ─────────────────────────────────── */

/* THE SAME CASES AS `packages/kernel/test/drawn.test.ts`, asked of `home.ts`, which hands the kernel's rule on. A home
   that answered any of them otherwise would be drawing a page the record does not, so each one is held here too. The
   blocks are the record's own shape (`BlockResult`), as the kernel's test builds them. */

type Readings = NonNullable<BlockResult['readings']>;

const rec = (over: Partial<BlockResult> & { kind: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...over });

const line = (fields: PageRow['fields']): PageRow => ({
  id: 'r',
  register: 'projects',
  seq: 1,
  fields,
  state: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
});

const recWhys = (blocks: readonly BlockResult[]): (Why | 'drawn' | 'no why')[] => blocks.map((b) => (b.drawn === false ? (whyOf(b) ?? 'no why') : 'drawn'));
const oneRow = (): BlockResult => rec({ kind: 'table', rows: [line({ a: 1 })], matched: 1 });

test('THE KERNEL: EACH WHY, a list of nothing is empty, a chart of a field nobody filled is unsaid, a when that said no is when', () => {
  const blocks = [
    rec({ kind: 'table', source: 'register.tasks', rows: [line({ title: 'Ship it' })], matched: 1 }),
    rec({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' }),
    rec({ kind: 'chips', source: 'register.projects', columns: [{ field: 'health' }], rows: [line({ health: null }), line({ health: '' })], matched: 2 }),
    rec({ kind: 'note', heading: 'Heads up', drawn: false }),
  ];
  assert.deepEqual(recWhys(markDrawn(blocks)), ['drawn', 'empty', 'unsaid', 'when']);
});

test('THE KERNEL: CANNOT, a block the reader cannot draw goes, and one the record refused stays to say its fix', () => {
  const cannot = { ...rec({ kind: 'table' }), cannot: 'This part of the page cannot be drawn yet.' };
  const refused = rec({ kind: 'table', refusals: [{ code: 'DECLARATION_INVALID', fix: 'Name a list.' }] });
  const out = emptyHidden([rec({ kind: 'table', rows: [line({ title: 'a' })], matched: 1 }), cannot, refused]);
  assert.deepEqual(out.map((b) => whyOf(b) ?? 'drawn'), ['drawn', 'cannot', 'drawn']);
});

test('THE KERNEL: THE LEAD KEEPS ITS ONE EMPTY LINE, and the empty blocks after it say nothing', () => {
  const blocks = [
    rec({ kind: 'section', heading: 'Today' }),
    rec({ kind: 'todo', empty: 'Nothing due today.' }),
    rec({ kind: 'timeline', empty: 'Nothing of yours is late.' }),
    rec({ kind: 'table', rows: [line({ title: 'a' })], matched: 1 }),
  ];
  assert.equal(leadOf(blocks), 1);
  assert.deepEqual(recWhys(markDrawn(blocks)), ['drawn', 'drawn', 'empty', 'drawn']);
  assert.deepEqual(recWhys(markDrawn([blocks[3]!, blocks[1]!])), ['drawn', 'empty'], 'a lead that holds something leaves no empty line');
});

test('THE KERNEL: EMPTY: KEEP keeps a block that holds nothing, and its noughts', () => {
  const idle = { metric: 'costs-year', reading: { value: 0, unit: 'GBP', rows: 0, held: 0, refusals: [], met: null } };
  const ledger = rec({ kind: 'stat', cells: [{ metric: 'costs-year' }], readings: [idle] as unknown as Readings, empty: 'keep' });
  assert.equal(bare(ledger), false);
  const [kept] = markDrawn([oneRow(), ledger]).slice(1);
  assert.equal(kept!.drawn, undefined);
  assert.equal(kept!.readings?.length, 1, 'its nought is still there');
  const out = markDrawn([oneRow(), { ...ledger, empty: 'Nothing costs a year yet.' }]);
  assert.equal(whyOf(out[1]!), 'empty', 'without the key, the row that held nothing else goes');
});

test('THE KERNEL: A FIGURE THAT SAYS NOTHING GOES FROM ITS ROW, and the figure beside it stays', () => {
  const read = (metric: string, n: number) => ({ metric, reading: { value: n, unit: null, rows: n, held: n, refusals: [], met: null } });
  const stat = rec({ kind: 'stat', cells: [{ metric: 'a' }, { metric: 'b' }], readings: [read('a', 0), read('b', 3)] as unknown as Readings });
  const [out] = markDrawn([stat]);
  assert.deepEqual(out!.readings?.map((r) => r.metric), ['b']);
});

test("THE KERNEL: A FIGURE'S PARTS that no row sits in are unsaid; a figure that read no row at all holds nothing", () => {
  const parts = (value: number, groups: unknown[]) =>
    rec({ kind: 'split', source: 'metric.earning-by-project', readings: [{ metric: 'earning-by-project', reading: { value, unit: null, rows: 4, refusals: [], met: null, groups } }] as unknown as Readings });
  assert.equal(unsaid(parts(0, [{ key: 'a', value: null }, { key: 'b', value: null }])), true);
  assert.equal(unsaid(parts(5, [])), true);
  assert.equal(unsaid(parts(5, [{ key: 'a', value: 5 }])), false);
  assert.equal(bare(parts(0, [])), true);
});

test('THE KERNEL: A SECTION OVER NOTHING GOES WITH ITS BLOCKS, in its own column; one with a panel, or over nothing at all, stays', () => {
  const blocks = [
    rec({ kind: 'section', heading: 'Heads up', box: true }),
    rec({ kind: 'note', heading: 'Rail note', area: 'rail' }),
    rec({ kind: 'todo', drawn: false }),
    rec({ kind: 'section', heading: 'Actions', panel: 'actions' }),
    rec({ kind: 'todo' }),
    oneRow(),
    rec({ kind: 'section', heading: 'The end' }),
  ];
  assert.deepEqual(recWhys(markDrawn(blocks)), ['empty', 'drawn', 'when', 'drawn', 'empty', 'drawn', 'drawn']);
});

test('THE KERNEL: A PAGE AT ITS OWN ADDRESS IS NEVER EMPTIED, it keeps the first block, which says its one sentence', () => {
  const blocks = [rec({ kind: 'section', heading: 'Tasks' }), rec({ kind: 'table', empty: 'Nothing in Tasks yet.' }), rec({ kind: 'todo' })];
  assert.deepEqual(recWhys(markDrawn(blocks, true)), ['drawn', 'drawn', 'empty']);
  assert.deepEqual(recWhys(emptyHidden([blocks[2]!], true)), ['drawn']);
  assert.deepEqual(recWhys(emptyHidden([blocks[2]!], false)), ['empty']);
});

test('THE KERNEL: A REGISTERED KIND, A SENTENCE AND A FIELD TO TYPE INTO are never called empty', () => {
  const out = markDrawn([rec({ kind: 'calendar' }), rec({ kind: 'note' }), rec({ kind: 'capture' }), oneRow()]);
  assert.deepEqual(recWhys(out), ['drawn', 'drawn', 'drawn', 'drawn']);
});

test('THE KERNEL: ARRANGING STILL DRAWS EVERY BLOCK, but one whose when said no', () => {
  const marked = markDrawn([oneRow(), rec({ kind: 'todo' }), rec({ kind: 'chips', columns: [{ field: 'h' }], rows: [line({ h: null })], matched: 1 }), rec({ kind: 'note', drawn: false })]);
  const laid = arranged(marked);
  assert.deepEqual(laid.map((b) => b.drawn !== false), [true, true, true, false]);
  assert.equal(whyOf(laid[1]!), undefined);
  assert.deepEqual(recWhys(emptyHidden(marked, true)), recWhys(marked), 'judging the marked answer again changes nothing');
});

test('THE KERNEL: A BLOCK WRITTEN OUT IN THE PAGE HOLDS WHAT ITS AUTHOR WROTE, and one with no cells written is still empty', () => {
  const written = { ...rec({ kind: 'ring' }), authored: [{ cells: ['Done', '3', '5'] }] } as BlockResult;
  const ring = { ...rec({ kind: 'ring' }), authored: [] } as BlockResult;
  const lead = { ...rec({ kind: 'note' }), body: 'Lead' } as BlockResult;
  assert.deepEqual(recWhys(markDrawn([lead, written, ring])), ['drawn', 'drawn', 'empty']);
});

test('THE RULE IS THE KERNEL’S, NOT A COPY: home.ts hands it on in one line and defines none of it', () => {
  const src = readFileSync(new URL('./home.ts', import.meta.url), 'utf8');
  assert.match(src, /^export \{[^}]*\bemptyHidden\b[^}]*\} from '@braindog\/kernel';$/m);
  assert.doesNotMatch(
    src,
    /\b(function (emptyHidden|holdsNothing|unsaid|leadOf|markDrawn|arranged|goneWhy)\b|const (bare|gone|says|keeps|registered|KEEP|WHY|KEPT)\b|type (Drawable|Why) =)/,
    'a second copy of the rule drifts from the record',
  );
});

test('A NOTE THAT IS ONE LINK IS A 44 TARGET UNDER A THUMB, by the token and on a coarse pointer only', () => {
  /* Today's line on the vital signs is a note whose words are the link (`signsLine`); it measured 181 by 19 at 320 to 640. */
  assert.match(
    BODY,
    /@media \(pointer: coarse\) \{\s*\.block-slot > :global\(\.block\[data-kind='note'\] p > a:only-child\) \{\s*display: inline-flex;\s*align-items: center;\s*min-block-size: var\(--tap\);\s*\}\s*\}/u,
  );
});
