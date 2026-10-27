/**
 * A line split across categories, as the screens read it: the row in a list says it is split, a bar adds up each part
 * under its own category, and the quick-add sheet writes one line in parts where the ledger keeps them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ledgerFrom } from '../money/ledger.ts';
import { linesOf } from '../money/quick.ts';
import { REGISTERS } from './held.ts';
import { leftOf, partsOf, partsPatch, splitAtOf, splitSaid } from './split.ts';
import { toRows } from './api.ts';
import type { Entry, RegisterDecl } from './schema.ts';

const decl = (d: Partial<RegisterDecl> & { id: string; fields: unknown[] }): RegisterDecl =>
  ({ name: d.id, one: d.id, title: 'label', mobile: ['label', 'sum', 'when'], ...d }) as unknown as RegisterDecl;

const PURSES = decl({ id: 'purses', fields: [{ id: 'label', type: 'text', required: true }, { id: 'held', type: 'money', required: true }] });
const KINDS = decl({ id: 'kinds', fields: [{ id: 'label', type: 'text', required: true }, { id: 'goes', type: 'enum', values: ['in', 'out', 'both'], required: true }] });
const TILL = decl({
  id: 'till',
  fields: [
    { id: 'label', type: 'text', required: true },
    { id: 'when', type: 'day', required: true },
    { id: 'goes', type: 'enum', values: ['in', 'out'], required: true },
    { id: 'sum', type: 'money', required: true },
    { id: 'purse', type: 'ref', to: 'purses', required: true },
    { id: 'kind', type: 'ref', to: 'kinds', index: true },
    { id: 'pieces', type: 'json', parts_of: 'sum' },
  ],
});

const egp = (amount: number) => ({ amount, currency: 'EGP' });
const RUN = { label: 'Shop run', when: '2026-10-20', goes: 'out', sum: egp(100_000), purse: 'p1', kind: 'k1', pieces: [{ kind: 'k1', sum: egp(70_000) }, { kind: 'k2', sum: egp(30_000), note: 'Birthday' }] };

test('THE PARTS FIELD IS THE JSON FIELD THAT SAYS WHAT IT ADDS UP TO, and its parts read in minor units', () => {
  const at = splitAtOf(TILL)!;
  assert.deepEqual(at, { field: 'pieces', of: 'sum' });
  assert.equal(splitAtOf(PURSES), null);
  const parts = partsOf(RUN, at, 'kind');
  assert.deepEqual(parts, [{ by: 'k1', minor: 70_000, note: '' }, { by: 'k2', minor: 30_000, note: 'Birthday' }]);
  assert.equal(splitSaid(parts), 'Split · 2 categories');
  assert.equal(splitSaid([...parts, { by: 'k1', minor: 1, note: '' }]), 'Split · 2 categories');
  assert.equal(splitSaid([{ by: 'k1', minor: 1, note: '' }, { by: 'k1', minor: 2, note: '' }]), 'Split · 2 parts');
  assert.equal(leftOf(100_000, parts), 0);
  assert.equal(partsOf({ ...RUN, pieces: undefined }, at, 'kind').length, 0);
  assert.deepEqual(partsPatch([...parts, { by: 'k3', minor: 0, note: '' }], at, 'kind', 'EGP'), [
    { kind: 'k1', sum: egp(70_000) },
    { kind: 'k2', sum: egp(30_000), note: 'Birthday' },
  ]);
});

test('A SPLIT LINE IN A LIST IS ONE ROW THAT SAYS SO, in place of its one category', () => {
  REGISTERS.till = TILL;
  try {
    const entry = { id: 'e1', seq: 4, fields: RUN, version: 1 } as unknown as Entry;
    const plain = { id: 'e2', seq: 5, fields: { ...RUN, pieces: undefined }, version: 1 } as unknown as Entry;
    const rows = toRows('till', [entry, plain], [{ field: 'label' }, { field: 'kind' }]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.cells[1], 'Split · 2 categories');
    assert.notEqual(rows[1]!.cells[1], 'Split · 2 categories');
  } finally {
    delete REGISTERS.till;
  }
});

test('THE QUICK-ADD SHEET WRITES ONE LINE IN PARTS where the ledger keeps them', () => {
  const ledger = ledgerFrom(TILL, new Map([['purses', PURSES], ['kinds', KINDS], ['till', TILL]]))!;
  assert.equal(ledger.parts, 'pieces');
  const drafted = linesOf(
    { way: 'out', minor: 100_000, currency: 'EGP', title: 'Shop run', day: '2026-10-20', account: 'p1', to: null, received: null, toCurrency: null, category: null, parts: [{ category: 'k1', minor: 70_000 }, { category: 'k2', minor: 30_000 }], note: '' },
    ledger,
  );
  assert.ok(drafted.ok);
  assert.equal(drafted.lines.length, 1);
  assert.deepEqual(drafted.lines[0]!.pieces, [{ kind: 'k1', sum: egp(70_000) }, { kind: 'k2', sum: egp(30_000) }]);
  assert.deepEqual(drafted.lines[0]!.sum, egp(100_000));
  /* A LEDGER THAT KEEPS NO PARTS still writes a line a category. */
  const bare = { ...ledger, parts: null };
  const two = linesOf({ way: 'out', minor: 100_000, currency: 'EGP', title: 'Shop run', day: '2026-10-20', account: 'p1', to: null, received: null, toCurrency: null, category: null, parts: [{ category: 'k1', minor: 70_000 }, { category: 'k2', minor: 30_000 }], note: '' }, bare);
  assert.ok(two.ok);
  assert.equal(two.lines.length, 2);
});
