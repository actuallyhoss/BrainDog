/**
 * A shared block drawn as the app draws it (SL1): cards as the renderer's cards, figures as a `stat`, work as a `todo`,
 * a plan on its days, and any other list through the renderer's table.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SharedBlock, SharedRow } from '../../lib/record/share-write.ts';
import { drawingOf, escapeCell } from './drawing.ts';
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

test('RH15: a title of three backticks never closes the fence, and the rows after it still draw', () => {
  assert.notEqual(escapeCell('```').slice(0, 3), '```');
  assert.equal(escapeCell('```').replaceAll('\u200b', ''), '```');
  assert.equal(escapeCell('a ``` b'), 'a ``` b');
  const cards = drawingOf(
    shown(block({ kind: 'cards', columns: [{ field: 'name', label: 'Name', as: 'title' }], rows: [row({ name: { type: 'text', value: '```' } }), row({ name: { type: 'text', value: 'Kiln' } })] })),
    where,
  ).segments.filter((s) => s.type === 'block');
  assert.equal(cards.length, 1, 'the fence was closed early');
  const only = cards[0];
  assert.ok(only && only.type === 'block');
  assert.ok(only.rows.some((r) => r.cells.includes('Kiln')), 'a row after the backticks was lost');
});

test('a Ledger line with no payee is named by its own words, as the app names it (AL1)', () => {
  const b = block({
    kind: 'timeline',
    columns: [{ field: 'on', label: 'Date' }, { field: 'payee', or: 'what', label: 'Paid to or from' }, { field: 'amount', label: 'Amount', sign: { field: 'direction', minus: 'out' } }],
    rows: [
      row({ on: { type: 'day', value: '2026-09-02' }, what: { type: 'text', value: 'GRANGEMOOR EVENTS, STAND DEPOSIT' }, amount: { type: 'money', value: { amount: 250000, currency: 'GBP' } }, direction: { type: 'enum', value: 'out' } }),
      row({ on: { type: 'day', value: '2026-08-30' }, payee: { type: 'text', value: 'Lowry Street Studios' }, what: { type: 'text', value: 'LOWRY STREET STUDIOS' }, amount: { type: 'money', value: { amount: 165000, currency: 'GBP' } }, direction: { type: 'enum', value: 'out' } }),
    ],
  });
  const line = drawingOf(shown(b), where).segments.find((s) => s.type === 'block');
  assert.ok(line && line.type === 'block' && line.kind === 'timeline');
  assert.equal(line.rows[0]?.cells[1], 'GRANGEMOOR EVENTS, STAND DEPOSIT', 'the bank line, which the timeline says as words');
  assert.equal(line.rows[1]?.cells[1], 'Lowry Street Studios');
});

test('budgets are bars of what was spent against each limit, and no bare figure (AL6)', () => {
  const b = block({
    kind: 'progress',
    columns: [{ field: 'name', label: 'Name' }, { field: 'budget', label: 'Most to spend' }],
    rows: [{ ...row({ name: { type: 'text', value: 'Contractors' }, budget: { type: 'money', value: { amount: 700000, currency: 'GBP' } } }), spent: 0 }],
    readings: [{ metric: 'spent-by-category-month', label: 'Spent this month, by category', value: 0, unit: null, groups: [] }],
  });
  const d = drawingOf(shown(b), where);
  assert.equal(d.table, null);
  assert.equal(d.segments.length, 1);
  const bars = d.segments[0];
  assert.ok(bars && bars.type === 'block' && bars.kind === 'progress');
  assert.deepEqual(bars.rows[0]?.cells.slice(0, 3), ['Contractors', '£0', '£7,000']);
});

test('a plan paid in parts is a track with its next part under it, not five tiles (AL12)', () => {
  const plan = (metric: string, value: number, unit: string | null, format?: string) => ({ metric, value, unit, ...(format ? { format } : {}), groups: [{ key: 'Proofing press', value }] });
  const b = block({
    kind: 'progress',
    readings: [plan('installments-paid-by-plan', 4, null, 'int'), plan('installments-total-by-plan', 8, null, 'int'), plan('installments-next-due-by-plan', 20699, null, 'day'), plan('installments-left-by-plan', 750000, 'GBP', 'money'), plan('installments-after-next-by-plan', 562500, 'GBP', 'money')],
  });
  const track = drawingOf(shown(b), where).segments[0];
  assert.ok(track && track.type === 'block' && track.kind === 'progress');
  assert.deepEqual(track.rows[0]?.cells, ['Proofing press', '4', '8', 'Next £1,875 on 3 Sep']);
});

test('what each account holds is a row an account, the card in its minus (AL12)', () => {
  const b = block({
    kind: 'bar',
    readings: [{ metric: 'balance-by-account', label: 'What each account holds', value: 3261000, unit: 'GBP', groups: [{ key: 'Tax reserve', value: 2400000 }, { key: 'Company card', value: -124000 }] }],
  });
  const bars = drawingOf(shown(b), where).segments[0];
  assert.ok(bars && bars.type === 'block' && bars.kind === 'bar');
  assert.deepEqual(bars.rows.map((r) => r.cells.slice(0, 2)), [['Tax reserve', '£24,000'], ['Company card', '−£1,240']]);
});

test('goals set against what was logged are tracks, "29.5 of 100" over their unit, never the figure\'s whole', () => {
  const b = block({
    kind: 'progress',
    toward: true,
    columns: [{ field: 'what', label: 'Goal' }, { field: 'target', label: 'Aim' }, { field: 'unit', label: 'Counted in' }],
    readings: [{ metric: 'logged-by-goal', label: 'Logged, by goal', value: 34.5, unit: null }],
    rows: [{ ...row({ what: { type: 'text', value: 'Run 100 km' }, target: { type: 'decimal', value: 100 }, unit: { type: 'text', value: 'km' } }, 'active'), spent: 29.5 }],
  });
  const d = drawingOf(shown(b), where);
  assert.equal(d.table, null);
  const bars = d.segments.find((s) => s.type === 'block');
  assert.ok(bars && bars.type === 'block' && bars.kind === 'progress');
  assert.deepEqual(bars.rows[0]?.cells, ['Run 100 km', '29.5', '100', 'km']);
});

test('a count is one track a group, its rows done of all, where a link drew a column of Yes and No', () => {
  const b = block({
    kind: 'progress',
    columns: [{ field: 'thing', label: 'Project', ref: true }, { field: 'done', label: 'Done' }],
    rows: [true, true, false, false].map((done) => row({ thing: { type: 'text', value: 'Garden shed' }, done: { type: 'bool', value: done } })),
  });
  const bars = drawingOf(shown(b), where).segments.find((s) => s.type === 'block');
  assert.ok(bars && bars.type === 'block' && bars.kind === 'progress');
  assert.deepEqual(bars.rows[0]?.cells.slice(0, 3), ['Garden shed', '2', '4']);
});

test('a table says a close deadline as the app does, and writes a whole column of amounts without pence', () => {
  const b = block({
    kind: 'table',
    done: ['paid'],
    columns: [{ field: 'what', label: 'Order' }, { field: 'total', label: 'Total' }, { field: 'due', label: 'Due', deadline: true }],
    rows: [
      row({ what: { type: 'text', value: 'Three candles' }, total: { type: 'money', value: { amount: 135000, currency: 'EGP' } }, due: { type: 'day', value: '2026-09-04' } }, 'ready'),
      row({ what: { type: 'text', value: 'Gift box' }, total: { type: 'money', value: { amount: 120000, currency: 'EGP' } }, due: { type: 'day', value: '2026-09-04' } }, 'paid'),
    ],
  });
  const d = drawingOf(shown(b), where);
  assert.deepEqual(d.table?.rows.map((r) => r.cells), [
    ['Three candles', 'EGP\u00a01,350', 'Due in 2 days'],
    ['Gift box', 'EGP\u00a01,200', '4 Sep'],
  ]);
});
