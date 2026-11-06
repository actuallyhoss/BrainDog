/**
 * A list of readings as a `stat` or `lines` block reads it, held while the lists it read stand.
 *
 * MEASURED: two scans of 9,767 readings, 15 of `page(all-numbers)`'s 34 ms warm and 13 of `page(home-founder)`'s 29. What is
 * asserted is that a second ask reads no reading, and that a new reading, an edit, a delete and a project renamed are each in
 * the next answer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type MeasureSeries } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const P = { actor: 'p_1' };

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'name', scopes: { repos: 'repos', folders: 'folders' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }, { id: 'folders', type: 'list', of: 'text' }] },
} as never;
const NUMBERS: Declaration = {
  id: 'register.numbers',
  kind: 'register',
  body: {
    id: 'numbers',
    name: 'Numbers',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, index: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'unit', type: 'text' },
      { id: 'thing', type: 'ref', to: 'things', index: true },
      { id: 'at', type: 'instant', index: true },
    ],
  },
} as never;
const BLOCK = { kind: 'stat', source: 'register.numbers', columns: [{ field: 'at' }, { field: 'value' }, { field: 'name' }, { field: 'unit' }], back: 7 };

async function made() {
  const sql = openSqlite();
  const statements: string[] = [];
  const all = sql.all.bind(sql);
  sql.all = ((q: string, ...a: never[]) => (statements.push(q), all(q, ...a))) as typeof sql.all;
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([THINGS, NUMBERS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const make = (register: string, fields: Record<string, unknown>): Entry => {
    const out = k.create(register, fields, P);
    assert.ok(out.ok, JSON.stringify(out));
    return out.value as Entry;
  };
  const drawn = () => {
    const out = k.block(BLOCK as never) as unknown as { measures: MeasureSeries[]; refusals: unknown[] };
    assert.deepEqual(out.refusals, []);
    return out.measures.map((m) => [m.name, m.of ?? null, m.latest?.value ?? null]);
  };
  const scans = () => statements.filter((q) => /json_extract\(fields, '\$\.at'\) AS at/u.test(q)).length;
  return { sql, k, make, drawn, statements, scans };
}

test('A SECOND ASK READS NO READING, and answers the same', async () => {
  const { make, drawn, statements, scans } = await made();
  const thing = make('things', { name: 'Kiln' });
  make('numbers', { name: 'Orders', value: 3, thing: thing.id, at: '2026-09-16T08:00:00.000Z' });
  const first = drawn();
  assert.deepEqual(first, [['Orders', 'Kiln', 3]]);
  statements.length = 0;
  assert.deepEqual(drawn(), first);
  assert.equal(scans(), 0, 'a held block read its readings again');
});

test('A READING ADDED, EDITED OR DELETED IS IN THE NEXT ANSWER', async () => {
  const { sql, k, make, drawn } = await made();
  const one = make('numbers', { name: 'Orders', value: 3, at: '2026-09-16T08:00:00.000Z' });
  assert.deepEqual(drawn(), [['Orders', null, 3]]);
  const two = make('numbers', { name: 'Orders', value: 5, at: '2026-09-17T08:00:00.000Z' });
  assert.deepEqual(drawn(), [['Orders', null, 5]]);
  assert.ok(k.update('numbers', two.id, { value: 8 }, P).ok);
  assert.deepEqual(drawn(), [['Orders', null, 8]]);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), two.id);
  assert.deepEqual(drawn(), [['Orders', null, 3]]);
  void one;
});

test('A PROJECT RENAMED IS RENAMED IN THE NEXT ANSWER: its title is read from its own list', async () => {
  const { k, make, drawn, statements, scans } = await made();
  const thing = make('things', { name: 'Kiln' });
  make('numbers', { name: 'Orders', value: 3, thing: thing.id, at: '2026-09-16T08:00:00.000Z' });
  assert.deepEqual(drawn(), [['Orders', 'Kiln', 3]]);
  assert.ok(k.update('things', thing.id, { name: 'Oxbow' }, P).ok);
  assert.deepEqual(drawn(), [['Orders', 'Oxbow', 3]]);
  statements.length = 0;
  drawn();
  assert.equal(scans(), 0, 'reading a title by its list stopped it being held');
});
