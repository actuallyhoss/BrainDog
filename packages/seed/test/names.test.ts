/** Each use case's name, kept apart for the feed, is the title the use case itself carries; modules and rules are named too. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '@braindog/declare';
import { RULES } from '../src/index.ts';
import { USE_CASES } from '../src/usecases/index.ts';
import { MODULE_NAMES, RULE_ASKED, RULE_DONE, RULE_NAMES, RULE_ROWS, USE_CASE_NAMES, moduleName, namesSaid, ruleAsked, ruleDone, ruleFolded, ruleName, useCaseName } from '../src/usecases/names.ts';

test('every starter use case is named as its title says, and no name is left over', () => {
  assert.deepEqual(Object.fromEntries(USE_CASES.map((u) => [u.usecase, u.title])), { ...USE_CASE_NAMES });
});

test('a use case this build does not ship is named from its id', () => {
  assert.equal(useCaseName('team'), 'Team board');
  assert.equal(useCaseName('book-club'), 'Book club');
});

test('every first-party module has a name, and a use case pack is named as its use case', () => {
  assert.deepEqual(Object.keys(MODULE_NAMES).sort(), [...MODULES].sort());
  assert.equal(moduleName('money-core'), 'Money');
  assert.equal(moduleName('usecase-team'), 'Team board');
  assert.equal(moduleName('garden-log'), 'Garden log');
});

test('every rule the seed declares has a name, and no name is left over', () => {
  assert.deepEqual(Object.keys(RULE_NAMES).sort(), Object.keys(RULES).sort());
  assert.equal(ruleName('rule.invoice-late'), 'Chase late payments');
  assert.equal(ruleName('cash-stale'), 'Keep balances current');
  assert.equal(ruleName('renewal'), null);
});

test('a rule worded for the feed is one the seed declares, and its words follow the row', () => {
  for (const id of Object.keys(RULE_DONE)) assert.ok(Object.hasOwn(RULES, id), `${id} is worded and not declared`);
  assert.equal(ruleDone('rule:txn-categorise'), 'categorised');
  assert.equal(ruleDone('invoice-late'), null, 'a rule that asks is said by its question, not worded here');
  assert.equal(ruleDone('rule:constructor'), null);
});

test('a rule\'s run over several rows is one line that counts them and names the first', () => {
  for (const id of Object.keys(RULE_ROWS)) assert.ok(Object.hasOwn(RULE_DONE, id), `${id} names its rows and says nothing of what it did`);
  const six = ['TALLYARD', 'NORTHERN RAIL', 'TALLYARD', 'KILN STOREFRONT PAYOUT', 'FENWICK CLOUD', 'HALDEN'];
  assert.equal(ruleFolded('rule:txn-categorise', six), 'Categorised 6 payments: TALLYARD, NORTHERN RAIL and 4 more');
  assert.equal(ruleFolded('txn-categorise', ['TALLYARD', 'FENWICK CLOUD']), 'Categorised 2 payments: TALLYARD and FENWICK CLOUD');
  assert.equal(ruleFolded('invoice-late', six), null, 'a rule this build does not word is left to the host');
  assert.equal(namesSaid(['A', 'B', 'C']), 'A, B and C');
  assert.equal(namesSaid(['A', 'A']), 'A');
});

test('what a rule asked is said by the row it names, as its declared question writes the row', () => {
  for (const [id, said] of Object.entries(RULE_ASKED)) {
    const then = (RULES[id]?.then ?? []) as { suggest?: { question?: string } }[];
    const question = then.find((t) => t.suggest)?.suggest?.question ?? '';
    assert.ok(/^\{\{\w+\}\}/u.test(question) && question.includes(said.ends), `${id}: its question does not start with the row and read "${said.ends}"`);
  }
  assert.equal(ruleAsked('rule:recurring-missed', 'Ledger Post was due 4 days ago, GBP 39.00. Did it go through?'), 'Asked whether Ledger Post went through');
  assert.equal(ruleAsked('rule:invoice-late', 'Invoice 2026-041 was due 9 days ago, GBP 1,200.00. Chase it?'), 'Asked whether to chase Invoice 2026-041');
  assert.equal(ruleAsked('rule:renew-soon', 'Fenwick renews in 3 days for GBP 20.00. Keep it?'), 'Asked: Fenwick renews in 3 days for GBP 20.00. Keep it?');
});
