/**
 * A bill due soon on a page's table says when in its due cell and wears no amber dot (polish-i, PI3): Tax set aside's
 * "Corporation tax, payment on account" drew an orange dot and "7 Sep", with no word, where a list's card says "Due in 4
 * days".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { DUE_WORDS, soonSaid } from './page-live.ts';
import type { Entry } from './schema.ts';

/* Thu 3 Sep 2026, midday, the seed's clock. */
const NOW = Date.parse('2026-09-03T12:00:00Z');
const COLUMNS = [{ field: 'what' }, { field: 'due' }, { field: 'amount' }];
const entry = (due: string): Entry => ({ id: due, register: 'obligations', seq: 1, fields: { what: 'Tax', due }, version: 1, created_at: '', updated_at: '', deleted_at: null }) as never;
const row = (day: string, tone?: 'warn' | 'bad') => ({ cells: ['Tax', day, '£19,100'] as (string | null)[], ...(tone ? { tone } : {}) });

test('A ROW DUE SOON SAYS WHEN IN ITS DUE CELL AND LOSES ITS AMBER; a late row and a far one are left as they are', () => {
  const rows = [row('7 Sep', 'warn'), row('4 Sep', 'warn'), row('3 Sep', 'warn'), row('1 Sep', 'bad'), row('5 Nov')];
  soonSaid('obligations', COLUMNS, [entry('2026-09-07'), entry('2026-09-04'), entry('2026-09-03'), entry('2026-09-01'), entry('2026-11-05')], rows, NOW);
  assert.equal(rows[0]!.cells[1], DUE_WORDS.inDays(4));
  assert.equal(rows[0]!.cells[1], 'Due in 4 days');
  assert.equal('tone' in rows[0]!, false, 'the words say it, so no dot');
  assert.equal(rows[1]!.cells[1], DUE_WORDS.tomorrow);
  assert.equal(rows[2]!.cells[1], DUE_WORDS.today);
  assert.equal(rows[3]!.cells[1], '1 Sep');
  assert.equal(rows[3]!.tone, 'bad', 'late keeps its red');
  assert.equal(rows[4]!.cells[1], '5 Nov');
});

test('A TABLE THAT DOES NOT DRAW THE DEADLINE IS CALM, as a list is: no dot with no word; a late row keeps its red', () => {
  const rows: { cells: (string | null)[]; tone?: string }[] = [
    { cells: ['Tax', '£19,100'], tone: 'warn' },
    { cells: ['VAT', '£7,420'], tone: 'bad' },
  ];
  soonSaid('obligations', [{ field: 'what' }, { field: 'amount' }], [entry('2026-09-07'), entry('2026-09-01')], rows, NOW);
  assert.equal('tone' in rows[0]!, false);
  assert.deepEqual(rows[0]!.cells, ['Tax', '£19,100']);
  assert.equal(rows[1]!.tone, 'bad');
});
