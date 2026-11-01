import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sayLine } from './slash-entry.ts';
import { blockNamed, sayPage, type SayIn } from './say-page.ts';

const base = (text: string, over: Partial<SayIn> = {}): SayIn => ({
  text,
  slug: 'money',
  body: {
    page: 'money',
    title: 'Money',
    blocks: [
      { kind: 'stat', key: 'cash', heading: 'Cash ahead' },
      { kind: 'table', key: 'bills', heading: 'Bills', source: 'register.bills' },
      { kind: 'timeline', key: 'coming', heading: 'Coming up' },
    ],
  },
  mine: true,
  blocks: [
    { key: 'cash', kind: 'stat', heading: 'Cash ahead', register: null, drawn: true, area: 'main' },
    { key: 'bills', kind: 'table', heading: 'Bills', register: 'bills', source: 'register.bills', drawn: true, area: 'main' },
    { key: 'coming', kind: 'timeline', heading: 'Coming up', register: null, drawn: true, area: 'main' },
  ],
  look: null,
  lists: [
    {
      id: 'bills',
      name: 'Bills',
      state: 'status',
      done: ['paid'],
      fields: [
        { id: 'name', type: 'text' },
        { id: 'status', type: 'enum', values: ['due', 'paid'] },
        { id: 'due', type: 'day' },
      ],
    },
  ],
  current: 'bills',
  now: Date.UTC(2026, 10, 1),
  ...over,
});

test('a move is his look, pinned, with the block in its new place', () => {
  const said = sayPage(base('move Coming up to the top'));
  assert.equal(said?.do, 'look');
  if (said?.do !== 'look') return;
  assert.deepEqual(said.look.order, ['coming', 'cash', 'bills']);
  assert.deepEqual(said.preview.blocks.map((b) => b.key), ['coming', 'cash', 'bills']);
});

test('a hide is his look, and the preview leaves the block out', () => {
  const said = sayPage(base('hide cash ahead'));
  assert.equal(said?.do, 'look');
  if (said?.do !== 'look') return;
  assert.deepEqual(said.look.hide, ['cash']);
  assert.equal(said.preview.blocks.length, 2);
});

test('show only open ones filters the main list by its own states', () => {
  const said = sayPage(base('show only open ones'));
  assert.equal(said?.do, 'body');
  if (said?.do !== 'body') return;
  assert.equal(said.body.blocks[1]!.where, 'status is not paid');
});

test('rename this list is the record call, by the name he sees', () => {
  const said = sayPage(base('rename this list to invoices'));
  assert.deepEqual(said?.do === 'rename' ? [said.list, said.was, said.name] : null, ['bills', 'Bills', 'Invoices']);
});

test('a block named twice alike asks which', () => {
  const two = base('hide the list', { blocks: [...base('').blocks, { key: 'bills-2', kind: 'table', heading: 'Bills', register: 'bills', drawn: true, area: 'main' }] });
  assert.equal(blockNamed('bills', two.blocks, two.lists) !== null && 'which' in (blockNamed('bills', two.blocks, two.lists) as object), true);
});

test('a line the rules cannot read is left to the model', () => {
  assert.equal(sayPage(base('make it feel calmer')), null);
});

test('Slash hands the bare phrasings to the page, never a task to add', () => {
  assert.equal(sayLine('move Bills up')?.verb, 'change');
  assert.equal(sayLine('add a chart of spend by month')?.verb, 'change');
  assert.equal(sayLine('add a task to call the bank'), null);
});
