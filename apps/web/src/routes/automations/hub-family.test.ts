/**
 * Rules of one family fold into one row: the members keep their order, the count is the sum, the newest firing wins,
 * and the name is words the rows already say, never the record's key. Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { families, familyName, familySaid, type Kin } from './hub-family.ts';

const NOW = new Date(2026, 9, 14, 12).getTime();
const KEY = 'reg_parcels/inline/set:shelf';

const kin = (key: string, fired: number | undefined, lastAt: string | null = null, family: string | null = KEY): Kin => ({
  key,
  fired,
  lastAt,
  family: family === null ? undefined : { key: family, list: 'Parcels', did: ['Shelf'] },
});

test('RULES THAT SHARE A FAMILY FOLD INTO ONE ROW WHERE THE FIRST OF THEM WAS, members in the order they came', () => {
  const rows = [kin('lonely', 3, null, null), kin('north', 2), kin('other', 1, null, 'reg_parcels/inline/tag'), kin('south', 0), kin('east', 5)];
  const out = families(rows);
  assert.deepEqual(
    out.map((f) => (f.kind === 'one' ? f.row.key : `family of ${f.family.members.map((m) => m.key).join(',')}`)),
    ['lonely', 'family of north,south,east', 'other'],
  );
});

test('A FAMILY OF ONE IS THE RULE ITSELF', () => {
  const out = families([kin('only', 4), kin('free', 1, null, null)]);
  assert.deepEqual(out.map((f) => f.kind), ['one', 'one']);
});

test('A FAMILY SUMS ITS COUNT, TAKES THE NEWEST FIRING, AND COUNTS THE ONES THAT NEVER RAN', () => {
  const out = families([kin('a', 3, new Date(2026, 9, 3, 9).toISOString()), kin('b', 0), kin('c', 9, new Date(2026, 9, 10, 9).toISOString())]);
  const f = out[0];
  assert.ok(f?.kind === 'family');
  assert.equal(f.family.count, 3);
  assert.equal(f.family.fired, 12);
  assert.equal(f.family.never, 1);
  assert.equal(f.family.lastAt, new Date(2026, 9, 10, 9).toISOString());
  assert.equal(familySaid(f.family, NOW), 'Ran 12 times, last on 10 Oct. One never ran.');
});

test('A FAMILY WITH A MEMBER THAT CAME WITH NO COUNT SAYS NO SUM, and one where none ran says so', () => {
  const some = families([kin('a', 3), kin('b', undefined)])[0];
  assert.ok(some?.kind === 'family');
  assert.equal(some.family.fired, null);
  assert.equal(familySaid(some.family, NOW), '');
  const none = families([kin('a', 0), kin('b', 0)])[0];
  assert.ok(none?.kind === 'family');
  assert.equal(familySaid(none.family, NOW), 'None of them has run.');
});

test("A FAMILY'S NAME IS THE FIELDS AND THE LIST, NEVER THE KEY", () => {
  const f = families([kin('a', 1), kin('b', 1)])[0];
  assert.ok(f?.kind === 'family');
  assert.equal(f.family.name, 'Shelf on Parcels');
  assert.doesNotMatch(f.family.name, /reg_|inline|set:|\//u);
  assert.equal(familyName('Parcels', ['Shelf', 'Tags']), 'Shelf and Tags on Parcels');
  assert.equal(familyName('Parcels', []), 'Rules on Parcels');
});
