/**
 * A `stat` over a register and no figures reads the register's rows, so a host draws one tile a measure
 * from the numbers a project reported, and a `lines` block reads them the same way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 17, 12);
const OWNER = { actor: 'p_1' };

const POINTS: Declaration = {
  id: 'register.points',
  kind: 'register',
  body: {
    id: 'points',
    name: 'Points',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'value', type: 'decimal', required: true },
      { id: 'at', type: 'instant' },
    ],
  },
};

const OPEN: Declaration = {
  id: 'metric.points-count',
  kind: 'metric',
  body: { metric: 'points-count', name: 'Points', source: 'register.points', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' },
};

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

test('a stat over a register with no cells answers the rows, and one with cells still answers its figures', async () => {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([POINTS, OPEN]));
  value(k.create('points', { name: 'Sign-ups', value: 12, at: '2026-09-16T08:00:00.000Z' }, OWNER));
  value(k.create('points', { name: 'Sign-ups', value: 15, at: '2026-09-17T08:00:00.000Z' }, OWNER));

  const tiles = k.block({ kind: 'stat', source: 'register.points', columns: [{ field: 'at' }, { field: 'value' }, { field: 'name' }], order: [{ field: 'at', dir: 'desc' }], limit: 500 }) as { rows: { fields: Record<string, unknown> }[]; readings?: unknown; matched: number };
  assert.equal(tiles.readings, undefined);
  assert.equal(tiles.matched, 2);
  assert.deepEqual(tiles.rows.map((r) => r.fields.value), [15, 12]);

  const lines = k.block({ kind: 'lines', source: 'register.points', columns: [{ field: 'at' }, { field: 'value' }] }) as { rows: unknown[] };
  assert.equal(lines.rows.length, 2);

  const figures = k.block({ kind: 'stat', cells: [{ metric: 'points-count' }] }) as { readings?: { reading: { value: number } | null }[] };
  assert.equal(figures.readings?.[0]?.reading?.value, 2);

  /* A STAT WITH NEITHER is still the figures branch, answering none, as it always did. */
  const bare = k.block({ kind: 'stat' }) as { readings?: unknown[] };
  assert.deepEqual(bare.readings, []);
});
