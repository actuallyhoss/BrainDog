/**
 * `metrics`: several figures in one read (`src/methods/metrics.ts`), each answered by `metric` itself.
 *
 * THE RULE THIS HOLDS: every figure answered is what `metric` answers for it, and every one refused is refused as
 * `metric` refuses it, so one read in place of one a figure is nothing wider. Through the real record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Result } from '@braindog/ports';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { METRICS_MOST, type MetricsAnswer } from '../src/methods/metrics.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 23, 12);
const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'lane', type: 'enum', values: ['building', 'earning'], required: true }] } as never,
};
const EARNING = {
  id: 'metric.earning',
  kind: 'metric' as const,
  body: { metric: 'earning', name: 'Earning', source: 'register.things', value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d', where: 'lane is earning' } as never,
};
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Somebody who reads no list the figure reads. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: [] };

type Api = Awaited<ReturnType<typeof createRecordApi>>;
const metrics = (api: Api, args: unknown, ctx: CallContext): Promise<Result<MetricsAnswer>> => {
  const method = (api as unknown as { metrics?: (a: unknown, c: CallContext) => Promise<Result<MetricsAnswer>> }).metrics;
  assert.equal(typeof method, 'function', 'metrics is not registered in methods/index.ts');
  return method!(args, ctx);
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok(made.ok, JSON.stringify(made));
  const installed = await api.kernel.install([THINGS, EARNING] as never);
  assert.ok(installed.ok, JSON.stringify(installed));
  const row = await api.create({ register: 'things', fields: { name: 'Kiln', lane: 'earning' } }, owner);
  assert.ok((row as { ok: boolean }).ok, JSON.stringify(row));
  return { api, sql };
}

test('EVERY FIGURE ASKED IS WHAT metric ANSWERS FOR IT, and an unknown one is refused as metric refuses it', async () => {
  const { api, sql } = await record();
  const out = await metrics(api, { metrics: ['earning', 'nothing-here', 'earning'] }, owner);
  assert.ok(out.ok, JSON.stringify(out));
  assert.deepEqual(out.value.readings['earning'], ((await api.metric({ metric: 'earning' }, owner)) as { value: unknown }).value);
  assert.deepEqual(out.value.refused['nothing-here'], ((await api.metric({ metric: 'nothing-here' }, owner)) as { refusal: unknown }).refusal);
  sql.close();
});

test('A FIGURE OVER A LIST THE CALLER CANNOT READ IS REFUSED, as metric refuses it', async () => {
  const { api, sql } = await record();
  const out = await metrics(api, { metrics: ['earning'] }, shut);
  if (!out.ok) assert.deepEqual((out as { refusal: unknown }).refusal, ((await api.metric({ metric: 'earning' }, shut)) as { refusal: unknown }).refusal);
  else assert.deepEqual(out.value.refused['earning'], ((await api.metric({ metric: 'earning' }, shut)) as { refusal: unknown }).refusal);
  sql.close();
});

test('THE FIGURES ARE NAMED AS A LIST OF TEXT, at most METRICS_MOST', async () => {
  const { api, sql } = await record();
  for (const bad of [{}, { metrics: [] }, { metrics: 'earning' }, { metrics: [3] }, { metrics: Array.from({ length: METRICS_MOST + 1 }, (_, i) => `m${i}`) }]) {
    const out = await metrics(api, bad, owner);
    assert.equal(out.ok, false, JSON.stringify(bad));
  }
  sql.close();
});
