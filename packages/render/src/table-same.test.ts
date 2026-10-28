/**
 * A table keeps the rows it drew when a new answer draws the same (`sameRows`), so its keyed, animated body moves
 * nothing and lays out nothing for rows nobody changed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sameRows, type TableRow } from './table.ts';

const row = (key: string, cells: (string | null)[], more: Partial<TableRow> = {}): TableRow => ({ key, cells, ...more });

test('AN ANSWER THAT SAYS NOTHING NEW IS THE SAME ROWS, and a change of order, cell, tone or link is new', () => {
  const drawn = [row('tasks#1', ['Call the bank', null]), row('tasks#2', ['Pay the rent', '1 Nov'], { tone: 'bad' })];
  assert.equal(sameRows(drawn, [row('tasks#1', ['Call the bank', null]), row('tasks#2', ['Pay the rent', '1 Nov'], { tone: 'bad' })]), true);
  assert.equal(sameRows(drawn, [drawn[1]!, drawn[0]!]), false, 'another order');
  assert.equal(sameRows(drawn, [drawn[0]!, row('tasks#2', ['Pay the rent', '2 Nov'], { tone: 'bad' })]), false, 'a cell said otherwise');
  assert.equal(sameRows(drawn, [drawn[0]!, row('tasks#2', ['Pay the rent', '1 Nov'])]), false, 'a tone gone');
  assert.equal(sameRows(drawn, [drawn[0]!, row('tasks#2', ['Pay the rent', '1 Nov'], { tone: 'bad', arrived: true })]), false, 'a row newly arrived');
  assert.equal(sameRows(drawn, [drawn[0]!]), false, 'a row gone');
});
