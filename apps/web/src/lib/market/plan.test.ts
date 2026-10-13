/**
 * THE PLAN SHEET SAYS A FIELD BY ITS LABEL: the sentence for a call a rule runs names what leaves with it as the
 * record shows it, the way Decide does, and never as the field's id.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sheetOf, type FieldName } from './plan.ts';

const named = (id: string): string => (id === 'register.invoices' ? 'Client invoices' : id === 'billing' ? 'Billing' : id);

const diff = (sends: unknown): unknown => ({
  pack: { id: 'billing', version: '1.0.0', summary: '' },
  planHash: 'h',
  direction: 'install',
  calls_out: [{ host: 'api.stripe.com', grant: 'stripe', trigger: 'rule', change: 'new', sends }],
});

const lineOf = (sends: unknown, fieldOf?: FieldName): string => {
  const sheet = sheetOf(diff(sends), named, fieldOf);
  assert.ok(sheet);
  return sheet.parts[0]?.calls[0]?.line ?? '';
};

const labels: FieldName = (list, field) => (list === 'invoices' && field === 'amount' ? 'Total due' : null);

test('a field that leaves with a call is said by its label, and its list by its name', () => {
  const line = lineOf(['invoices.amount'], labels);
  assert.ok(line.endsWith('It sends Total due of Client invoices.'), line);
});

test('a field the record holds no label for is its id read as words', () => {
  assert.ok(lineOf(['invoices.amount', 'invoices.due_on'], labels).endsWith('It sends Total due and Due on of Client invoices.'));
  /* An empty label is no label. */
  assert.ok(lineOf(['invoices.due_on'], () => '  ').endsWith('It sends Due on of Client invoices.'));
});

test('a sheet handed no labels reads as it did', () => {
  assert.ok(lineOf(['invoices.amount']).endsWith('It sends Amount of Client invoices.'));
});

test('the labels reach every plan of an "Update all"', () => {
  const sheet = sheetOf([diff(['invoices.amount']), diff(['invoices.amount'])], named, labels);
  assert.ok(sheet);
  assert.equal(sheet.parts.length, 2);
  for (const part of sheet.parts) assert.ok(part.calls[0]?.line.endsWith('It sends Total due of Client invoices.'));
});

test('the call still carries the fields as the plan names them', () => {
  const sheet = sheetOf(diff(['invoices.amount']), named, labels);
  assert.deepEqual(sheet?.parts[0]?.calls[0]?.sends, ['invoices.amount']);
});
