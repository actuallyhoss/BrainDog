/**
 * A live `progress` block, as the record answers one and the page draws it: a track a row, a count of steps done by
 * project, and a budget set against the parts of the figure it spent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Block } from 'braindog-render';

import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';
import type { RegisterDecl } from './schema.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

const register = (id: string, fields: { id: string; type: string; values?: string[]; labels?: Record<string, string> }[]) =>
  ({ id, name: id, one: id, title: fields[0]!.id, fields }) as unknown as RegisterDecl;

const answered = (source: string, columns: string[], rows: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  kind: 'progress',
  source,
  columns: columns.map((field) => ({ field })),
  rows: rows.map((fields, i) => ({ id: `r${i}`, seq: i + 1, fields, version: 1, created_at: '2026-09-01T09:00:00Z' })),
  matched: rows.length,
  refusals: [],
  ...extra,
});

const drawn = (b: unknown): Block => {
  const [block] = toSegments(blockOf(b as never, new Map(), NOW)).filter((s): s is Block => s.type === 'block');
  assert.ok(block, 'a block drew');
  return block;
};

test('a savings goal is a track a row, and a goal with no target is left out', () => {
  REGISTERS.savings_goals = register('savings_goals', [
    { id: 'name', type: 'text' },
    { id: 'saved', type: 'money' },
    { id: 'target', type: 'money' },
    { id: 'by', type: 'day' },
  ]);
  const block = drawn(
    answered('register.savings_goals', ['name', 'saved', 'target', 'by'], [
      { name: 'Holiday', saved: gbp(120_000), target: gbp(300_000), by: '2027-03-01' },
      { name: 'Someday', saved: gbp(5_000), target: null },
    ]),
  );
  assert.equal(block.kind, 'progress');
  assert.equal(block.form, undefined);
  assert.equal(block.rows.length, 1);
  assert.equal(block.rows[0]!.cells[0], 'Holiday');
  assert.match(block.rows[0]!.cells[1]!, /1,200\.00/u);
  assert.match(block.rows[0]!.cells[2]!, /3,000\.00/u);
  assert.ok(block.rows[0]!.cells[3], 'the day it is for is the note');
});

test('a yes or no column counts: steps done out of steps, grouped by the first column', () => {
  REGISTERS.project_steps = register('project_steps', [
    { id: 'what', type: 'text' },
    { id: 'project', type: 'text' },
    { id: 'done', type: 'bool' },
  ]);
  const block = drawn(
    answered('register.project_steps', ['project', 'done'], [
      { what: 'Strip the frame', project: 'Bike', done: true },
      { what: 'New tyres', project: 'Bike', done: false },
      { what: 'Brakes', project: 'Bike', done: true },
      { what: 'First draft', project: 'Stories', done: false },
    ]),
  );
  assert.deepEqual(block.rows.map((r) => r.cells.slice(0, 3)), [['Bike', '2', '3'], ['Stories', '0', '1']]);
});

test('A BUDGET SETS EACH LIMIT AGAINST WHAT ITS FIGURE SPENT, zero where nothing was, in the budget form', () => {
  REGISTERS.budgets = register('budgets', [
    { id: 'category', type: 'enum', values: ['groceries', 'eating_out', 'travel'], labels: { groceries: 'Groceries', eating_out: 'Eating out', travel: 'Travel' } },
    { id: 'limit', type: 'money' },
  ]);
  const reading = { value: 35_240, unit: 'GBP', rows: 5, met: null, refusals: [], groups: [{ key: 'groceries', value: 21_240 }, { key: 'eating_out', value: 14_000 }] };
  const b = answered('register.budgets', ['category', 'limit'], [
    { category: 'groceries', limit: gbp(30_000) },
    { category: 'eating_out', limit: gbp(12_000) },
    { category: 'travel', limit: gbp(10_000) },
  ], { spent: 'spent-this-month', readings: [{ metric: 'spent-this-month', reading }] });
  const block = drawn(b);
  assert.equal(block.form, 'budget');
  assert.deepEqual(block.rows.map((r) => r.cells[0]), ['Groceries', 'Eating out', 'Travel']);
  assert.match(block.rows[0]!.cells[1]!, /212\.40/u);
  assert.match(block.rows[1]!.cells[1]!, /140\.00/u);
  assert.match(block.rows[2]!.cells[1]!, /0\.00/u);
  assert.match(block.rows[1]!.cells[2]!, /120\.00/u);
  const live = blockOf({ ...b, readings: undefined } as never, new Map(), NOW);
  assert.ok(live.cannot, 'a budget whose figure the record did not read says it cannot be drawn');
});
