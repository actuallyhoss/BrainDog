/**
 * `{{<figure>.first}}`, `.names`, `.more` and `.since`: the rows a counting figure counts, as a page's line names them
 * (`pages.ts` `rowsValue`). The one furthest past the figure's day leads, a row with no title is counted and not named,
 * and `first` and `since` are the same row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import type { BlockResult } from '../src/pages.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);

const value = <T>(r: unknown): T => {
  const got = r as { ok: boolean; value?: T };
  assert.ok(got.ok, JSON.stringify(r));
  return got.value as T;
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'in_touch', type: 'day' }] } as never,
};

const QUIET: Declaration = {
  id: 'metric.quiet',
  kind: 'metric',
  body: { metric: 'quiet', name: 'Quiet', source: 'register.people', where: 'in_touch before -90d', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const PAGE: Declaration = {
  id: 'page.people',
  kind: 'page',
  body: {
    page: 'people',
    title: 'People',
    requires: ['register.people'],
    blocks: [{ kind: 'note', lead: true, body: '{{quiet.first}} has been quiet since {{quiet.since}}; {{quiet.names}}; {{quiet.more}}' }],
  } as never,
};

async function read(people: Record<string, unknown>[]): Promise<Record<string, unknown>> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  value(await k.install([PEOPLE, QUIET, PAGE]));
  for (const p of people) value(k.create('people', p, { actor: 'p_1' }));
  const page = value<{ blocks: BlockResult[] }>(k.page('people'));
  return ((page.blocks[0] as { values?: Record<string, unknown> }).values ?? {}) as Record<string, unknown>;
}

test('THE ONE QUIET LONGEST LEADS, by the day the figure compares, and the rest are named or counted', async () => {
  const said = await read([
    { name: 'Halden', in_touch: '2026-05-01' },
    { name: 'Pell & Vine', in_touch: '2026-04-12' },
    { name: 'Marlow', in_touch: '2026-09-30' },
  ]);
  assert.equal(said['quiet.first'], 'Pell & Vine');
  assert.equal(said['quiet.since'], '2026-04-12');
  assert.equal(said['quiet.names'], 'Pell & Vine and Halden');
  assert.equal(said['quiet.more'], 1);
});

test('PAST THREE, TWO ARE NAMED AND THE REST COUNTED', async () => {
  const said = await read(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((d, i) => ({ name: `P${i + 1}`, in_touch: d })));
  assert.equal(said['quiet.names'], 'P1, P2 and 3 more');
  assert.equal(said['quiet.more'], 4);
});

test('A ROW WITH NO TITLE IS COUNTED AND NOT NAMED, and first and since are one row', async () => {
  const said = await read([
    { in_touch: '2026-01-01' },
    { name: 'Halden', in_touch: '2026-05-01' },
    { in_touch: '2026-02-01' },
  ]);
  assert.equal(said['quiet.first'], 'Halden');
  assert.equal(said['quiet.since'], '2026-05-01', 'the day of another row than the one named');
  assert.equal(said['quiet.names'], 'Halden and 2 more', 'one name said as if it were all three');
  assert.equal(said['quiet.more'], 2);
});
