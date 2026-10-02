/**
 * A card's trend over a figure: `{ metric: 'project-done-by-week:{{name}}', as: 'trend' }` on a cards block, read once a
 * card with the hole filled from the card's own row.
 *
 * WHAT WAS MEASURED BEFORE IT: page.portfolio had no way to draw a small line on each project card. The figure existed,
 * per project, and only a page per project could draw it, as a chart of its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { registersOfBlock, type PageBlock } from '../src/pages.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

/* A Friday, so this week began on Monday the 28th. */
const NOW = Date.UTC(2026, 9, 2, 12);
const OWNER = { actor: 'p_1' };

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] },
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'done_on', type: 'day' },
      { id: 'hours', type: 'int' },
    ],
  },
};

const figure = (metric: string, value: unknown, more: Record<string, unknown> = {}): Declaration => ({
  id: `metric.${metric}`,
  kind: 'metric',
  body: { metric, name: metric, source: 'register.tasks', where: 'thing is {{it}}, done_on is set', value, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none', ...more } as never,
});

const BY_WEEK = figure('project-done-by-week', { count: 'id' }, { group_by: 'done_on', bucket: 'week' });
const HOURS_BY_WEEK = figure('project-hours-by-week', { avg: 'hours' }, { group_by: 'done_on', bucket: 'week' });
const DONE = figure('project-done', { count: 'id' });

const value = <T>(r: unknown): T => {
  const out = r as { ok: boolean; value?: T };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value as T;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, TASKS, BY_WEEK, HOURS_BY_WEEK, DONE]));
  const kiln = value<{ id: string }>(k.create('things', { name: 'Kiln' }, OWNER)).id;
  value(k.create('things', { name: 'Bake' }, OWNER));
  for (const [done_on, hours] of [['2026-09-15', 2], ['2026-09-29', 4], ['2026-09-30', 6], ['2026-10-01', 2]] as const)
    value(k.create('tasks', { what: `Fired on ${done_on}`, thing: kiln, done_on, hours }, OWNER));
  return { k, sql };
}

const cards = (metric: string): PageBlock => ({
  kind: 'cards',
  source: 'register.things',
  columns: [{ field: 'name', as: 'title' }, { metric, as: 'trend' } as never],
  order: [{ field: 'seq', dir: 'asc' }],
  empty: 'No projects yet.',
});

test('EACH CARD DRAWS ITS OWN FIGURE BY WEEK, a week with nothing finished a nought and a card with nothing no line', async () => {
  const { k, sql } = await record();
  const out = k.block(cards('project-done-by-week:{{name}}'));
  assert.deepEqual(out.refusals, []);
  /* From the first week Kiln finished anything (14 September) to this one: 1, nothing, then 3. */
  assert.deepEqual(out.trends, [[1, 0, 3], null]);
  assert.equal(out.rows.length, 2);
  sql.close();
});

test('AN AVERAGE OF NOTHING IS A GAP, not a nought', async () => {
  const { k, sql } = await record();
  assert.deepEqual(k.block(cards('project-hours-by-week:{{name}}')).trends, [[2, null, 4], null]);
  sql.close();
});

test('A TREND OVER A FIGURE NOBODY DECLARED, OR ONE WITH NO WEEKS, IS SAID ONCE ON THE BLOCK', async () => {
  const { k, sql } = await record();
  assert.equal(k.block(cards('project-shipped:{{name}}')).refusals[0]?.code, 'METRIC_UNKNOWN');
  const flat = k.block(cards('project-done:{{name}}'));
  assert.equal(flat.refusals[0]?.code, 'DECLARATION_INVALID');
  assert.match(flat.refusals[0]?.fix ?? '', /bucket/);
  /* And the cards read the figure's list, so a member who may not open Tasks is held from them. */
  assert.ok(registersOfBlock(cards('project-done-by-week:{{name}}'), (id) => (id === 'project-done-by-week' ? (BY_WEEK.body as never) : null)).includes('tasks'));
  sql.close();
});

test('A METRIC COLUMN INSTALLS ONLY AS A CARD’S TREND, and names the figure alone', () => {
  const page = (block: unknown): Declaration => ({
    id: 'page.portfolio',
    kind: 'page',
    body: { page: 'portfolio', title: 'Portfolio', blocks: [block] } as never,
  });
  const at = (block: unknown) => validateDeclaration(page(block))?.code ?? null;
  assert.equal(at(cards('project-done-by-week:{{name}}')), null);
  assert.equal(at({ ...cards('x'), columns: [{ field: 'name', as: 'title' }, { metric: 'x', as: 'fact' }] }), 'DECLARATION_INVALID');
  assert.equal(at({ ...cards('x'), columns: [{ field: 'name', as: 'title' }, { metric: 'x', field: 'name', as: 'trend' }] }), 'DECLARATION_INVALID');
  assert.equal(at({ ...cards('x'), columns: [{ field: 'name', as: 'title' }, { metric: 'Not An Id', as: 'trend' }] }), 'DECLARATION_INVALID');
  assert.equal(at({ kind: 'table', source: 'register.things', columns: [{ metric: 'x', as: 'trend' }], empty: 'x' }), 'DECLARATION_INVALID');
  assert.equal(at({ ...cards('x'), columns: [{ metric: 'x', as: 'trend' }, { metric: 'y', as: 'trend' }] }), 'OUT_OF_BOUNDS');
});
