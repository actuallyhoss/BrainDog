/**
 * "due is before today" in the sentence form, and "now" as today.
 *
 * MEASURED 24 NOVEMBER: asked from the bar for "a page that shows my late invoices", both included models drafted a table
 * whose `where` said `due is before today` (and once `due is before now`), the record refused "before today is not a value
 * due can hold", two repairs wrote it again, and Make drafted nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseWhere, type Schema } from '../src/index.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const BILLS: Schema = { register: 'bills', fields: { state: { type: 'enum', values: ['open', 'on', 'paid'] }, due: { type: 'day' }, seen: { type: 'instant' } } };
const parse = (text: string) => parseWhere(text, BILLS, { nowMs: NOW, refByTitle: () => null });

test('ON A DATE, "IS BEFORE", "IS AFTER" AND "IS ON" ARE BEFORE, AFTER AND ON', () => {
  assert.deepEqual(parse('due is before today'), parse('due before today'));
  assert.deepEqual(parse('due is after 2026-10-01'), parse('due after 2026-10-01'));
  assert.deepEqual(parse('due is on tomorrow'), parse('due on tomorrow'));
  assert.deepEqual(parse('due is before now'), parse('due before today'), 'now is today, to a day');
  assert.deepEqual(parse('due is before today').bad, []);
});

test('ON ANYTHING ELSE "IS ON" IS STILL THE VALUE IT SAYS', () => {
  assert.deepEqual(parse('state is on'), parse('state is on'));
  assert.notDeepEqual(parse('state is on'), parse('state on'));
});
