/**
 * A table row as a phone card: the lead, the figure and at most two unlabelled values, never "#", a
 * missing mark or an id. `cardPlan` decides once per table which
 * columns may be drawn; `cardCells` decides per row which of them have something to say.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_VALUES, cardCells, cardPlan, type Column, type PhoneCard } from '../svelte/types.ts';
import { MISSING } from './format.ts';

const col = (over: Partial<Column> & { label: string }): Column => ({ field: over.label.toLowerCase(), width: '1fr', ...over });

/** A money list as a page declares it: a description, who, the amount, the day it is due, a note. */
const PAYMENTS: Column[] = [
  col({ label: 'Description', align: 'start', truncate: 'end' }),
  col({ label: 'Who', align: 'start', truncate: 'end' }),
  col({ label: 'Amount', align: 'end', truncate: 'never' }),
  col({ label: 'Due', align: 'end', truncate: 'end' }),
  col({ label: 'Note', align: 'start', truncate: 'end' }),
];

/** What one card says, as the words a reader sees, lead first. */
const said = (card: PhoneCard): string[] =>
  [card.title, card.mark, ...card.start, ...card.end].flatMap((c) => (c ? [c.value] : []));

test('A CARD LEADS WITH THE TEXT, ENDS ITS FIRST LINE ON THE FIGURE AND HOLDS TWO MORE VALUES AT MOST', () => {
  const plan = cardPlan(PAYMENTS);
  assert.equal(plan.title, 0);
  assert.equal(plan.mark, 2);
  const card = cardCells({ key: 'r', cells: ['Rent', 'Pell & Vine', '£1,200.00', '3 Sep', 'standing order'] }, PAYMENTS, plan);
  assert.equal(card.title?.value, 'Rent');
  assert.equal(card.mark?.value, '£1,200.00');
  assert.equal(card.start.length + card.end.length, CARD_VALUES, 'the second line holds more than two values');
  // In column order: who, then the due day. The note is the third and does not fit.
  assert.deepEqual(said(card), ['Rent', '£1,200.00', 'Pell & Vine', '3 Sep']);
  // Text at the start of the second line, quantities at its end.
  assert.deepEqual(card.start.map((c) => c.column.label), ['Who']);
  assert.deepEqual(card.end.map((c) => c.column.label), ['Due']);
});

test('AN EMPTY VALUE IS DROPPED, and the next value that is there takes its place on the second line', () => {
  for (const blank of [null, '', '   ', MISSING]) {
    const card = cardCells({ key: 'r', cells: ['Rent', blank, '£1,200.00', '3 Sep', 'standing order'] }, PAYMENTS);
    // The note moves up into the second value; it is text, so it sits at the line's start and the day at its end.
    assert.deepEqual(said(card), ['Rent', '£1,200.00', 'standing order', '3 Sep'], `a ${JSON.stringify(blank)} was drawn or kept its place`);
  }
  // A row with nothing past its title draws a title and nothing else: no mark stands in for a value.
  const bare = cardCells({ key: 'r', cells: ['Rent'] }, PAYMENTS);
  assert.deepEqual(said(bare), ['Rent']);
  assert.equal(bare.mark, null);
});

test('A MISSING TITLE LEAVES ITS PLACE EMPTY, and the next column is not promoted into the lead', () => {
  const card = cardCells({ key: 'r', cells: [null, 'Pell & Vine', '£1,200.00'] }, PAYMENTS);
  assert.equal(card.title, null);
  assert.equal(card.mark?.value, '£1,200.00');
  assert.deepEqual(card.start.map((c) => c.value), ['Pell & Vine']);
});

test('NO "#", NO ID AND NO CONTROL: the register\'s number, an identifier column and a row picker never reach a card', () => {
  const columns: Column[] = [
    col({ label: 'Select', hideLabel: true }),
    col({ label: '#', align: 'end', truncate: 'middle' }),
    col({ label: 'Reference', truncate: 'middle' }),
    ...PAYMENTS,
  ];
  const plan = cardPlan(columns);
  const placed = [plan.title, plan.mark, ...plan.start, ...plan.end];
  for (const i of [0, 1, 2]) assert.ok(!placed.includes(i), `${columns[i]!.label} is on the card`);
  assert.equal(columns[plan.title]?.label, 'Description');
  // A table whose only columns are an id and a control has nothing to lead with.
  assert.equal(cardPlan(columns.slice(0, 3)).title, -1);
  // And a spoken row number written into an ordinary column is still an id, so it is not drawn.
  const card = cardCells({ key: 'r', cells: ['x', '12', 'INV-9', 'Rent', '#12', '£1.00'] }, columns);
  assert.deepEqual(said(card), ['Rent', '£1.00']);
});

test('A TABLE WITH NO FIGURE HAS NO MARK, and the identifier that used to stand in for one is gone', () => {
  const columns: Column[] = [col({ label: '#', align: 'end', truncate: 'middle' }), col({ label: 'Description' }), col({ label: 'Which way' })];
  const plan = cardPlan(columns);
  assert.equal(plan.mark, -1);
  assert.equal(plan.title, 1);
  assert.deepEqual(said(cardCells({ key: 'r', cells: ['7', 'Refund', 'in'] }, columns, plan)), ['Refund', 'in']);
});

test('A BARE COUNT AND A SECOND FIGURE SAY THEIR NAMES (B11), and a day or a lone figure does not', () => {
  const CIRCLES: Column[] = [
    col({ label: 'Circle', align: 'start', truncate: 'end' }),
    col({ label: 'People', align: 'end' }),
    col({ label: 'A month', align: 'end', truncate: 'never' }),
    col({ label: 'Your turn', align: 'end' }),
  ];
  const circle = cardCells({ key: 'r', cells: ["Family gam'eya", '10', '£200', '4'] }, CIRCLES);
  assert.equal(circle.mark?.named, undefined, 'a lone figure beside the title was named');
  assert.deepEqual(circle.end.map((c) => [c.column.label, c.named]), [['People', true], ['Your turn', true]]);

  const WENT_UP: Column[] = [
    col({ label: 'Subscription', align: 'start', truncate: 'end' }),
    col({ label: 'Was', align: 'end', truncate: 'never' }),
    col({ label: 'Now', align: 'end', truncate: 'never' }),
    col({ label: 'Since', align: 'start' }),
  ];
  const up = cardCells({ key: 'r', cells: ['Ledger Post', 'GBP 34.00', 'GBP 39.00', '12 Aug'] }, WENT_UP);
  assert.equal(up.mark?.named, true);
  assert.deepEqual(up.end.map((c) => [c.column.label, c.named]), [['Now', true]]);
  assert.deepEqual(up.start.map((c) => [c.column.label, c.named]), [['Since', undefined]]);

  const card = cardCells({ key: 'r', cells: ['Rent', 'Pell & Vine', '£1,200.00', '3 Sep'] }, PAYMENTS);
  assert.ok([card.mark, ...card.start, ...card.end].every((c) => c?.named === undefined), 'a plain money card grew names');
});
