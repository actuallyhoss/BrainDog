/**
 * A key number's readings are found by the key number's row or its short name, where the readings carry the project
 * after it. A filter of Numbers finds only readings the caller reads, and no answer names a project she does not read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const until = new Date(NOW + 30 * 86_400_000).toISOString();

const reg = (id: string, name: string, title: string, fields: unknown[]) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title, fields } as never,
});

const DECLS = [
  reg('things', 'Things', 'name', [{ id: 'name', type: 'text', required: true }]),
  reg('kpis', 'Key numbers', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'measure', type: 'text' },
    { id: 'thing', type: 'ref', to: 'things' },
  ]),
  reg('datapoints', 'Numbers', 'name', [
    { id: 'name', type: 'text', required: true },
    { id: 'value', type: 'decimal' },
  ]),
  {
    id: 'metric.how-many',
    kind: 'metric' as const,
    body: { metric: 'how-many', name: 'How many', source: 'register.datapoints', where: { field: 'name', is: '{{it}}' }, value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
  },
];

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true, provedAt: NOW };

type Rows = { ok: boolean; value?: { rows: { fields: { name: string } }[] } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const put = await api.kernel.install(DECLS);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const thing = (await api.create({ register: 'things', fields: { name: 'Kiln' } }, owner)) as { value: { id: string } };
  await api.create({ register: 'kpis', fields: { name: 'Monthly revenue', thing: thing.value.id } }, owner);
  await api.create({ register: 'kpis', fields: { name: 'Plain', thing: thing.value.id } }, owner);
  await api.create({ register: 'kpis', fields: { name: 'Quiet', thing: thing.value.id } }, owner);
  await api.create({ register: 'datapoints', fields: { name: 'Monthly revenue, Kiln', value: 5 } }, owner);
  await api.create({ register: 'datapoints', fields: { name: 'Plain', value: 7 } }, owner);
  const names = async (is: string, ctx: CallContext = owner) => ((await api.list({ register: 'datapoints', where: { field: 'name', is } } as never, ctx)) as Rows).value?.rows.map((r) => r.fields.name);
  return { api, sql, names };
}

test('A KEY NUMBER READ UNDER ITS NAME AND PROJECT IS FOUND BY ITS SHORT NAME', async () => {
  const { names } = await record();
  assert.deepEqual(await names('Monthly revenue'), ['Monthly revenue, Kiln']);
  assert.deepEqual(await names('Monthly revenue, Kiln'), ['Monthly revenue, Kiln']);
});

test('A KEY NUMBER IS FOUND BY ITS ROW, with the project after its name or without', async () => {
  const { names } = await record();
  assert.deepEqual(await names('kpis#1'), ['Monthly revenue, Kiln']);
  assert.deepEqual(await names('kpis#2'), ['Plain']);
});

test('A NAME NO READING HOLDS STAYS WHAT WAS SAID, and a key number never read finds nothing', async () => {
  const { names } = await record();
  assert.deepEqual(await names('Nothing like it'), []);
  assert.deepEqual(await names('kpis#3'), []);
});

test('ASKING BY A KEY NUMBER ANSWERS NOTHING OF A PROJECT THE MEMBER DOES NOT READ', async () => {
  const { api, sql } = await record();
  /* A key number on a project with no reading: its project's name reaches nothing she is answered. */
  const hidden = (await api.create({ register: 'things', fields: { name: 'Hidden Project' } }, owner)) as { value: { id: string } };
  await api.create({ register: 'kpis', fields: { name: 'Lonely', thing: hidden.value.id } }, owner);
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', 'p_lee', 'lee@example.test', 'Lee');
  assert.ok(((await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['kpis', 'datapoints'] }, can: 'view', when: { until } } }, owner)) as { ok: boolean }).ok);
  const held = api.kernel.access('p_lee')!;
  const lee = { principal: { kind: 'person', id: 'p_lee', level: held.level }, registers: held.registers, levels: held.levels, credentialed: true, provedAt: NOW } as CallContext;
  const list = await api.list({ register: 'datapoints', where: { field: 'name', is: 'kpis#4' } } as never, lee);
  const metric = await api.metric({ metric: 'how-many:kpis#4' }, lee);
  assert.ok((list as { ok: boolean }).ok, JSON.stringify(list));
  assert.ok((metric as { ok: boolean }).ok, JSON.stringify(metric));
  assert.ok(!JSON.stringify(list).includes('Hidden Project'), JSON.stringify(list));
  assert.ok(!JSON.stringify(metric).includes('Hidden Project'), JSON.stringify(metric));
});

test('A MEMBER WHO DOES NOT READ KEY NUMBERS HAS NO ROW TURNED INTO A NAME', async () => {
  const { api, sql } = await record();
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', 'p_lee', 'lee@example.test', 'Lee');
  assert.ok(((await api.share({ share: { who: { kind: 'person', id: 'p_lee' }, what: { lists: ['datapoints'] }, can: 'view', when: { until } } }, owner)) as { ok: boolean }).ok);
  const held = api.kernel.access('p_lee')!;
  const lee = { principal: { kind: 'person', id: 'p_lee', level: held.level }, registers: held.registers, levels: held.levels, credentialed: true, provedAt: NOW } as CallContext;
  const out = (await api.list({ register: 'datapoints', where: { field: 'name', is: 'kpis#1' } } as never, lee)) as Rows;
  assert.deepEqual(out.value?.rows, []);
});
