import { test } from 'node:test';
import assert from 'node:assert/strict';

import { columnAt, columnOf, columnsOf, dropTarget, lanes, laneShown, moveTarget, type Moves } from './board.ts';
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

/* ── the lane a phone shows ───────────────────────────────────────────────── */

/* ON A PHONE THE BOARD IS ONE LANE AT A TIME: stacked, the lanes were one list 15,000 px
   long. The lane it opens on is where the work is, so the busiest one, and never the last, where work ends up. */
test('a phone opens on the busiest lane before the last, the first of a tie', () => {
  assert.equal(laneShown(lanes(WORK), null), 'Todo');
  const tied = [row('Later', 'Glaze the test tiles'), row('Open', 'Sand the kiln shelf'), row('Done', 'Fire the first batch'), row('Done', 'Sweep the studio'), row('Done', 'Order more clay')];
  assert.equal(laneShown(lanes(tied), null), 'Later', 'Done holds the most and is never the lane a board opens on');
});

test('a lane once chosen stays shown, until the board no longer has it', () => {
  assert.equal(laneShown(lanes(WORK), 'Blocked'), 'Blocked');
  assert.equal(laneShown(lanes(WORK), 'Archived'), 'Todo');
});

test('a board of one lane shows it, and a board of none shows nothing', () => {
  assert.equal(laneShown(lanes([row('Done', 'Fire the first batch')]), null), 'Done');
  assert.equal(laneShown(lanes([]), null), null);
  /* EVERY LANE BEFORE THE LAST LEFT EMPTY BY A MOVE: the board opens on the last, which is where the cards are. */
  assert.equal(laneShown(lanes([row('Open', 'Sand the kiln shelf'), row('Done', 'Fire the first batch')], { 0: 'Done' }), null), 'Done');
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
  assert.doesNotMatch(draw({ onmove: () => {} }), /class="(item-open|card-more)/u);
});

const switches = (html: string): string[] => [...html.matchAll(/<button [^>]*class="board-lane"[^>]*>.*?<\/button>/gsu)].map((m) => m[0]);
const shown = (html: string): string[] => [...html.matchAll(/<div [^>]*class="board-col"[^>]*>/gu)].filter((m) => m[0].includes('data-shown')).map((m) => m[0]);

test('A HOSTED BOARD DRAWS A SWITCH OF ITS LANES, one pressed, and marks the one lane a phone shows', () => {
  for (const props of [{ onmove: () => {} }, { onopen: () => {} }, { onmenu: () => {} }]) {
    const drawn = draw(props);
    const lanesDrawn = switches(drawn);
    assert.equal(lanesDrawn.length, 2, 'one a lane');
    for (const b of lanesDrawn) assert.match(b, /type="button"/u);
    assert.deepEqual(lanesDrawn.map((b) => /aria-pressed="([^"]*)"/u.exec(b)?.[1]), ['true', 'false'], 'Doing holds two and opens; Done is last');
    assert.match(lanesDrawn[0]!, />Doing<span class="board-count num">2<\/span>/u);
    assert.match(drawn, /<div [^>]*role="group"[^>]*aria-label="Columns"|<div [^>]*aria-label="Columns"[^>]*role="group"/u);
    assert.equal(shown(drawn).length, 1, 'one lane shown on a phone');
    assert.match(drawn, /<div [^>]*class="grid"[^>]*data-lanes/u);
  }
});

test('A STATIC BOARD DRAWS NO SWITCH: it has nothing to turn it with, and the mirror stacks its lanes', () => {
  const bare = draw();
  assert.equal(switches(bare).length, 0);
  assert.equal(shown(bare).length, 0);
  assert.doesNotMatch(bare, /data-lanes/u);
});

test("WHERE A CARD HAS A MENU, ITS LANE CONTROL IS NOT DRAWN UNDER IT: the menu's Move to does that", () => {
  assert.match(draw({ onmove: () => {}, onmenu: () => {} }), /<div [^>]*class="grid"[^>]*data-menu/u);
  assert.doesNotMatch(draw({ onmove: () => {} }), /data-menu/u, 'with no menu the select is the only way to move a card on a phone');
  const css = readFileSync(new URL('../../skin/kinds/board.css', import.meta.url), 'utf8');
  assert.match(css, /\.grid\[data-menu\] \.board-move:not\(:focus-visible\)/u, 'the select under every card is still drawn');
  assert.match(css, /\.grid\[data-lanes\] \.board-col:not\(\[data-shown\]\)\s*\{\s*display: none;/u, 'a phone still stacks every lane');
  assert.match(css, /\.board-lanes\s*\{[^}]*display: none;/u, 'the switch is drawn where the lanes stand side by side');
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
