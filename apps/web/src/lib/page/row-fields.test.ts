/**
 * Every declared field of a row in the panel (`row-fields.ts`): what `RowForm` opens on, and the one patch a save sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, FieldDecl } from '../record/schema.ts';
import { rowPatch, valuesOf } from './row-fields.ts';

/** A list declared as a pack would: its project is the field `thing`, labelled Project, and nothing is named Tasks. */
const fields = [
  { id: 'what', type: 'text' },
  { id: 'state', type: 'enum', values: ['open', 'doing', 'done'], default: 'open' },
  { id: 'thing', type: 'ref', to: 'homes', label: 'Project' },
  { id: 'by', type: 'day', label: 'Due' },
  { id: 'tier', type: 'enum', values: ['top', 'second', 'low'] },
  { id: 'cost', type: 'money' },
  { id: 'paid', type: 'bool' },
  { id: 'note', type: 'document' },
] as unknown as FieldDecl[];
const gbp = () => 'GBP';

const entry = (f: Entry['fields']): Entry => ({ seq: 4, version: 2, fields: f, created: '', by: '' }) as Entry;
const row = entry({ what: 'Bins', state: 'doing', thing: 12, by: '2026-10-07', cost: { amount: 4800, currency: 'GBP' }, paid: true });

test('THE BOXES OPEN ON WHAT THE ROW HOLDS, as typed text, and a field it lacks opens empty', () => {
  assert.deepEqual(valuesOf(row, fields, gbp), {
    what: 'Bins',
    state: 'doing',
    thing: '12',
    by: '2026-10-07',
    tier: '',
    cost: '48',
    paid: 'true',
    note: '',
  });
});

test('A SAVE SENDS EVERY FIELD CHANGED AND NOTHING ELSE, a box emptied as cleared, the title emptied as no change', () => {
  /* What `RowForm` hands out for the row as it opened: text as typed, a money as the record stores it. */
  const asOpened = { what: 'Bins', state: 'doing', thing: '12', by: '2026-10-07', cost: { amount: 4800, currency: 'GBP' }, paid: true };
  assert.deepEqual(rowPatch(asOpened, row, fields, 'what', gbp), {}, 'a form saved as it opened writes nothing');

  const changed = { what: 'Bins out', state: 'doing', thing: '7', cost: { amount: 5000, currency: 'GBP' }, paid: false, note: 'Blue lid' };
  assert.deepEqual(rowPatch(changed, row, fields, 'what', gbp), {
    what: 'Bins out',
    thing: '7',
    by: null,
    cost: { amount: 5000, currency: 'GBP' },
    paid: false,
    note: 'Blue lid',
  });

  const { what: _gone, ...noTitle } = asOpened;
  assert.deepEqual(rowPatch(noTitle, row, fields, 'what', gbp), {}, 'a row keeps its words');
});
