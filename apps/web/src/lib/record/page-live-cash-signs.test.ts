/**
 * Cash ahead's Coming in and Going out are signed by what they are (RN7).
 *
 * A Today arranged before the cells carried a `sign` is kept on the record's `home` page with cells that have none, so
 * the two figures read as one kind of number. The reader signs `arriving-30d` in and `leaving-30d` out by the figure,
 * and a cell that says its own way keeps it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { blockOf } from './page-live.ts';

const NOW = Date.parse('2026-10-31T09:00:00Z');

const reading = (value: number) => ({ value, unit: 'EGP', rows: 3, held: 3, met: null, refusals: [] });

/** Cash ahead as an arranged Today keeps it: the cells as they were saved, with what the record read on them. */
const cash = (cells: Record<string, unknown>[]) =>
  blockOf(
    {
      kind: 'stat',
      key: 'cash',
      heading: 'Money',
      cells,
      readings: cells.map((c) => ({ metric: c.metric as string, label: c.label, reading: reading(1200000) })),
      rows: [],
      matched: 0,
      refusals: [],
    } as never,
    new Map(),
    NOW,
  );

test('a Cash ahead saved with no signs signs Coming in and Going out by their figures', () => {
  const b = cash([
    { metric: 'cash-now', label: 'Cash now' },
    { metric: 'arriving-30d', label: 'Coming in, 30 days' },
    { metric: 'leaving-30d', label: 'Going out, 30 days' },
  ]);
  assert.deepEqual(
    (b.metrics ?? []).map((m) => m.sign),
    [undefined, 'in', 'out'],
  );
});

test('a cell that says its own way keeps it', () => {
  const b = cash([{ metric: 'arriving-30d', label: 'Coming in', sign: 'out' }]);
  assert.equal(b.metrics?.[0]?.sign, 'out');
});
