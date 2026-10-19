/**
 * What landed: only arrivals with a name to say, newest first, filed under the list's name, by name and never by id,
 * with the washed set being only what was not drawn before.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANDED_MOST, freshOf, landedOf, type Line } from './landed.ts';

const NOW = Date.parse('2026-10-19T10:00:00Z');
const lists = new Map([['payments', 'Payments']]);
const line = (id: string, over: Partial<Line> = {}): Line => ({
  id,
  ts: '2026-10-19T09:48:00Z',
  actor: 'agent:claude',
  kind: 'create',
  register: 'payments',
  seq: 7,
  title: 'Talabat',
  note: null,
  ...over,
});

test('an arrival is drawn with who, what, when and where it was filed', () => {
  const [r] = landedOf([line('a', { note: 'EGP 312' })], lists, null, NOW);
  assert.equal(r?.name, 'Talabat');
  assert.equal(r?.note, 'EGP 312');
  assert.equal(r?.to, 'Payments');
  assert.equal(r?.who, 'Claude');
  assert.equal(r?.kind, 'agent');
  assert.equal(r?.href, '/r/payments/7');
  assert.match(r?.at ?? '', /12 min/u);
});

test('edits, heartbeats, nameless lines and minted ids are not arrivals', () => {
  const rows = landedOf(
    [line('a', { kind: 'edit' }), line('b', { register: 'session' }), line('c', { title: null }), line('d', { title: '01HZX3Y4ABCDEFGHJKMNPQRSTV' }), line('e')],
    lists,
    null,
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => r.key),
    ['e'],
  );
});

test('the reader is You and a list the record does not name is not said', () => {
  const [r] = landedOf([line('a', { actor: 'p_me', register: 'other' })], lists, 'p_me', NOW);
  assert.equal(r?.who, 'You');
  assert.equal(r?.to, null);
});

test('no more than the most are drawn, and no dash is said in a note', () => {
  const many = Array.from({ length: LANDED_MOST + 4 }, (_, i) => line(`k${i}`));
  assert.equal(landedOf(many, lists, null, NOW).length, LANDED_MOST);
  assert.equal(landedOf([line('a', { note: 'paid — filed' })], lists, null, NOW)[0]?.note, 'paid, filed');
});

test('only a line not drawn before is washed, and the first read washes nothing', () => {
  const rows = [{ key: 'a' }, { key: 'b' }];
  assert.equal(freshOf(null, rows).size, 0);
  assert.deepEqual([...freshOf(new Set(['a']), rows)], ['b']);
});
