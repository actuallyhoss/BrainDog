/**
 * AN UPDATE THAT WAITS ON ANOTHER SAYS WHICH. Money 3.17.0 declares the count of budgets set, which Personal holds
 * until its own update hands it over, so Money taken first was refused at the figure with no way on. The helper names
 * Personal's update as the one to take first, and "Update all" takes it first.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handsOf, heldAs, holderFirst, inOrder, marked, type Waiting } from './update-order.ts';

const personalFile = { usecase: 'personal', version: '2.4.0', pack: { pack: 'usecase-personal', hands: { 'metric.budgets-set': 'money-core' } } };

const money: Waiting = { key: 'module:money-core', kind: 'module', id: 'money-core', title: 'Money', file: { doc: null, text: null } };
const personal: Waiting = { key: 'usecase:personal', kind: 'usecase', id: 'personal', title: 'Personal', file: { doc: null, text: JSON.stringify(personalFile) } };
const work: Waiting = { key: 'module:work', kind: 'module', id: 'work', title: 'Work', file: { doc: null, text: null } };

const conflicts = [{ id: 'metric.budgets-set', pack: 'usecase-personal' }];
const moneyDiff = { pack: { id: 'money-core', version: '3.17.0' }, planHash: 'h', direction: 'upgrade', conflicts };

test('an update is held under the id the record keeps it by', () => {
  assert.equal(heldAs(personal), 'usecase-personal');
  assert.equal(heldAs(money), 'money-core');
});

test('what an update hands on is read from its file: a use case from its pack, an add-on from its document', () => {
  assert.deepEqual(handsOf(personal.file), { 'metric.budgets-set': 'money-core' });
  assert.deepEqual(handsOf({ doc: { pack: 'notes', hands: { 'register.notes': 'journal' } }, text: null }), { 'register.notes': 'journal' });
  assert.deepEqual(handsOf(money.file), {});
  assert.deepEqual(handsOf({ doc: null, text: 'not a file' }), {});
});

test("Money's conflict names Personal's update as the one to take first", () => {
  assert.equal(holderFirst(moneyDiff, [work, money, personal]), personal);
});

test('with no update for the holder there is nobody to name', () => {
  assert.equal(holderFirst(moneyDiff, [work, money]), null);
});

test('a holder whose update hands the figure to somebody else is not named', () => {
  const other = { ...personal, file: { doc: null, text: JSON.stringify({ pack: { pack: 'usecase-personal', hands: { 'metric.budgets-set': 'plans' } } }) } };
  assert.equal(holderFirst(moneyDiff, [money, other]), null);
});

test('a conflict the owner made is nobody else to wait for', () => {
  for (const c of [
    { id: 'metric.budgets-set', pack: '(this record)' },
    { id: 'metric.budgets-set', pack: 'usecase-personal', changed: true },
    { id: 'metric.budgets-set', pack: 'usecase-personal', reads: 'register.budgets' },
    { id: 'metric.budgets-set', pack: 'usecase-personal', field: 'amount' },
  ]) {
    assert.equal(holderFirst({ ...moneyDiff, conflicts: [c] }, [money, personal]), null);
  }
});

test('a use case plan, or an answer that is no plan, names nobody', () => {
  assert.equal(holderFirst({ usecase: { id: 'personal' }, packs: [] }, [money, personal]), null);
  assert.equal(holderFirst(null, [money, personal]), null);
});

test('Update all goes holder first, and leaves the rest where it was', () => {
  assert.deepEqual(inOrder([work, money, personal]).map((u) => u.title), ['Work', 'Personal', 'Money']);
  assert.deepEqual(inOrder([personal, work, money]).map((u) => u.title), ['Personal', 'Work', 'Money']);
  assert.deepEqual(inOrder([work, money]).map((u) => u.title), ['Work', 'Money']);
  assert.deepEqual(inOrder([]), []);
});

test('two updates that hand to each other keep the order they came in', () => {
  const a: Waiting = { key: 'pack:a', kind: 'pack', id: 'a', title: 'A', file: { doc: { hands: { 'register.x': 'b' } }, text: null } };
  const b: Waiting = { key: 'pack:b', kind: 'pack', id: 'b', title: 'B', file: { doc: { hands: { 'register.y': 'a' } }, text: null } };
  assert.deepEqual(inOrder([a, b]).map((u) => u.title), ['A', 'B']);
});

test('the plan is marked for the sheet: after in the same run, first on its own, and nothing else is touched', () => {
  const alone = marked(moneyDiff, [money, personal], []) as typeof moneyDiff;
  assert.deepEqual(alone.conflicts, [{ id: 'metric.budgets-set', pack: 'usecase-personal', waits: 'first' }]);
  const run = marked(moneyDiff, [money, personal], [personal, money]) as typeof moneyDiff;
  assert.deepEqual(run.conflicts, [{ id: 'metric.budgets-set', pack: 'usecase-personal', waits: 'after' }]);
  /* The plan that installs is the one the record made: the marks go on a copy. */
  assert.deepEqual(moneyDiff.conflicts, conflicts);
  assert.equal(marked(moneyDiff, [money], []), moneyDiff);
  const own = { ...moneyDiff, conflicts: [{ id: 'metric.budgets-set', pack: '(this record)' }] };
  assert.equal(marked(own, [money, personal], [personal, money]), own);
  const shared = { usecase: { id: 'personal' }, packs: [] };
  assert.equal(marked(shared, [money, personal], []), shared);
});
