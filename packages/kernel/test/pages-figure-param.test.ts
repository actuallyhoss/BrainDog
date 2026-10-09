/**
 * A bar or a split over a figure with a parameter (PGS-A04): `metric.project-cost:Kiln` reads the figure with `Kiln`
 * filled in, as a figure cell always has.
 *
 * WHAT WAS MEASURED BEFORE IT: `metricBlock` asked for the whole id, `project-cost:Kiln`, which no figure is called, so a
 * split on a project page over its own costs was refused as "There is no metric called project-cost:Kiln".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { registersOfBlock, type PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };
const egp = (amount: number) => ({ amount, currency: 'EGP' });

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
};

const COSTS: Declaration = {
  id: 'register.costs',
  kind: 'register',
  body: {
    id: 'costs',
    name: 'Costs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'kind', type: 'text' },
      { id: 'amount', type: 'money' },
    ],
  },
};

const COST: Declaration = {
  id: 'metric.project-cost',
  kind: 'metric',
  body: { metric: 'project-cost', name: 'Cost', source: 'register.costs', where: 'thing is {{it}}', value: { sum: 'amount' }, group_by: 'kind', format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

async function record(...more: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS, COSTS, COST, ...more]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const name of ['Kiln', 'Portage']) assert.ok(k.create('things', { name }, OWNER).ok);
  for (const [what, thing, kind, amount] of [
    ['Clay', 1, 'Materials', 40_000],
    ['Glaze', 1, 'Materials', 12_000],
    ['Studio', 1, 'Rent', 300_000],
    ['Boxes', 2, 'Packing', 9_000],
  ] as const)
    assert.ok(k.create('costs', { what, thing: `things#${thing}`, kind, amount: egp(amount) }, OWNER).ok, what);
  return { k, sql };
}

const partsOf = (b: { readings?: { reading: { groups?: { key: string }[] } }[] }): string[] =>
  (b.readings?.[0]?.reading.groups ?? []).map((g) => g.key).sort();

test('A SPLIT OVER A FIGURE WITH A PARAMETER DRAWS THAT PROJECT’S PARTS and not the other’s', async () => {
  const { k, sql } = await record();
  const kiln = k.block({ kind: 'split', source: 'metric.project-cost:Kiln' } as PageBlock);
  assert.deepEqual(kiln.refusals, [], JSON.stringify(kiln.refusals));
  assert.deepEqual(partsOf(kiln as never), ['Materials', 'Rent']);
  assert.equal(kiln.readings?.[0]?.metric, 'project-cost:Kiln', 'the reading is keyed by the id as written');

  const portage = k.block({ kind: 'bar', source: 'metric.project-cost:Portage' } as PageBlock);
  assert.deepEqual(portage.refusals, []);
  assert.deepEqual(partsOf(portage as never), ['Packing']);
  sql.close();
});

test('a figure nobody declared is refused by its name, never with the parameter', async () => {
  const { k, sql } = await record();
  const out = k.block({ kind: 'split', source: 'metric.nobody:Kiln' } as PageBlock);
  assert.equal(out.refusals[0]?.code, 'METRIC_UNKNOWN');
  assert.match(out.refusals[0]?.fix ?? '', /called nobody\./);
  assert.doesNotMatch(out.refusals[0]?.fix ?? '', /Kiln/);
  sql.close();
});

test('a split with no parameter reads the figure as it always has', async () => {
  const { k, sql } = await record();
  /* With `{{it}}` left in the sentence the figure matches no project, so it draws no parts and is not refused. */
  const out = k.block({ kind: 'split', source: 'metric.project-cost' } as PageBlock);
  assert.ok(!out.refusals.some((r) => r.code === 'METRIC_UNKNOWN'), JSON.stringify(out.refusals));
  sql.close();
});

test('the split names the figure’s list, so a reader who may not open Costs is held from it', async () => {
  const { k, sql } = await record();
  assert.deepEqual(registersOfBlock({ kind: 'split', source: 'metric.project-cost:Kiln' } as PageBlock, (id) => k.metricDecl(id)), ['costs']);
  sql.close();
});

/* A PROJECT PAGE WRITTEN WITH THE PARAMETER, filled from each project's row. It installs once kernel declare.ts `SOURCE`
   reads `metric.<id>:<param>` (a line blocked to where-when-46's file); until then the install refuses the source. */
test('a project page split by metric.project-cost:{{name}} draws each project’s own parts', async () => {
  const page: Declaration = {
    id: 'page.project',
    kind: 'page',
    body: { page: 'project', title: '{{name}}', for: { register: 'things' }, requires: ['register.things'], blocks: [{ kind: 'split', source: 'metric.project-cost:{{name}}' }] } as never,
  };
  const { k, sql } = await record(page);
  const kiln = k.page('kiln');
  assert.ok(kiln.ok, JSON.stringify(kiln));
  assert.deepEqual(partsOf(kiln.value.blocks[0] as never), ['Materials', 'Rent']);
  const portage = k.page('portage');
  assert.ok(portage.ok);
  assert.deepEqual(partsOf(portage.value.blocks[0] as never), ['Packing']);
  sql.close();
});
