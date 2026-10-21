/**
 * Where a record keeps its key numbers, found by shape, and the rows of one project: kept, suggested, and by id.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS } from '../record/held.ts';
import type { Entry, Fields } from '../record/schema.ts';
import { draftsOf, findKpiList, keptOf, kpiListIn, readKpis, rowOf } from './kpi-rows.ts';

const f = (id: string, type = 'text', to?: string) => ({ id, type, ...(to ? { to } : {}) });
const NUMBERS = { fields: ['name', 'measure', 'figure', 'today', 'headline'].map((id) => f(id)).concat([f('thing', 'ref', 'ventures')]) };
const READINGS = { fields: [f('name'), f('value', 'decimal'), f('thing', 'ref', 'ventures')] };

test('THE LIST IS FOUND BY ITS SHAPE, never by its id, and only one that links to the projects named', () => {
  assert.equal(kpiListIn({ readings: READINGS as never, 'my-numbers': NUMBERS as never }), 'my-numbers');
  assert.equal(kpiListIn({ 'my-numbers': NUMBERS as never }, 'ventures'), 'my-numbers');
  assert.equal(kpiListIn({ 'my-numbers': NUMBERS as never }, 'clients'), null, 'its link points at another list');
  assert.equal(kpiListIn({ readings: READINGS as never }), null);
  const unlinked = { fields: NUMBERS.fields.map((x) => (x.id === 'thing' ? f('thing') : x)) };
  assert.equal(kpiListIn({ loose: unlinked as never }), null, 'a list of the same words with no link is not it');
});

test('A LIST THIS TAB HAS NOT BEEN TOLD ABOUT IS ASKED ONCE, and one it knows is not asked at all', async () => {
  const asked: string[] = [];
  const schema = async (id: string) => {
    asked.push(id);
    return id === 'shape-numbers' ? { ok: true, value: { id, name: 'Numbers', one: 'number', title: 'name', fields: NUMBERS.fields } } : { ok: true, value: { id, fields: [f('name')] } };
  };
  REGISTERS['shape-projects'] = { id: 'shape-projects', name: 'Projects', one: 'project', title: 'name', fields: [f('name')] } as never;
  assert.equal(await findKpiList({ schema }, ['shape-projects', 'shape-numbers', 'shape-other'], 'ventures'), 'shape-numbers');
  assert.deepEqual(asked.sort(), ['shape-numbers', 'shape-other']);
  assert.equal(await findKpiList({ schema }, ['shape-projects', 'shape-numbers', 'shape-other'], 'ventures'), 'shape-numbers');
  assert.equal(asked.length, 2, 'known now, so nothing is asked again');
  delete REGISTERS['shape-projects'];
  delete REGISTERS['shape-numbers'];
  delete REGISTERS['shape-other'];
});

const row = (seq: number, fields: Fields, id = `K${seq}`): Entry => ({ id, seq, version: 1, created: '', by: '', fields: { name: `Number ${seq}`, thing: 'P1', ...fields } });

test('KEPT, SUGGESTED AND BY ID: one project\'s rows, a stopped number on none of them', () => {
  const rows = [row(3, { draft: true }), row(1, {}), row(2, { draft: true }), row(4, { thing: 'P2' }), row(5, { state: 'retired' }), row(6, { draft: true, state: 'retired' })];
  assert.deepEqual(keptOf(rows, 'P1').map((r) => r.seq), [1]);
  assert.deepEqual(draftsOf(rows, 'P1').map((r) => r.seq), [2, 3], 'oldest first');
  assert.deepEqual(draftsOf(rows, 'P2'), []);
  assert.equal(rowOf(rows, 'K4')?.seq, 4);
  assert.equal(rowOf(rows, 'K9'), null);
  assert.equal(rowOf(rows, undefined), null);
});

test('EVERY ROW IS READ, page after page, as stored; a refused read is null, not an empty list', async () => {
  const pages: Record<string, { rows: unknown[]; cursor: string | null }> = {
    first: { rows: [{ id: 'K1', seq: 1, version: 2, created_at: '', fields: { name: 'Players', thing: 'P1' } }], cursor: 'next' },
    next: { rows: [{ id: 'K2', seq: 2, version: 1, created_at: '', fields: { name: 'Revenue', thing: 'P1' } }], cursor: null },
  };
  const list = async (args: { cursor?: string | null }) => ({ ok: true as const, value: pages[args.cursor ?? 'first']! });
  const got = await readKpis({ list }, 'my-numbers');
  assert.deepEqual(got?.map((e) => [e.id, e.seq, e.version, e.fields.thing]), [['K1', 1, 2, 'P1'], ['K2', 2, 1, 'P1']]);
  assert.equal(await readKpis({ list: async () => ({ ok: false as const }) }, 'my-numbers'), null);
});
