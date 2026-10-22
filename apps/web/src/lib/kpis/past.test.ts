/**
 * A key number's past values (`past.ts`): its readings on its project, newest first and eight at most, matched whole or
 * by the glued name an import writes; who set each, read off the row's history; and a change that writes the value
 * alone, money in the reading's own currency, with what puts it back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kpis as words } from '../copy/kpis.ts';
import type { Entry, Fields } from '../record/schema.ts';
import { PAST_MOST, pastAfter, pastBackOf, pastOf, pastPatchOf, pastWhere, setByOf, whoSaid, type Past } from './past.ts';

const KILN = { id: '01KILN', name: 'Kiln' };
let seq = 0;
const row = (fields: Fields, version = 1): Entry => ({ seq: ++seq, fields, version, created: '2026-10-01T00:00:00.000Z', by: '' });

test('THE READ ASKS FOR THIS NUMBER ALONE: its measure on its project, or the glued name an import wrote', () => {
  assert.deepEqual(pastWhere({ name: 'Studios licensed' }, KILN, 'thing'), {
    any: [{ all: [{ field: 'thing', is: '01KILN' }, { field: 'name', is: 'Studios licensed' }] }, { field: 'name', is: 'Studios licensed, Kiln' }],
  });
  /* A NUMBER WHOSE READINGS ARE SAVED UNDER ANOTHER NAME is read under that name. */
  const w = pastWhere({ name: 'Studios', measure: 'Studios licensed' }, KILN, 'thing') as { any: { all?: { is: string }[] }[] };
  assert.equal(w.any[0]!.all![1]!.is, 'Studios licensed');
});

test('ITS PAST: newest first, on its project only, matched in any case and the glued name too, eight at most', () => {
  const rows = [
    row({ name: 'Studios licensed', thing: '01KILN', value: 50, unit: 'studios', at: '2026-10-14T09:00:00.000Z' }),
    row({ name: 'studios  licensed', thing: '01KILN', value: 52, unit: 'studios', at: '2026-10-21T09:00:00.000Z' }),
    row({ name: 'Studios licensed', thing: '01OTHER', value: 9, at: '2026-10-22T09:00:00.000Z' }),
    row({ name: 'Studios licensed, Kiln', thing: null, value: 48, at: '2026-10-07' }),
    row({ name: 'Specimen downloads', thing: '01KILN', value: 251, at: '2026-10-21T09:00:00.000Z' }),
    row({ name: 'Studios licensed', thing: '01KILN', at: '2026-10-20T09:00:00.000Z' }),
  ];
  const past = pastOf(rows, { name: 'Studios licensed' }, KILN, 'thing');
  assert.deepEqual(
    past.map((p) => p.value),
    [52, 50, 48],
  );
  assert.equal(past[0]!.typed, '52');
  assert.equal(past[0]!.unit, 'studios');
  const many = Array.from({ length: 12 }, (_, i) => row({ name: 'Studios licensed', thing: '01KILN', value: i, at: `2026-09-${String(10 + i)}T09:00:00.000Z` }));
  const kept = pastOf(many, { name: 'Studios licensed' }, KILN, 'thing');
  assert.equal(kept.length, PAST_MOST);
  assert.equal(kept[0]!.value, 11);
});

test('MONEY IS KEPT IN ITS OWN CURRENCY, as an object or the JSON text a page sends, and typed back in whole units', () => {
  const past = pastOf(
    [
      row({ name: 'Revenue a month', thing: '01KILN', amount: { amount: 230_000, currency: 'GBP' }, at: '2026-09-28T12:00:00.000Z' }),
      row({ name: 'Revenue a month', thing: '01KILN', amount: '{"amount":875050,"currency":"usd"}', at: '2026-10-28T12:00:00.000Z' }),
    ],
    { name: 'Revenue a month' },
    KILN,
    'thing',
  );
  assert.deepEqual(past[0]!.money, { amount: 875_050, currency: 'USD' });
  assert.equal(past[0]!.value, null);
  assert.equal(past[0]!.typed, '8,750.5');
  assert.equal(past[1]!.typed, '2,300');
});

test('WHO SET IT: the newest event that wrote its value, else whoever made it, said as a name', () => {
  assert.equal(
    setByOf([
      { ts: '1', actor: 'p_sami', field: null },
      { ts: '2', actor: 'agent:claude', field: 'note' },
    ]),
    'p_sami',
  );
  assert.equal(
    setByOf([
      { ts: '1', actor: 'p_sami', field: null },
      { ts: '2', actor: 'agent:claude', field: 'value' },
    ]),
    'agent:claude',
  );
  assert.equal(setByOf([]), null);
  assert.equal(whoSaid('agent:claude', null, new Map()), 'Claude');
  assert.equal(whoSaid('p_mara', null, new Map([['p_mara', 'Mara']])), 'Mara');
});

const plain: Past = { seq: 4, version: 2, at: '2026-10-21T09:00:00.000Z', value: 52, money: null, unit: 'studios', typed: '52' };
const money: Past = { seq: 5, version: 3, at: '2026-09-28T12:00:00.000Z', value: null, money: { amount: 230_000, currency: 'GBP' }, unit: '', typed: '2,300' };

test('A CHANGE WRITES THE VALUE ALONE: a plain number as value, money as an amount in its own currency', () => {
  assert.deepEqual(pastPatchOf(plain, '53'), { ok: true, patch: { value: 53 }, same: false });
  assert.deepEqual(pastPatchOf(plain, ' 52 '), { ok: true, patch: { value: 52 }, same: true });
  assert.deepEqual(pastPatchOf(money, '2,450.50'), { ok: true, patch: { amount: { amount: 245_050, currency: 'GBP' } }, same: false });
  assert.deepEqual(pastPatchOf(plain, ''), { ok: false, fault: words.kpiReadingEmpty });
  assert.deepEqual(pastPatchOf(plain, 'lots'), { ok: false, fault: words.kpiNotDigits('lots') });
});

test('PUT BACK: the value it held before, and the list draws the new one at the row’s new version', () => {
  assert.deepEqual(pastBackOf(plain), { value: 52 });
  assert.deepEqual(pastBackOf(money), { amount: { amount: 230_000, currency: 'GBP' } });
  assert.deepEqual(pastAfter(plain, { value: 1200 }, 3), { ...plain, version: 3, value: 1200, typed: '1,200' });
  assert.deepEqual(pastAfter(money, { amount: { amount: 245_050, currency: 'GBP' } }, 4), { ...money, version: 4, money: { amount: 245_050, currency: 'GBP' }, typed: '2,450.5' });
});
