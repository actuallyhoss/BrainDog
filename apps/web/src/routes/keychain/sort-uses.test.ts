/**
 * `/keychain`'s order, dates and "Used by": pure, so no screen is needed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keysOf, type KeyRow } from '../../lib/record/keychain.ts';
import { changedSaid, expiresSaid, sortKeys, usesOf } from './tiles.ts';

const NOW = Date.parse('2026-10-26T12:00:00Z');

const key = (over: Partial<KeyRow>): KeyRow => ({
  id: over.label ?? 'k',
  spoken: null,
  label: 'Key',
  opens: '',
  project: null,
  scope: null,
  sealed: true,
  opened: 0,
  lastOpened: null,
  grant: 'g',
  ...over,
});

const KEYS = [
  key({ label: 'Registrar', opened: 3, lastOpened: '2026-10-20T09:00:00Z', changed: '2026-08-01T00:00:00Z' }),
  key({ label: 'Azure', opened: 12, lastOpened: '2026-10-25T09:00:00Z' }),
  key({ label: 'Backups', opened: 12, lastOpened: null, changed: '2026-10-01T00:00:00Z' }),
  key({ label: 'cache', opened: 0 }),
];
const names = (by: Parameters<typeof sortKeys>[1]): string[] => sortKeys(KEYS, by).map((k) => k.label);

test('SORT BY NAME IGNORES CASE, and does not touch the array it was given', () => {
  const before = KEYS.map((k) => k.label);
  assert.deepEqual(names('name'), ['Azure', 'Backups', 'cache', 'Registrar']);
  assert.deepEqual(
    KEYS.map((k) => k.label),
    before,
  );
});

test('RECENTLY OPENED, RECENTLY CHANGED AND MOST OPENED put a key with no date or no opens last, by name', () => {
  assert.deepEqual(names('opened-recently'), ['Azure', 'Registrar', 'Backups', 'cache']);
  assert.deepEqual(names('changed-recently'), ['Backups', 'Registrar', 'Azure', 'cache']);
  assert.deepEqual(names('most-opened'), ['Azure', 'Backups', 'Registrar', 'cache']);
});

test('A GRANT DATES A KEY, AND THE REGISTER SAYS WHEN IT EXPIRES', () => {
  const rows = [
    { id: 'r1', seq: 1, fields: { label: 'Stripe', opens: 'x', value: 'g1', expires: '2026-11-09' } },
    { id: 'r2', seq: 2, fields: { label: 'Plain', opens: 'y' } },
  ];
  const grants = [{ id: 'g1', opened: 1, last_opened: null, revoked_at: null, created_at: '2026-09-01T00:00:00Z', rotated_at: '2026-10-12T00:00:00Z' }];
  const [plain, stripe] = keysOf(rows, grants, new Map());
  assert.equal(stripe!.changed, '2026-10-12T00:00:00Z', 'the rotation wins over the first sealing');
  assert.equal(stripe!.expires, '2026-11-09');
  assert.equal('changed' in plain! || 'expires' in plain!, false, 'a key that dates nothing says nothing');
  assert.equal(changedSaid(stripe!, NOW), 'Changed 2 weeks ago');
  assert.equal(expiresSaid(stripe!, NOW), 'Expires in 2 weeks');
  assert.equal(expiresSaid({ ...stripe!, expires: '2026-10-20' }, NOW), 'Expired 6 days ago');
  assert.equal(changedSaid(plain!, NOW), null);
  assert.equal(expiresSaid(plain!, NOW), null);
});

test('USED BY NAMES ONLY WHAT NAMES THE KEY, by its label or its handle', () => {
  const k = key({ label: 'Stripe live', spoken: 'credentials#7' });
  const uses = usesOf(k, {
    actions: [
      { ingest: 'stripe-pull', key: 'Stripe live' },
      { ingest: 'other', key: 'Azure' },
      { ingest: 'open', key: null },
    ],
    tools: [
      { id: 't1', seq: 4, register: 'tools', fields: { name: 'Billing server', needs: ['credentials#7'] } },
      { id: 't2', seq: 5, fields: { name: 'Mail', needs: ['credentials#8', 'Azure'] } },
      { id: 't3', fields: { name: 'No needs' } },
    ],
    scripts: [
      { script: 'sweep', title: 'Sweep', keys: ['stripe live'] },
      { script: 'idle', title: 'Idle', keys: [] },
    ],
  });
  assert.deepEqual(uses, [
    { kind: 'action', name: 'stripe-pull', href: null },
    { kind: 'tool', name: 'Billing server', href: '/r/tools/4' },
    { kind: 'script', name: 'Sweep', href: null },
  ]);
  assert.deepEqual(usesOf(k, {}), []);
});

test('USED BY NAMES A TOOL THE RECORD SAYS NEEDS THE KEY, by its spoken id', () => {
  const k = key({ label: 'Stripe live', spoken: 'credentials#7' });
  const keyUses = [
    { credential: 'credentials#7', tool: 'tools#2', title: 'Billing server' },
    { credential: 'credentials#8', tool: 'tools#3', title: 'Mail' },
  ];
  assert.deepEqual(usesOf(k, { keyUses }), [{ kind: 'tool', name: 'Billing server', href: null }]);
});
