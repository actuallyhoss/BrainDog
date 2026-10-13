import { test } from 'node:test';
import assert from 'node:assert/strict';

import { columnAt, columnOf, columnsOf, dropTarget, lanes, moveTarget, type Moves } from './board.ts';
import type { Component } from 'svelte';
import type { Block as BlockSegment, Row } from './parse.ts';

/** The shape `/p/work` actually declares: state · title · detail. */
const row = (state: string, title: string): Row => ({ cells: [state, title, ''] });

const WORK: Row[] = [
  row('Todo', 'Move kilnfonts off auto-renew'),
  row('Doing', 'Legal review'),
  row('Todo', 'Chase the Fenwick invoice'),
  row('Blocked', 'Waiting on the registrar'),
  row('Done', 'Close the old account'),
];

const COLUMNS = ['Todo', 'Doing', 'Blocked', 'Done'];

const names = (rows: Row[], moved: Moves = {}) => lanes(rows, moved).map((l) => l.name);
const titles = (rows: Row[], moved: Moves, column: string) =>
  lanes(rows, moved)
    .find((l) => l.name === column)
    ?.cards.map((c) => c.row.cells[1]) ?? null;

/* ── the columns ──────────────────────────────────────────────────────────── */

test('the columns are cell 0, deduped, in the order the rows first name them', () => {
  assert.deepEqual(columnsOf(WORK), COLUMNS);
  assert.equal(columnOf(WORK[0]!), 'Todo');
});

test('a row with no cells at all is a column named nothing, not a crash', () => {
  assert.equal(columnOf({ cells: [] }), '');
  assert.deepEqual(columnsOf([{ cells: [] }, { cells: [] }]), ['']);
});

test('a move never adds a column and never removes one', () => {
  // Every card out of Doing. The column stays, because an empty column is somewhere to drop.
  assert.deepEqual(names(WORK, { 1: 'Done' }), COLUMNS);
  // And a move naming a column that does not exist does not invent a fifth stack.
  assert.deepEqual(names(WORK, { 1: 'Archived' }), COLUMNS);
});

/* ── where a card is ──────────────────────────────────────────────────────── */

test('a card is in its declared column until something moves it', () => {
  assert.equal(columnAt(WORK, 0), 'Todo');
  assert.equal(columnAt(WORK, 0, { 0: 'Doing' }), 'Doing');
  // An index nothing is at answers with nothing rather than throwing: the drag can outlive the row.
  assert.equal(columnAt(WORK, 99), '');
});

test('a moved card leaves its old column and lands at the foot of the new one', () => {
  const moved: Moves = { 0: 'Doing' };
  assert.deepEqual(titles(WORK, moved, 'Todo'), ['Chase the Fenwick invoice']);
  // At the FOOT: Legal review was declared in Doing and stays above the card that arrived.
  assert.deepEqual(titles(WORK, moved, 'Doing'), ['Legal review', 'Move kilnfonts off auto-renew']);
});

test('two cards moved into one column keep row order between themselves', () => {
  assert.deepEqual(titles(WORK, { 3: 'Done', 0: 'Done' }, 'Done'), [
    'Close the old account',
    'Move kilnfonts off auto-renew',
    'Waiting on the registrar',
  ]);
});

test('only a card that actually changed column is marked unsaved', () => {
  const marked = (moved: Moves) =>
    lanes(WORK, moved)
      .flatMap((l) => l.cards)
      .filter((c) => c.moved)
      .map((c) => c.at);

  assert.deepEqual(marked({}), []);
  assert.deepEqual(marked({ 0: 'Doing' }), [0]);
  // Named its own column: nothing changed, so there is nothing to mark and nothing to write.
  assert.deepEqual(marked({ 0: 'Todo' }), []);
  // Named a column the board does not have: the card stays where it was declared, unmarked.
  assert.deepEqual(marked({ 0: 'Archived' }), []);
  assert.deepEqual(titles(WORK, { 0: 'Archived' }, 'Todo'), [
    'Move kilnfonts off auto-renew',
    'Chase the Fenwick invoice',
  ]);
});

/* ── the keyboard move ────────────────────────────────────────────────────── */

test('a keyboard move steps one column and does not wrap at either end', () => {
  assert.equal(moveTarget(COLUMNS, 'Todo', 1), 'Doing');
  assert.equal(moveTarget(COLUMNS, 'Doing', -1), 'Todo');
  // The cheapest slip must not be the largest move.
  assert.equal(moveTarget(COLUMNS, 'Done', 1), null);
  assert.equal(moveTarget(COLUMNS, 'Todo', -1), null);
});

test('a keyboard move from a column the board does not have goes nowhere', () => {
  assert.equal(moveTarget(COLUMNS, 'Archived', 1), null);
  assert.equal(moveTarget([], 'Todo', 1), null);
});

/* ── the drop ─────────────────────────────────────────────────────────────── */

test('a drop onto a real, different column is the move', () => {
  assert.equal(dropTarget(COLUMNS, 'Todo', 'Done'), 'Done');
});

test('a drop that changes nothing is refused, so no write is reported', () => {
  assert.equal(dropTarget(COLUMNS, 'Todo', 'Todo'), null);
});

