/**
 * A shared block drawn as the app draws it (SL1): cards as the renderer's cards, figures as a `stat`, work as a `todo`,
 * a plan on its days, and any other list through the renderer's table.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SharedBlock, SharedRow } from '../../lib/record/share-write.ts';
import { drawingOf } from './drawing.ts';
import type { Shown, Where } from './reading.ts';

const where: Where = { language: 'en-GB', zone: 'Europe/London', now: Date.parse('2026-09-02T12:00:00Z'), home: 'GBP' };

const block = (over: Partial<SharedBlock>): SharedBlock => ({
  kind: 'table',
  heading: null,
  lead: false,
  body: null,
  empty: null,
  span: null,
  refused: null,
  columns: [],
  rows: [],
  matched: 0,
  readings: [],
  authored: [],
  area: 'main',
  done: null,
  ...over,
});

const shown = (b: SharedBlock): Shown => ({ block: b, columns: b.columns.map((c) => ({ ...c, label: c.label ?? c.field })), rows: b.rows, matched: b.rows.length });

const row = (cells: SharedRow['cells'], state: string | null = null, trend?: (number | null)[]): SharedRow => ({ cells, fields: {}, state, ...(trend ? { trend } : {}) });

test('cards are the renderer\'s cards, with each card\'s line under its figure\'s name', () => {
  const b = block({
    kind: 'cards',
    columns: [{ field: 'name', label: 'Name', as: 'title' }, { field: 'progress', label: 'How far along', as: 'ring' }],
    rows: [row({ name: { type: 'text', value: 'Kiln' }, progress: { type: 'decimal', value: 60, unit: '%' } }, 'earning', [1, 0, 2, 1])],
    trendLabel: 'Done, by week',
  });
  const d = drawingOf(shown(b), where);
  assert.equal(d.table, null);
  const cards = d.segments.find((s) => s.type === 'block');
  assert.ok(cards && cards.type === 'block' && cards.kind === 'cards');
  assert.deepEqual(cards.rows[0]?.cells, ['title: Name', 'ring: How far along', 'trend: Done, by week']);
  assert.deepEqual(cards.rows[1]?.cells, ['Kiln', '60%', '1 0 2 1']);
});

test('figures are a stat, a todo ticks its finished rows, and a plain list is the renderer\'s table', () => {
  const figures = drawingOf(shown(block({ kind: 'stat', readings: [{ metric: 'open', label: 'Open', value: 7, unit: null }] })), where);
  assert.equal(figures.segments[0]?.type === 'block' && figures.segments[0].kind, 'stat');

  const todo = drawingOf(
    shown(block({ kind: 'todo', columns: [{ field: 'what', label: 'What' }], rows: [row({ what: { type: 'text', value: 'Ship it' } }, 'done')] })),
    where,
  );
  const list = todo.segments[0];
  assert.ok(list && list.type === 'block' && list.kind === 'todo');

  const table = drawingOf(
    shown(block({ kind: 'table', columns: [{ field: 'what', label: 'What' }, { field: 'amount', label: 'Amount' }], rows: [row({ what: { type: 'text', value: 'Hosting' }, amount: { type: 'money', value: { amount: 853000, currency: 'GBP' } } })] })),
    where,
  );
  assert.equal(table.segments.length, 0);
  assert.equal(table.table?.columns[1]?.align, 'end');
  assert.equal(table.table?.rows[0]?.cells[1], '£8,530');
});

test('a todo ticks by its list\'s own done states, and a card fact the pack left unnamed has no name', () => {
  const rows = [row({ what: { type: 'text', value: 'Ship it' } }, 'released'), row({ what: { type: 'text', value: 'Write it' } }, 'done')];
  const todo = drawingOf(shown(block({ kind: 'todo', columns: [{ field: 'what', label: 'What' }], rows, done: ['released'] })), where).segments[0];
  assert.ok(todo && todo.type === 'block' && todo.kind === 'todo');
  assert.deepEqual(
    todo.rows.map((r) => r.done === true),
    [true, false],
  );

  const cards = drawingOf(
    shown(block({ kind: 'cards', columns: [{ field: 'name', label: 'Name', as: 'title' }, { field: 'health', label: '', as: 'fact' }], rows: [row({ name: { type: 'text', value: 'Kiln' }, health: { type: 'enum', value: 'on_track', label: 'On track' } })] })),
    where,
  ).segments.find((s) => s.type === 'block');
  assert.ok(cards && cards.type === 'block');
  assert.equal(cards.rows[0]?.cells[1], 'fact:');
});

test('a card\'s cost of nothing is Free, as the app says it', () => {
  const cards = drawingOf(
    shown(block({ kind: 'cards', columns: [{ field: 'name', label: 'Name', as: 'title' }, { field: 'cost', label: 'Cost', as: 'figure' }], rows: [row({ name: { type: 'text', value: 'Wildcard certificate' }, cost: { type: 'money', value: { amount: 0, currency: 'GBP' } } })] })),
    where,
  ).segments.find((s) => s.type === 'block');
  assert.ok(cards && cards.type === 'block');
  assert.equal(cards.rows[1]?.cells[1], 'Free');
});
