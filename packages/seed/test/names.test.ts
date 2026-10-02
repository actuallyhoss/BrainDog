/** Each use case's name, kept apart for the feed, is the title the use case itself carries; modules and rules are named too. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '@braindog/declare';
import { RULES } from '../src/index.ts';
import { USE_CASES } from '../src/usecases/index.ts';
import { MODULE_NAMES, RULE_DONE, RULE_NAMES, USE_CASE_NAMES, moduleName, ruleDone, ruleName, useCaseName } from '../src/usecases/names.ts';

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
