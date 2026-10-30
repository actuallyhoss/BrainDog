/**
 * A person's bills say their way and where they stand in words, not by a dot alone (audit A15).
 *
 * The clock is the sample record's, 3 September 2026 at noon.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkedCells, linkedState } from './linked.ts';
import type { RegisterDecl } from '../../../../lib/record/schema.ts';

const NOW = Date.parse('2026-09-03T12:00:00Z');

const BILLS = {
  id: 'obligations',
  name: 'Bills and invoices',
  one: 'bill or invoice',
  title: 'what',
  mobile: ['what', 'amount', 'due'],
  state: 'state',
  done: ['paid', 'written_off'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', deadline: true },
    { id: 'state', type: 'enum', values: ['open', 'part', 'paid', 'written_off'], labels: { open: 'Open', part: 'Part paid', paid: 'Paid', written_off: 'Written off' } },
  ],
} as unknown as RegisterDecl;

const bill = (more: Record<string, unknown>) => ({ what: 'Website build, October', direction: 'owed_to_me', amount: { amount: 336_000, currency: 'GBP' }, due: '2026-11-08', state: 'open', ...more });

test('A FINISHED BILL SAYS ITS STATE, a late one how late, a near one how close, a far one nothing', () => {
  assert.equal(linkedState(BILLS, bill({ state: 'paid', due: '2026-06-01' }), NOW).text, 'Paid');
  assert.equal(linkedState(BILLS, bill({ due: '2026-07-27' }), NOW).text, '38 days late');
  assert.equal(linkedState(BILLS, bill({ due: '2026-09-03' }), NOW).text, 'Due today');
  assert.equal(linkedState(BILLS, bill({ due: '2026-09-04' }), NOW).text, 'Due tomorrow');
  assert.equal(linkedState(BILLS, bill({ due: '2026-09-08' }), NOW).text, 'Due in 5 days');
  assert.equal(linkedState(BILLS, bill({}), NOW).text, null);
});

test('A BILL DUE TODAY IS AMBER ALL DAY, whatever the list said after noon; any other keeps the list\'s tone', () => {
  assert.equal(linkedState(BILLS, bill({ due: '2026-09-03' }), NOW + 3 * 3_600_000, 'bad').tone, 'warn');
  assert.equal(linkedState(BILLS, bill({ due: '2026-07-27' }), NOW, 'bad').tone, 'bad');
  assert.equal(linkedState(BILLS, bill({ state: 'paid' }), NOW, 'good').tone, 'good');
});

test('A PART-PAID BILL SAYS SO, and ahead of how late it is', () => {
  assert.equal(linkedState(BILLS, bill({ state: 'part' }), NOW).text, 'Part paid');
  assert.equal(linkedState(BILLS, bill({ state: 'part', due: '2026-07-01' }), NOW).text, 'Part paid, 64 days late');
});

test('THE AMOUNT IS SIGNED BY ITS WAY and drawn as the sentence draws money', () => {
  const columns = [{ field: 'what' }, { field: 'amount' }, { field: 'due' }];
  const say = (c: string) => c.replace('GBP 3,360.00', '£3,360');
  assert.deepEqual(linkedCells(BILLS, columns, ['Website build, October', 'GBP 3,360.00', '8 Nov'], bill({}), say), ['+£3,360', '8 Nov']);
  assert.deepEqual(linkedCells(BILLS, columns, ['Print run, September', 'GBP 3,360.00', '8 Nov'], bill({ direction: 'owed_by_me' }), say), ['−£3,360', '8 Nov']);
  assert.deepEqual(linkedCells(BILLS, columns, ['Print run', 'GBP 3,360.00', null], undefined, say), ['£3,360']);
});
