/**
 * Two projects that report a measure of the same name are told apart by the project, on a tile, a chart and a reading
 * read once; a name only one project uses stays as it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, type Block } from 'braindog-render';

import './fixtures/fill.ts';
import { latestText, linesAndLatest, linesText, measureLabel, tileRows, type Measure } from './measures.ts';

const keys = ['2026-09-15', '2026-09-16', '2026-09-17'];
const at = '2026-09-17T09:00:00.000Z';
const series = (name: string, of: string | undefined, now: (number | null)[]): Measure => ({
  name,
  ...(of !== undefined ? { of } : {}),
  unit: '',
  bucket: 'day',
  keys,
  now,
  was: [null, null, null],
  latest: { value: now.at(-1) ?? 0, at, day: '2026-09-17' },
});

const blocks = (text: string): Block[] => parse(text, { page: true }).filter((s): s is Block => s.type === 'block');

test('A NAME TWO PROJECTS SHARE IS SAID WITH ITS PROJECT, and a name one project uses is left as it is', () => {
  const shared = new Set(['Orders']);
  assert.equal(measureLabel({ name: 'Orders', of: 'Kiln' }, shared), 'Orders · Kiln');
  assert.equal(measureLabel({ name: 'Orders' }, shared), 'Orders', 'a measure the record named no project for has nothing to add');
  assert.equal(measureLabel({ name: 'Users', of: 'Kiln' }, shared), 'Users');
});

test('TWO TILES OF ONE NAME NAME THEIR PROJECTS', () => {
  const rows = tileRows([series('Orders', 'Kiln', [1, 2, 3]), series('Orders', 'Portage', [4, 5, 6]), series('Users', 'Kiln', [7, 8, 9])]);
  assert.deepEqual(
    rows.map((r) => r.split(' | ')[0]),
    ['Orders · Kiln', 'Orders · Portage', 'Users'],
  );
});

test('TWO CHARTS OF ONE NAME ARE HEADED BY THEIR PROJECTS, and one name across a chart and a reading read once too', () => {
  const drawn = blocks(linesText([series('Orders', 'Kiln', [1, 2, 3]), series('Orders', 'Portage', [4, 5, 6])]));
  assert.deepEqual(drawn.map((b) => b.heading), ['Orders · Kiln', 'Orders · Portage']);
  assert.equal(drawn[0]!.rows[0]!.cells[1], 'Orders · Kiln');

  /* ONE PROJECT CHARTED, THE OTHER READ ONCE: each set is told apart against the other. */
  const once = [{ measure: 'Orders', of: 'Portage', value: 12, unit: '', at, day: '2026-09-17' }];
  const lines = [series('Orders', 'Kiln', [1, 2, 3])];
  assert.deepEqual(blocks(linesText(lines, once)).map((b) => b.heading), ['Orders · Kiln']);
  assert.deepEqual(blocks(latestText(once, true, lines))[0]!.rows.map((r) => r.cells[0]), ['Orders · Portage']);
});

test('READINGS READ ONCE OF ONE NAME NAME THEIR PROJECTS, and the project survives the split the tab works out', () => {
  const once = [
    { measure: 'Orders', of: 'Kiln', value: 3, unit: '', at, day: '2026-09-17' },
    { measure: 'Orders', of: 'Portage', value: 6, unit: '', at, day: '2026-09-17' },
    { measure: 'Users', value: 9, unit: '', at, day: '2026-09-17' },
  ];
  assert.deepEqual(blocks(latestText(once, false))[0]!.rows.map((r) => r.cells[0]), ['Orders · Kiln', 'Orders · Portage', 'Users']);

  const split = linesAndLatest([series('Orders', 'Kiln', [null, null, 3]), series('Orders', 'Portage', [null, null, 6])]);
  assert.deepEqual(split.latest.map((m) => m.of), ['Kiln', 'Portage']);
});
