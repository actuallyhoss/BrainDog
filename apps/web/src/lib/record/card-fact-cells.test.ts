/**
 * A card's facts over a figure laid into its cells (REC-C16): a count as its number, money formatted once, and a fact the
 * record read nothing for drawn as nothing, never "0".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { factCells, factColumnsAt } from './card-fact-cells.ts';

/* The page's own formatter stands in as a stub that says how often it was asked. */
const counting = () => {
  const asked: [number, string][] = [];
  const money = (amount: number, currency: string): string => {
    asked.push([amount, currency]);
    return `${currency} ${(amount / 100).toFixed(2)}`;
  };
  return { asked, money };
};

const COLUMNS = [
  { field: 'name', as: 'title' },
  { field: 'stage' },
  { metric: 'project-open:{{name}}', as: 'fact', label: 'Open' },
  { metric: 'project-owed:{{name}}', as: 'fact', label: 'Owed' },
];

test('each card fills its figure fact cells: a count as its number, money formatted once', () => {
  const { asked, money } = counting();
  const cells = factCells(
    COLUMNS,
    [
      [4, { amount: 125000, currency: 'usd' }],
      [1200, null],
    ],
    money,
  );
  assert.deepEqual(cells, [
    [
      { at: 2, text: '4' },
      { at: 3, text: 'USD 1250.00' },
    ],
    [
      { at: 2, text: '1,200' },
      { at: 3, text: null },
    ],
  ]);
  assert.deepEqual(asked, [[125000, 'USD']], 'the formatter is asked once, for the one money fact');
});

test('a fact the record read nothing for draws nothing, and a nought it read draws 0', () => {
  const { money } = counting();
  const cells = factCells(COLUMNS, [[null, null], [0, { amount: 0.5, currency: 'EUR' }], null, [-0]], money);
  assert.deepEqual(
    cells.map((c) => c.map((x) => x.text)),
    [
      [null, null],
      ['0', null],
      [null, null],
      ['0', null],
    ],
  );
});

test('a block with no fact over a figure fills nothing, and an answer that is not a list reads as no facts', () => {
  const { money } = counting();
  assert.deepEqual(factCells([{ field: 'name', as: 'title' }, { field: 'stage', as: 'fact' }], [[4]], money), []);
  assert.deepEqual(factCells(COLUMNS, { facts: [] }, money), []);
});

test('only the first three facts over a figure have cells', () => {
  const four = ['a', 'b', 'c', 'd'].map((k) => ({ metric: `fig-${k}`, as: 'fact' }));
  assert.deepEqual(factColumnsAt([{ field: 'name', as: 'title' }, ...four]), [1, 2, 3]);
});
