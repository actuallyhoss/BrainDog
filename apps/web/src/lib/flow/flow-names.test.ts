/**
 * The canvas says a list's fields by their names, never their ids (UI pass 20 Oct, NOTES W3-A: "lib/flow shows field ids
 * (filing_rules, counterparty_text, state is cleared)"). Money's own filing step and its trigger, held against the
 * declarations a tab learns from the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from '../record/held.ts';
import type { RegisterDecl } from '../record/schema.ts';
import { fieldName, listsIn, sayParts, sayStart, sayStep, sayTrigger } from './flow.ts';

const learnt = (id: string, decl: Partial<RegisterDecl>): void => {
  REGISTERS[id] = { id, name: id, title: 'what', fields: [], ...decl } as unknown as RegisterDecl;
};

learnt('transactions', {
  name: 'Ledger',
  fields: [
    { id: 'counterparty_text', label: 'As the bank wrote it', type: 'text' },
    { id: 'filed_by', label: 'Filed by', type: 'ref' },
    { id: 'category', type: 'ref' },
  ] as RegisterDecl['fields'],
});
learnt('filing_rules', {
  name: 'Filing rules',
  one: 'Filing rule',
  fields: [
    { id: 'match', label: 'Matches', type: 'text' },
    { id: 'match_by', label: 'Match by', type: 'text' },
    { id: 'state', label: 'Status', type: 'enum' },
  ] as RegisterDecl['fields'],
});

test('a link step names the list, its field and the reference by their names', () => {
  const step = { link: { field: 'category', to: { register: 'filing_rules', by: 'match', value: '{{counterparty_text}}' } } };
  const said = sayStep(step as never);
  assert.equal(said, 'Link category to the filing rule whose matches is As the bank wrote it');
  assert.doesNotMatch(said, /_/u, 'an id is still drawn');
  const chip = sayParts(step as never).find((p) => p.ref !== undefined);
  assert.deepEqual(chip, { text: 'As the bank wrote it', ref: 'counterparty_text' }, 'the chip names the field and keeps its path');
});

test('a condition and the fields a trigger waits on are said by name', () => {
  const d = { trigger: { written: { register: 'transactions', fields: ['counterparty_text', 'filed_by'] } }, when: 'filed_by is empty, counterparty_text is set' };
  const said = sayStart(d as never, () => 'Ledger');
  assert.doesNotMatch(said, /_/u, `an id is still drawn: ${said}`);
  assert.match(said, /only when as the bank wrote it or filed by changes/u);
  assert.match(said, /only when filed by is empty, as the bank wrote it is set/u);
  assert.equal(sayTrigger({ written: { register: 'filing_rules', fields: ['match_by'] } } as never, () => 'Filing rules'), 'When an item in Filing rules is added or changed, and only when match by changes');
  /* A FIELD A CLAUSE OPENS WITH, by its name, and the value after it left as written. */
  const rule = { trigger: { written: { register: 'filing_rules', fields: ['state'] } }, when: 'state is on and match is set' };
  assert.match(sayStart(rule as never, () => 'Filing rules'), /only when status changes, only when status is on and matches is set$/u);
});

test('the lists an automation names are found anywhere in its body, for the page to learn before it draws', () => {
  const body = { on: { written: { register: 'transactions' } }, steps: [{ link: { field: 'category', to: { register: 'filing_rules', by: 'match' } } }, { create: { register: 'tasks' } }] };
  assert.deepEqual(listsIn(body), ['transactions', 'filing_rules', 'tasks']);
});

test('a field no list this tab knows declares is its id in words, and a reference into the run keeps its last part', () => {
  assert.equal(fieldName('next_due_on'), 'next due on');
  assert.equal(sayParts({ notify: { say: 'Rate is {{vars.rate}}' } } as never).find((p) => p.ref)?.text, 'rate');
});
