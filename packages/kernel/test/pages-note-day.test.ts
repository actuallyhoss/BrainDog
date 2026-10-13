/**
 * A figure that is a day, asked from a note, is answered as the day and not as its count of days since 1970.
 *
 * The latest `due` of a plan's parts is held as whole days (`metrics.ts`), which a tile formats from the figure's
 * `format`. A sentence has no format to read, so `{{last-due:Flat}}` would end "the last part on 20970". The page
 * answers the ISO day, which a host writes as it writes any other day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord } from '../src/index.ts';
import type { Declaration } from '../src/declare.ts';
import type { PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const PARTS: Declaration = {
  id: 'register.parts',
  kind: 'register',
  body: {
    id: 'parts',
    name: 'Parts',
    title: 'plan',
    fields: [
      { id: 'plan', type: 'text', required: true },
      { id: 'due', type: 'day' },
    ],
  },
};

const figure = (metric: string, more: Record<string, unknown>): Declaration => ({
  id: `metric.${metric}`,
  kind: 'metric',
  body: { metric, name: metric, source: 'register.parts', target: { gte: 0 }, window: '30d', compare: 'none', ...more } as never,
});

const LAST = figure('last-due', { where: 'plan is {{it}}', value: { max: 'due' }, format: 'day' });
const LATEST = figure('latest-due', { value: { max: 'due' }, format: 'day' });
const COUNT = figure('parts-of', { where: 'plan is {{it}}', value: { count: 'id' }, format: 'int' });

test('a day figure in a note is the ISO day, with a parameter and without, and a count stays a number', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PARTS, LAST, LATEST, COUNT]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const [plan, due] of [['Flat', '2027-04-01'], ['Flat', '2027-06-01'], ['Car', '2028-01-15']] as const) assert.ok(k.create('parts', { plan, due }, OWNER).ok);
  const out = k.block({ kind: 'note', body: '{{parts-of:Flat}} parts, the last on {{last-due:Flat}}; nothing after {{latest-due}}.' } as PageBlock);
  assert.deepEqual(out.refusals, [], JSON.stringify(out.refusals));
  assert.deepEqual(out.values, { 'parts-of:Flat': 2, 'last-due:Flat': '2027-06-01', 'latest-due': '2028-01-15' });
  sql.close();
});
