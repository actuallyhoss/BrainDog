import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS, columnHeading } from './api.ts';

test("A COLUMN WITH NO LABEL IS NEVER HEADED BY ITS ID: an add-on's list read before its declaration, or a path through a link", () => {
  REGISTERS.l4_lines = { id: 'l4_lines', name: 'Lines', one: 'line', title: 'what', mobile: ['what'], fields: [{ id: 'what', type: 'text' }, { id: 'line', type: 'ref', to: 'l4_ledger' }] } as never;
  REGISTERS.l4_ledger = { id: 'l4_ledger', name: 'Ledger', one: 'entry', title: 'what', mobile: ['what'], fields: [{ id: 'amount', type: 'money', label: 'Amount' }] } as never;
  try {
    assert.equal(columnHeading('l4_lines', { field: 'tax_part' }), 'Tax part');
    assert.equal(columnHeading('l4_lines', { field: 'line.amount' }), 'Amount', 'said by the field the link ends on');
    assert.equal(columnHeading('l4_lines', { field: 'line.paid_on' }), 'Paid on');
    assert.equal(columnHeading('nowhere', { field: 'paid-on' }), 'Paid on');
    assert.equal(columnHeading('l4_lines', { field: 'tax_part', label: 'Set aside' }), 'Set aside', 'a label the block gives wins');
  } finally {
    delete REGISTERS.l4_lines;
    delete REGISTERS.l4_ledger;
  }
});
