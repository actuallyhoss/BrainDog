/**
 * A live `progress` block, as the record answers one and the page draws it: a track a row, a count of steps done by
 * project, and a budget set against the parts of the figure it spent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import type { Block } from 'braindog-render';
import { openRecord } from '@braindog/kernel';

import './fixtures/fill.ts';
import { REGISTERS } from './api.ts';
import { toSegments } from './blocks.ts';
import { blockOf } from './page-live.ts';
import { refMapOf } from './remote.ts';
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

test('A PROJECT IS NAMED AS THE RECORD NAMES IT, never as the sample row with the same number', () => {
  REGISTERS.project_steps = register('project_steps', [
    { id: 'what', type: 'text' },
    { id: 'thing', type: 'ref' },
    { id: 'done', type: 'bool' },
  ]);
  (REGISTERS.project_steps.fields[1] as { to?: string }).to = 'things';
  const refs = new Map([['things', refMapOf('things', [{ id: 'T1', seq: 1, fields: { name: 'Restore the old road bike' } }])]]);
  const live = blockOf(
    answered('register.project_steps', ['thing', 'done'], [
      { what: 'Strip the frame', thing: 'T1', done: true },
      { what: 'New tyres', thing: 'T1', done: false },
    ]) as never,
    refs,
    NOW,
  );
  const [block] = toSegments(live).filter((x): x is Block => x.type === 'block');
  assert.deepEqual(block?.rows.map((r) => r.cells.slice(0, 3)), [['Restore the old road bike', '1', '2']]);
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
  /* A BUDGET IS A SUMMARY, SAID WHOLE (aa560291b): what is spent to the unit, the limit beside it as the record holds it. */
  assert.match(block.rows[0]!.cells[1]!, /212\.00/u);
  assert.match(block.rows[1]!.cells[1]!, /140\.00/u);
  assert.match(block.rows[2]!.cells[1]!, /0\.00/u);
  assert.match(block.rows[1]!.cells[2]!, /120\.00/u);
  const live = blockOf({ ...b, readings: undefined } as never, new Map(), NOW);
  assert.ok(live.cannot, 'a budget whose figure the record did not read says it cannot be drawn');
});

test('A GOAL IS SET AGAINST WHAT WAS LOGGED TOWARD IT, keyed by the row, in the goal form', () => {
  REGISTERS.goals = register('goals', [
    { id: 'what', type: 'text' },
    { id: 'target', type: 'decimal' },
    { id: 'unit', type: 'text' },
  ]);
  const reading = { value: 3, unit: null, rows: 3, met: null, refusals: [], groups: [{ key: 'r0', value: 2 }] };
  const b = answered('register.goals', ['what', 'target', 'unit'], [
    { what: 'Run three times a week', target: 3, unit: 'runs' },
    { what: 'Cook at home', target: 5, unit: 'nights' },
  ], { toward: 'logged-this-week-by-goal', readings: [{ metric: 'logged-this-week-by-goal', reading }] });
  const block = drawn(b);
  assert.equal(block.form, undefined, 'a goal is not a budget: reaching it is the aim');
  assert.deepEqual(block.rows.map((r) => r.cells.slice(0, 4)), [['Run three times a week', '2', '3', 'runs'], ['Cook at home', '0', '5', 'nights']]);
});

/** A record in memory over `node:sqlite`, bound the way the kernel's own tests bind one. */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

/* ON A RECORD OF ITS OWN, AND IT WAS "in the sample". The sample is now a kernel seeded once and never written to
   (`fixtures/readers.ts`), so a list pushed into `held.ts` for it reaches nothing and the record refused the
   source it had never been given. The lists, the figure and the rows are declared and written here instead; the page's
   `REGISTERS` still learns the list, which is what a live tab does before it draws one. */
test('A BUDGET IN ONE CURRENCY AND A FIGURE IN ANOTHER ARE NEVER SET AGAINST EACH OTHER on a record', async () => {
  const budgets = register('budgets_x', [
    { id: 'category', type: 'enum', values: ['groceries'] },
    { id: 'limit', type: 'money' },
  ]);
  const spend = register('spend_x', [
    { id: 'category', type: 'enum', values: ['groceries'] },
    { id: 'amount', type: 'money' },
  ]);
  REGISTERS.budgets_x = budgets;
  REGISTERS.spend_x = spend;
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const installed = await k.install([
    { id: 'register.budgets_x', kind: 'register', body: budgets as never },
    { id: 'register.spend_x', kind: 'register', body: spend as never },
    { id: 'metric.spent-x', kind: 'metric', body: { metric: 'spent-x', name: 'Spent', source: 'register.spend_x', value: { sum: 'amount' }, group_by: 'category', format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never },
  ]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(k.create('spend_x', { category: 'groceries', amount: gbp(4_500) }, { actor: 'p_owner' }).ok);
  const limit = k.create('budgets_x', { category: 'groceries', limit: gbp(5_000) }, { actor: 'p_owner' });
  assert.ok(limit.ok, JSON.stringify(limit));
  const block = { kind: 'progress', source: 'register.budgets_x', columns: [{ field: 'category' }, { field: 'limit' }], spent: 'spent-x' };
  const read = () => blockOf(k.block(block as never) as never, new Map(), NOW);

  const same = read();
  assert.deepEqual(same.refusals, []);
  assert.deepEqual(same.spentBy?.groups, [{ key: 'groceries', value: 4_500 }], 'the record reads what was spent, not nothing');

  assert.ok(k.update('budgets_x', `budgets_x#${limit.value.seq}`, { limit: { amount: 5_000, currency: 'EUR' } }, { actor: 'p_owner' }).ok);
  const mixed = read();
  assert.equal(mixed.spentBy, undefined);
  assert.match(mixed.refusals.join(' '), /EUR.*GBP.*two currencies/u);
});
