/**
 * The names and marks a live row's refs are drawn with: from the record's own rows, never from the sample's rows of
 * the same numbers, and kept whole when a second page's names join the first's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { display, identityFor, identityOf, REGISTERS } from './api.ts';
import { ROWS } from './fixtures/sample.ts';
import { joinNames, namesOf, refMapOf } from './remote.ts';

/* A register the seed declares with an identity, and a list with a ref pointing at it. */
const TARGET = Object.values(REGISTERS).find((r) => r.identity)!;
const [FROM, FIELD] = (() => {
  for (const r of Object.values(REGISTERS))
    for (const f of r.fields) if (f.type === 'ref' && f.to === TARGET.id) return [r.id, f.id] as const;
  throw new Error('nothing refs a register with an identity, so this proves nothing');
})();
const SAMPLE = ROWS[TARGET.id]![0]!;

const liveRow = (seq: number, title: string, mark: string, hue: number) => ({
  id: `01LIVE${seq}`,
  seq,
  fields: { [TARGET.title]: title, [TARGET.identity!.mark!]: mark, [TARGET.identity!.accent!]: hue },
});

test('a live ref is named and marked by the record, and the sample row of that number is never read', () => {
  const names = namesOf(new Map([[TARGET.id, refMapOf(TARGET.id, [liveRow(SAMPLE.seq, 'Live project', '◇', 42)])]]));
  assert.equal(display(FROM, FIELD, SAMPLE.seq, Date.now(), names), 'Live project');
  assert.deepEqual(identityOf(FROM, FIELD, SAMPLE.seq, names), { mark: '◇', hue: 42, name: 'Live project', retired: false });
  assert.deepEqual(identityFor(FROM, { [FIELD]: SAMPLE.seq }, names)?.name, 'Live project');
  assert.notEqual(SAMPLE.fields[TARGET.title], 'Live project');
});

test('a number the record did not name has no mark on a live row, and the sample still marks its own', () => {
  const names = namesOf(new Map());
  assert.equal(identityOf(FROM, FIELD, SAMPLE.seq, names), null);
  assert.equal(identityOf(FROM, FIELD, SAMPLE.seq)?.name, String(SAMPLE.fields[TARGET.title]));
});

test('joining a second page keeps the first page\'s names and marks, the later winning', () => {
  const first = namesOf(new Map([[TARGET.id, refMapOf(TARGET.id, [liveRow(1, 'One', 'a', 1), liveRow(2, 'Two', 'b', 2)])]]));
  const next = namesOf(new Map([[TARGET.id, refMapOf(TARGET.id, [liveRow(2, 'Two renamed', 'c', 3)])]]));
  const both = joinNames(first, next);
  assert.equal(both.get(`${TARGET.id}#1`), 'One');
  assert.equal(both.get(`${TARGET.id}#2`), 'Two renamed');
  assert.equal(both.marks?.get(`${TARGET.id}#1`)?.mark, 'a');
  assert.equal(both.marks?.get(`${TARGET.id}#2`)?.mark, 'c');
  assert.equal(joinNames(null, next).marks?.size, 1);
});

test('a live list sorted by a ref orders by the record\'s names, not the sample\'s', async () => {
  const { sortRows } = await import('./api.ts');
  const names = namesOf(new Map([[TARGET.id, refMapOf(TARGET.id, [liveRow(1, 'Zed', 'a', 1), liveRow(2, 'Alpha', 'b', 2)])]]));
  const rows = [1, 2].map((n) => ({ seq: n, fields: { [FIELD]: n }, version: 1, created: '', by: '' }));
  assert.deepEqual(sortRows(FROM, rows, FIELD, 'asc', names).map((e) => e.seq), [2, 1]);
});
