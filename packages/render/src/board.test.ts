import { test } from 'node:test';
import assert from 'node:assert/strict';

import { columnAt, columnOf, columnsOf, dropTarget, lanes, moveTarget, type Moves } from './board.ts';
import type { Row } from './parse.ts';

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