test('a drop carrying a column this board does not have is refused', () => {
  assert.equal(dropTarget(COLUMNS, 'Todo', 'Archived'), null);
  assert.equal(dropTarget(COLUMNS, 'Todo', ''), null);
});

/* ── a card's two verbs, drawn ────────────────────────────────────────────── */

/* The arithmetic above needs no DOM. What a card DRAWS does, and `parity.test.ts` shows the way: Node's module hooks
   hand each `.svelte` file to the compiler and `svelte/server` renders the result to a string. Imported here and not
   at the head of the file, so the tests above stay a read of `board.ts` and nothing else. */
const { readFileSync } = await import('node:fs');
const { registerHooks, stripTypeScriptTypes } = await import('node:module');
const { fileURLToPath } = await import('node:url');
const { compile, compileModule } = await import('svelte/compiler');
const { render } = await import('svelte/server');
const { parse } = await import('./parse.ts');

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

type Open = (row: Row) => void;
type Menu = (row: Row, anchor: unknown) => void;
/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; onmove?: (row: Row, to: string) => void; onopen?: Open; onmenu?: Menu }>;
};

const [segment] = parse('```board\nDoing | Write the notes | Claude\nDone | [Fix login](/r/tasks/4) | Codex\nDoing | ●︎ Proof | Amara\n```', { page: true });
assert.equal(segment?.type, 'block', 'the fixture did not parse as a block');
const BOARD = segment as BlockSegment;

const draw = (props: { onmove?: (row: Row, to: string) => void; onopen?: Open; onmenu?: Menu } = {}): string =>
  render(Block, { props: { block: BOARD, ...props } }).body.replace(/<!--.*?-->/gsu, '');
const opens = (html: string): string[] => [...html.matchAll(/<button [^>]*class="item-open"[^>]*>.*?<\/button>/gsu)].map((m) => m[0]);
const menus = (html: string): string[] => [...html.matchAll(/<button [^>]*class="card-more item-more tap"[^>]*>/gu)].map((m) => m[0]);

test('WITH NO CALLBACK A CARD IS WHAT IT WAS: no button on it, and a title that links still links', () => {
  const bare = draw();
  assert.doesNotMatch(bare, /<button/u);
  assert.match(bare, /<a [^>]*href="\/r\/tasks\/4"[^>]*>Fix login<\/a>/u);
  // Moving a card brings its lane control and neither of the two verbs.
  assert.doesNotMatch(draw({ onmove: () => {} }), /<button/u);
});

test("A CARD'S TITLE IS A BUTTON only where the host opens a card, and it is drawn as its words", () => {
  const drawn = draw({ onopen: () => {} });
  const titles = opens(drawn);
  assert.equal(titles.length, 3, 'one a card');
  for (const t of titles) assert.match(t, /type="button"/u);
  assert.equal(titles.filter((t) => t.includes('Fix login')).length, 1);
  assert.doesNotMatch(drawn, /<a /u, 'a link inside the button would be two targets on one line');
  assert.match(drawn, /<span class="card-title"><button /u, "the button sits in the title's own span, so the card keeps its face");
  assert.equal(titles.filter((t) => t.includes('role="img"')).length, 1, 'the card an agent is on keeps its dot');
  assert.equal(menus(drawn).length, 0, 'opening a card draws no menu');
});

test("A CARD'S MENU IS A QUIET TRAILING CONTROL only where the host has a menu, named for its card", () => {
  const drawn = draw({ onmenu: () => {} });
  const dots = menus(drawn);
  assert.equal(dots.length, 3, 'one a card');
  for (const d of dots) assert.ok(d.includes('data-calm=""') && d.includes('aria-haspopup="menu"') && d.includes('type="button"'), d);
  assert.deepEqual(
    dots.map((d) => /aria-label="([^"]*)"/u.exec(d)?.[1]),
    ['More for Write the notes', 'More for Proof', 'More for Fix login'],
    'by lane, and the name is the title in words: no link, no dot',
  );
  assert.equal(opens(drawn).length, 0, 'a menu makes no title a button');
  assert.match(drawn, /<a [^>]*href="\/r\/tasks\/4"/u, 'so the title still links');
});

test("ON A BOARD THAT MOVES, a card's two controls are tab stops on the one card that holds the board's", () => {
  const drawn = draw({ onmove: () => {}, onopen: () => {}, onmenu: () => {} });
  for (const set of [opens(drawn), menus(drawn)]) {
    assert.equal(set.length, 3);
    assert.equal(set.filter((b) => b.includes('tabindex="0"')).length, 1);
    assert.equal(set.filter((b) => b.includes('tabindex="-1"')).length, 2);
  }
  // The menu is the card's last thing, after the lane control.
  assert.match(drawn, /<\/select>\s*<button [^>]*class="card-more item-more tap"/u);
  // Where nothing moves there is no roving stop to follow, so each control is its own.
  const still = draw({ onopen: () => {}, onmenu: () => {} });
  assert.doesNotMatch([...opens(still), ...menus(still)].join(''), /tabindex/u);
});
