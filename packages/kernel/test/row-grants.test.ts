/**
 * One account shared, and the lines on it: the bundle `rowGrantShares` builds, read back by the lens, and the checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkShare, gateFields, lensOf, type Catalog, type HeldShare, type Lens } from '../src/lens.ts';
import { canReadRow, canWriteRow, rowGrantShares, rowGrantsIn, type RowLike } from '../src/row-grants.ts';
import type { ShareKept } from '../src/shares.ts';

const NOW = Date.UTC(2026, 9, 29, 12);

const CATALOG: Catalog = {
  lists: [
    { id: 'accounts', name: 'Accounts', fields: [{ id: 'name', type: 'text', title: true }, { id: 'balance', type: 'money' }] },
    {
      id: 'transactions',
      name: 'Ledger',
      fields: [
        { id: 'title', type: 'text', title: true },
        { id: 'amount', type: 'money' },
        { id: 'account', type: 'ref', to: 'accounts' },
        { id: 'category', type: 'ref', to: 'categories' },
      ],
    },
    { id: 'categories', name: 'Categories', fields: [{ id: 'name', type: 'text', title: true }] },
    { id: 'transfers', name: 'Transfers', fields: [{ id: 'from', type: 'ref', to: 'accounts' }, { id: 'to', type: 'ref', to: 'accounts' }] },
  ],
};

const JOINT = 'r_joint';
const OTHER = 'r_other';
const SAM = { kind: 'person', id: 'p_sam' } as const;

const row = (id: string, fields: Record<string, unknown>): RowLike => ({ id, fields });
const line = (id: string, account: string, title = 'Groceries'): RowLike => row(id, { title, amount: { amount: 40, currency: 'GBP' }, account });

const lensFor = (can: 'view' | 'edit'): Lens => {
  const built = rowGrantShares(CATALOG, { who: SAM, list: 'accounts', row: JOINT, lines: ['transactions'], can });
  assert.ok(built.ok);
  const shares: HeldShare[] = built.value.shares.map((s, i) => ({ ...s, id: `sh_${i}` }));
  const lens = lensOf({ person: SAM.id, role: null, shares }, CATALOG, NOW);
  assert.ok(lens);
  return lens;
};

test('THE BUNDLE is the account first, then the lines on it, and checkShare takes each', () => {
  const built = rowGrantShares(CATALOG, { who: { kind: 'email', id: 'sam@example.com' }, list: 'accounts', row: JOINT, lines: ['transactions'], can: 'edit' });
  assert.ok(built.ok);
  assert.deepEqual(built.value.lines, [{ list: 'transactions', field: 'account' }]);
  assert.deepEqual(built.value.shares[0]!.what, { list: 'accounts', rows: [JOINT] });
  assert.deepEqual(built.value.shares[0]!.caps, { delete: false });
  assert.deepEqual(built.value.shares[1]!.what, { list: 'transactions', where: { field: 'account', is: JOINT } });
  for (const s of built.value.shares) assert.equal(checkShare(s, CATALOG, { others: built.value.shares.filter((x) => x !== s) }), null);
});

test('A LIST WITH NOTHING POINTING AT THE ROW, or two ways to, is refused in words', () => {
  const none = rowGrantShares(CATALOG, { who: SAM, list: 'accounts', row: JOINT, lines: ['categories'], can: 'view' });
  assert.ok(!none.ok && none.refusal.code === 'FIELD_UNKNOWN');
  const two = rowGrantShares(CATALOG, { who: SAM, list: 'accounts', row: JOINT, lines: ['transfers'], can: 'view' });
  assert.ok(!two.ok && two.refusal.at === 'lines.0.field');
  assert.ok(rowGrantShares(CATALOG, { who: SAM, list: 'accounts', row: JOINT, lines: [{ list: 'transfers', field: 'to' }], can: 'view' }).ok);
});

test('VIEW reads the account and its lines, nothing else, and writes nothing', () => {
  const lens = lensFor('view');
  assert.ok(canReadRow(lens, CATALOG, 'accounts', row(JOINT, { name: 'Joint' })));
  assert.ok(!canReadRow(lens, CATALOG, 'accounts', row(OTHER, { name: 'Mine' })));
  assert.ok(canReadRow(lens, CATALOG, 'transactions', line('t1', JOINT)));
  assert.ok(!canReadRow(lens, CATALOG, 'transactions', line('t2', OTHER)));
  assert.ok(!canReadRow(lens, CATALOG, 'categories', row('c1', { name: 'Food' })));
  assert.ok(!canWriteRow(lens, CATALOG, 'transactions', line('t1', JOINT), line('t1', JOINT, 'Food')));
  assert.ok(!canWriteRow(lens, CATALOG, 'transactions', null, line('t3', JOINT)));
});

test('EDIT changes and adds lines on the account, and never moves one off it', () => {
  const lens = lensFor('edit');
  assert.ok(canWriteRow(lens, CATALOG, 'transactions', line('t1', JOINT), line('t1', JOINT, 'Food')));
  assert.ok(canWriteRow(lens, CATALOG, 'transactions', null, line('t3', JOINT)), 'a new line on the account');
  assert.ok(!canWriteRow(lens, CATALOG, 'transactions', null, line('t4', OTHER)), 'a new line on another account');
  assert.ok(!canWriteRow(lens, CATALOG, 'transactions', line('t1', JOINT), line('t1', OTHER)), 'moving a line off');
  assert.ok(!canWriteRow(lens, CATALOG, 'transactions', line('t2', OTHER), line('t2', JOINT)), 'pulling a line on');
  assert.ok(canWriteRow(lens, CATALOG, 'transactions', line('t1', JOINT), null), 'a line deleted');
  assert.ok(canWriteRow(lens, CATALOG, 'accounts', row(JOINT, { name: 'Joint' }), row(JOINT, { name: 'Household' })));
  assert.ok(!canWriteRow(lens, CATALOG, 'accounts', row(JOINT, { name: 'Joint' }), null), 'the account is never deleted');
});

test('THE LIVE PATH GATES THE SAME FIELD: account on the lines, nothing on the account row', () => {
  const built = rowGrantShares(CATALOG, { who: SAM, list: 'accounts', row: JOINT, lines: ['transactions'], can: 'edit' });
  assert.ok(built.ok);
  const shares: HeldShare[] = built.value.shares.map((s, i) => ({ ...s, id: `sh_${i}` }));
  assert.deepEqual(gateFields(shares, CATALOG, 'transactions', NOW), ['account']);
  assert.deepEqual(gateFields(shares, CATALOG, 'accounts', NOW), []);
});

test('NO GRANT, NO SIGHT: the stranger reads and writes nothing', () => {
  assert.ok(!canReadRow(null, CATALOG, 'accounts', row(JOINT, {})));
  assert.ok(!canWriteRow(null, CATALOG, 'transactions', null, line('t1', JOINT)));
});

test('THE KEPT BUNDLE reads back as one row grant, and an ordinary share does not', () => {
  const built = rowGrantShares(CATALOG, { who: SAM, list: 'accounts', row: JOINT, lines: ['transactions'], can: 'view', until: '2026-12-01T00:00:00.000Z' });
  assert.ok(built.ok);
  const kept = (s: (typeof built.value.shares)[number], i: number, bundle: string | null): ShareKept => ({
    ...s, id: `sh_${bundle ?? 'x'}_${i}`, bundle, template: null, note: null, parent_id: null, version: 1, made_by: 'p_owner', made_at: '2026-10-29T12:00:00.000Z', revoked_by: null, revoked_at: null, first_used_at: null,
  });
  const grants = rowGrantsIn([...built.value.shares.map((s, i) => kept(s, i, 'b1')), kept({ effect: 'allow', who: SAM, what: { lists: ['categories'] }, can: 'view' }, 0, null)]);
  assert.equal(grants.length, 1);
  assert.deepEqual({ ...grants[0], ids: grants[0]!.ids.length }, {
    bundle: 'b1', who: SAM, list: 'accounts', row: JOINT, lines: [{ list: 'transactions', field: 'account' }], can: 'view', until: '2026-12-01T00:00:00.000Z', made_by: 'p_owner', made_at: '2026-10-29T12:00:00.000Z', ids: 2,
  });
});
