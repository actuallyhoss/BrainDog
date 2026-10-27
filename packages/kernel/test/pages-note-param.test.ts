/**
 * A hole in a note names a figure with its parameter (REC-B12 step 4): `{{project-cost:Kiln}}` reads the figure with
 * `Kiln` filled in, as a figure cell always has (`fill(decl, null, param)`), and the first colon separates.
 *
 * WHAT WAS MEASURED BEFORE IT: a path had no colon, so the hole was never asked and a plan's lead sentence,
 * "10 of 21 paid. E£176,500 left", was drawn with its braces showing. The plan's page stood on four tiles instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { pathsOf, registersOfBlock, type PageBlock } from '../src/pages.ts';
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
      { id: 'amount', type: 'money' },
    ],
  },
};

const COST: Declaration = {
  id: 'metric.project-cost',
  kind: 'metric',
  body: { metric: 'project-cost', name: 'Cost', source: 'register.costs', where: 'thing is {{it}}', value: { sum: 'amount' }, format: 'money', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

/* A figure with no parameter, so a path with no colon has something to read. */
const ALL: Declaration = {
  id: 'metric.cost-lines',
  kind: 'metric',
  body: { metric: 'cost-lines', name: 'Cost lines', source: 'register.costs', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

async function record(...more: Declaration[]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const installed = await k.install([PROJECTS, COSTS, COST, ALL, ...more]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const name of ['Kiln', 'Portage', 'C:\\Repos']) assert.ok(k.create('things', { name }, OWNER).ok);
  for (const [what, thing, amount] of [
    ['Clay', 1, 40_000],
    ['Studio', 1, 300_000],
    ['Boxes', 2, 9_000],
    ['Disk', 3, 7_000],
  ] as const)
    assert.ok(k.create('costs', { what, thing: `things#${thing}`, amount: egp(amount) }, OWNER).ok, what);
  return { k, sql };
}

const note = (body: string): PageBlock => ({ kind: 'note', body }) as PageBlock;

test('A NOTE’S {{figure:parameter}} READS THE FIGURE WITH THE PARAMETER FILLED, keyed as written', async () => {
  const { k, sql } = await record();
  const out = k.block(note('Kiln cost {{project-cost:Kiln}} and Portage {{project-cost:Portage}}.'));
  assert.deepEqual(out.refusals, [], JSON.stringify(out.refusals));
  assert.deepEqual(out.values, { 'project-cost:Kiln': egp(340_000), 'project-cost:Portage': egp(9_000) });
  assert.equal(out.unnamed, undefined);
  sql.close();
});

test('the first colon separates, so a parameter holding a colon or a full stop is one parameter', async () => {
  const { k, sql } = await record();
  const out = k.block(note('{{project-cost:C:\\Repos}}'));
  assert.deepEqual(out.values, { 'project-cost:C:\\Repos': egp(7_000) });
  sql.close();
});

test('a typed form takes the figure and its parameter as its path', async () => {
  const { k, sql } = await record();
  const block = note('{{money:project-cost:Kiln}}');
  assert.deepEqual(k.block(block).values, { 'project-cost:Kiln': egp(340_000) });
  sql.close();
});

test('a hole inside the hole is filled from the template’s row first, then read', async () => {
  const page: Declaration = {
    id: 'page.project',
    kind: 'page',
    body: { page: 'project', title: '{{name}}', for: { register: 'things' }, requires: ['register.things'], blocks: [{ kind: 'note', body: '{{project-cost:{{name}}}} spent.' }] } as never,
  };
  const { k, sql } = await record(page);
  const kiln = k.page('kiln');
  assert.ok(kiln.ok, JSON.stringify(kiln));
  assert.equal((kiln.value.blocks[0] as { body?: string }).body, '{{project-cost:Kiln}} spent.');
  assert.deepEqual(kiln.value.blocks[0]?.values, { 'project-cost:Kiln': egp(340_000) });
  const portage = k.page('portage');
  assert.ok(portage.ok);
  assert.deepEqual(portage.value.blocks[0]?.values, { 'project-cost:Portage': egp(9_000) });
  sql.close();
});

test('a path with no colon reads as before', async () => {
  const { k, sql } = await record();
  const out = k.block(note('{{cost-lines}} lines, {{costs.count}} costs, {{things#1.name}}, {{no-such-figure}}.'));
  assert.deepEqual(out.values, { 'cost-lines': 4, 'costs.count': 4, 'things#1.name': 'Kiln' });
  assert.deepEqual(out.unnamed, ['no-such-figure']);
  assert.deepEqual(pathsOf(note('{{cost-lines}} {{money:1840000 GBP}} {{ref:costs#1}} `{{costs.count}}`')), ['cost-lines']);
  sql.close();
});

test('a figure nobody declared is the author’s text as now: no value, and not a path asked of the record', async () => {
  const { k, sql } = await record();
  const out = k.block(note('{{nobody:Kiln}} {{config:book}} {{bad:past their due date}} {{icon:rocket}} {{:Kiln}} {{project-cost:}}'));
  assert.equal(out.values, undefined);
  assert.equal(out.unnamed, undefined);
  /* Lexically, with no record to ask, a hole with a colon is not a path, as it never was. */
  assert.deepEqual(pathsOf(note('{{project-cost:Kiln}}')), []);
  assert.deepEqual(pathsOf(note('{{project-cost:Kiln}} {{nobody:Kiln}}'), (id) => id === 'project-cost'), ['project-cost:Kiln']);
  sql.close();
});

test('the note names the figure’s list, so a reader who may not open Costs is held from it', async () => {
  const { k, sql } = await record();
  assert.deepEqual(registersOfBlock(note('{{project-cost:Kiln}}'), (id) => k.metricDecl(id)), ['costs']);
  assert.deepEqual(registersOfBlock(note('{{nobody:Kiln}}'), (id) => k.metricDecl(id)), []);
  /* AND A TEMPLATE NOT YET FILLED NAMES IT TOO, as a figure cell's `project-cost:{{name}}` does. */
  assert.deepEqual(registersOfBlock(note('{{project-cost:{{name}}}} spent, {{money:project-cost:{{name}}}}.'), (id) => k.metricDecl(id)), ['costs']);
  assert.deepEqual(registersOfBlock(note('{{nobody:{{name}}}} `{{project-cost:{{name}}}}`'), (id) => k.metricDecl(id)), []);
  /* Nothing is read of it until the row is in. */
  assert.equal(k.block(note('{{project-cost:{{name}}}}')).values, undefined);
  sql.close();
});
