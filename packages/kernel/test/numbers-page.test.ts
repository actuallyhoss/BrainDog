/**
 * A list's numbers on one page (E26): a page says which list it is the page of (`list:`), so `/r/<list>` opens there, and
 * a `lines` block's sixth column lists every measure under its group, the quiet ones too, with its newest reading.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { measureLines, type RawReading } from '../src/measures.ts';
import { openRecord, type Declaration, type PageBlock, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const DAY = 86_400_000;
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const OWNER: WriteContext = { actor: 'p_1' };
const on = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

test('GROUPED, every measure without a line is listed under its group, quiet ones too, named groups first', () => {
  const readings: RawReading[] = [
    { at: on(2), name: 'Players', value: 10, group: 'Bake' },
    { at: on(1), name: 'Players', value: 12, group: 'Bake' },
    { at: on(60), name: 'CPU', value: 16.4, unit: '%', group: 'Bake' },
    { at: on(3), name: 'Rows written', value: 35_000 },
    { at: on(5), name: 'Memory', value: 2.1, unit: 'GB', group: 'Atlas' },
  ];
  const opts = { nowMs: NOW, back: 30, tz: 'UTC', fallback: '' };
  const plain = measureLines(readings, opts);
  assert.deepEqual(plain.latest.map((m) => m.measure).sort(), ['Memory', 'Rows written'], 'ungrouped, a quiet measure is drawn as neither');
  const { lines, latest } = measureLines(readings, { ...opts, grouped: true });
  assert.deepEqual(lines.map((l) => [l.name, l.group]), [['Players', 'Bake']]);
  assert.deepEqual(
    latest.map((m) => [m.group ?? null, m.measure, m.value, m.unit]),
    [
      ['Atlas', 'Memory', 2.1, 'GB'],
      ['Bake', 'CPU', 16.4, '%'],
      [null, 'Rows written', 35_000, ''],
    ],
  );
});

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] } as never,
};
const NUMBERS: Declaration = {
  id: 'register.datapoints',
  kind: 'register',
  body: {
    id: 'datapoints',
    name: 'Numbers',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, search: true },
      { id: 'value', type: 'decimal' },
      { id: 'unit', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'at', type: 'instant' },
    ],
  } as never,
};
const page = (body: Record<string, unknown>): Declaration => ({ id: `page.${String(body.page)}`, kind: 'page', body: body as never });
const LINES = { kind: 'lines', source: 'register.datapoints', back: 30, columns: ['at', 'value', 'name', 'unit', 'amount', 'thing'].map((field) => ({ field })) };

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok(k.createRecord({ id: ID, slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const done = await k.install([PROJECTS, NUMBERS]);
  assert.ok(done.ok, done.ok ? '' : done.refusal.fix);
  return { k, sql };
}

test('THE SIXTH COLUMN GROUPS BY ITS PROJECT\'S NAME, and the quiet measures come back with their newest reading', async () => {
  const { k, sql } = await record();
  const bake = k.create('things', { name: 'Bake' }, OWNER);
  assert.ok(bake.ok);
  for (const [name, value, ago, thing] of [
    ['Players', 10, 2, bake.value.id],
    ['Players', 12, 1, bake.value.id],
    ['CPU', 16.4, 60, bake.value.id],
    ['Rows written', 35_000, 40, null],
  ] as const)
    assert.ok(k.create('datapoints', { name, value, at: on(ago), ...(thing ? { thing } : {}) }, OWNER).ok);
  const b = k.block(LINES as unknown as PageBlock);
  assert.deepEqual(b.refusals ?? [], []);
  assert.deepEqual(b.measures?.map((m) => [m.name, m.group]), [['Players', 'Bake']]);
  assert.deepEqual(b.latest?.map((m) => [m.group ?? null, m.measure, m.value]), [
    ['Bake', 'CPU', 16.4],
    [null, 'Rows written', 35_000],
  ]);
  const stat = k.block({ ...LINES, kind: 'stat' } as unknown as PageBlock);
  assert.equal(stat.refusals?.[0]?.code, 'DECLARATION_INVALID', 'a stat takes no sixth column');
  sql.close();
});

test('A PAGE WITH list: IS THAT LIST\'S PAGE, answered as opens while the list is installed', async () => {
  const { k, sql } = await record();
  const installed = await k.install([page({ page: 'numbers', title: 'Numbers', list: 'datapoints', requires: ['register.datapoints'], blocks: [LINES] })]);
  assert.ok(installed.ok, installed.ok ? '' : installed.refusal.fix);
  const numbers = k.pages().find((p) => p.slug === 'numbers');
  assert.equal(numbers?.opens, 'datapoints');
  const bad = await k.install([page({ page: 'odd', title: 'Odd', list: 'Data points', blocks: [] })]);
  assert.equal(bad.ok ? null : bad.refusal.at, 'list');
  const template = await k.install([page({ page: 'each', title: '{{name}}', list: 'datapoints', for: { register: 'things' }, blocks: [] })]);
  assert.equal(template.ok ? null : template.refusal.at, 'list');
  sql.close();
});
