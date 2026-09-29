/**
 * What a figure over `thing is Kiln` counts when one Kiln was deleted and another made since.
 *
 * `723905b5` MADE A TITLE NAME EVERY ROW BEARING IT, DELETED ONES TOO, AND IT DID SO IN THE SHARED `evalContext()`. The
 * reason was `list`'s: a deleted row's jobs still point at it, so its name has to find them, as its spoken id and its
 * row id do. The same context reads every metric and every page `where`, so a figure "jobs on Kiln" now counts the jobs
 * pointing at a deleted Kiln beside the jobs on the live one. Before, the lookup was `deleted_at IS NULL ... LIMIT 1`
 * and the figure counted the live Kiln's alone. Measured here, before deciding:
 *
 *     k.metric(thing is Kiln, count)   value 3   (Glaze and Fire on the deleted Kiln, Throw on the live one)
 *     k.list(thing is Kiln)            Fire, Glaze, Throw
 *
 * THAT IS KEPT, AND THE REASON IS THE ONE THIS PACKAGE OPENS WITH: a metric reads the rows a list of
 * the same predicate reads, or the tile links to a page that contradicts it. Glaze and Fire are live
 * jobs; the deleted row is the Kiln, not them. A figure of 1 beside a list of three under the same
 * words would be the two-definitions failure `metrics.ts` exists to prevent, and the old lookup had
 * the other half of it too: `thing is not Kiln` counted Glaze and Fire as not on Kiln while no Kiln
 * query could reach them. Deleting a job still removes it from both, which is what "a deleted row does
 * not count" means for the register the figure is over.
 *
 * WHAT THIS DOES NOT SETTLE is whether deleting a thing should leave its jobs pointing at it at all.
 * That is the write path's question, and while it allows it, the list and the figure answer it alike.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel, type MetricDecl, type Reading } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'name', seq_prefix: 'P', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things' },
    ],
  } as never,
};

const ON_KILN = (where: MetricDecl['where']): MetricDecl => ({
  metric: 'jobs-on-kiln',
  name: 'Jobs on Kiln',
  source: 'register.jobs',
  where,
  value: { count: 'id' },
  format: 'int',
  target: { gte: 0 },
  window: '30d',
  compare: 'none',
});

async function twoKilns(): Promise<{ k: Kernel; gone: string; live: string; made: (r: string, f: Record<string, unknown>) => string }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  assert.ok((await k.install([THINGS, JOBS])).ok);
  const made = (register: string, fields: Record<string, unknown>): string => {
    const out = k.create(register, fields as never, { actor: 'p_1' }) as { ok: boolean; value: { id: string } };
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.id;
  };
  const gone = made('things', { name: 'Kiln' });
  made('jobs', { what: 'Glaze', thing: gone });
  made('jobs', { what: 'Fire', thing: gone });
  assert.ok(k.update('things', gone, { deleted_at: '2026-09-21' } as never, { actor: 'p_1' }).ok);
  const live = made('things', { name: 'Kiln' });
  made('jobs', { what: 'Throw', thing: live });
  made('jobs', { what: 'Unfiled' });
  return { k, gone, live, made };
}

const figure = (k: Kernel, where: MetricDecl['where']): number | null => {
  const out = k.metric(ON_KILN(where)) as { ok: boolean; value: Reading; refusal?: unknown };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.value;
};

const listed = (k: Kernel, where: unknown): string[] => {
  const out = k.list({ register: 'jobs', where: where as never }) as unknown as { ok: boolean; value: { rows: { fields: { what: string } }[] } };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.rows.map((r) => r.fields.what).sort();
};

test('A FIGURE OVER A SHARED TITLE COUNTS THE DELETED NAMESAKE\'S LIVE JOBS, AS THE LIST OF THE SAME WORDS SHOWS THEM', async () => {
  const { k } = await twoKilns();
  for (const where of ['thing is Kiln', { field: 'thing', is: 'Kiln' }] as const) {
    assert.deepEqual(listed(k, where), ['Fire', 'Glaze', 'Throw'], JSON.stringify(where));
    assert.equal(figure(k, where as MetricDecl['where']), 3, JSON.stringify(where));
  }
});

test('and the negation is the complement in both, so no job is on both sides of the tile', async () => {
  const { k } = await twoKilns();
  assert.deepEqual(listed(k, 'thing is not Kiln'), ['Unfiled']);
  assert.equal(figure(k, 'thing is not Kiln'), 1);
});

test('a deleted job is out of both, because the register the figure is over is the jobs', async () => {
  const { k, gone } = await twoKilns();
  const glaze = (k.list({ register: 'jobs', where: 'what is Glaze' as never }) as { value: { rows: { id: string }[] } }).value.rows[0]!.id;
  assert.ok(k.update('jobs', glaze, { deleted_at: '2026-09-22' } as never, { actor: 'p_1' }).ok);
  assert.deepEqual(listed(k, 'thing is Kiln'), ['Fire', 'Throw']);
  assert.equal(figure(k, 'thing is Kiln'), 2);
  /* The row id of the deleted Kiln names the same one job either way. */
  assert.equal(figure(k, `thing is ${gone}`), 1);
});
