import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeWidget, draftFault, draftOf, kept, windowOf } from './widget-compose.ts';

const choices = {
  projects: ['Kiln', 'Portage'],
  categories: ['Software', 'Travel'],
  payees: ['Fenwick Cloud'],
  currencies: ['GBP'],
  lists: new Set(['ledger_lines', 'todos', 'things']),
  ledger: 'ledger_lines',
  todo: 'todos',
};

test('money in one category over a window is a list of the ledger, newest first', () => {
  const made = composeWidget('my Software spending this month', choices);
  assert.ok(made);
  assert.equal(made.block.kind, 'table');
  assert.equal(made.block.source, 'register.ledger_lines');
  assert.match(String(made.block.where), /direction is out/u);
  assert.match(String(made.block.where), /category is Software/u);
  assert.match(String(made.block.where), /on at least bom/u);
});

test('a payee named is a choice on who', () => {
  const made = composeWidget('what went to Fenwick Cloud in the last 30 days', choices);
  assert.ok(made);
  assert.match(String(made.block.where), /party is Fenwick Cloud/u);
  assert.match(String(made.block.where), /on after -30d/u);
});

test("a project's late tasks are a list to tick", () => {
  const made = composeWidget('how many Kiln tasks are late', choices);
  assert.ok(made);
  assert.equal(made.block.kind, 'todo');
  assert.match(String(made.block.where), /thing is Kiln/u);
  assert.match(String(made.block.where), /by before today/u);
});

test('a line the rules cannot read is null, so only then is the model asked', () => {
  assert.equal(composeWidget('the moon phase over my garden', { lists: new Set() }), null);
  assert.equal(composeWidget('   ', choices), null);
  /* A record with no list shaped as a ledger is offered no ledger rule. */
  const { ledger: _l, ...noLedger } = choices;
  assert.equal(composeWidget('my Software spending this month', noLedger), null);
});

test('windows are said as a person says them', () => {
  assert.deepEqual(windowOf('this week', 'on'), { where: 'on at least bow', say: 'this week' });
  assert.equal(windowOf('forever', 'on'), null);
});

test('a draft mark is who, why and what it cost, and keeping takes it off', () => {
  const block = { kind: 'table', draft: { by: 'Slash', why: 'my food' } };
  assert.deepEqual(draftOf(block), { by: 'Slash', why: 'my food' });
  assert.equal(draftOf({ kind: 'table' }), null);
  assert.deepEqual(kept(block), { kind: 'table' });
  assert.equal(draftFault({ by: 'Slash', why: 'x' }), null);
  assert.ok(draftFault({ by: '', why: 'x' }));
  assert.ok(draftFault({ by: 'Slash', why: 'x', extra: 1 }));
});

test('money by week is a line of totals, never the single payments', () => {
  const weekly = composeWidget('my Software spending by week', choices);
  assert.ok(weekly);
  assert.equal(weekly.block.kind, 'series');
  assert.deepEqual((weekly.block.series as { metric: string }[])[0]!.metric, 'spent-in-category-by-week:Software');
  assert.equal(composeWidget('Fenwick Cloud weekly', choices)?.block.kind, 'series');
  /* A record without the weekly figure gets the payments. */
  assert.equal(composeWidget('my Software spending by week', { ...choices, figures: new Set() })?.block.kind, 'table');
});
