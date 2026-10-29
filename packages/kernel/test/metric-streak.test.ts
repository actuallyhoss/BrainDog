/**
 * A streak (`{ streak: { on, grain } }`): the days or weeks in a row up to now that hold an entry, today not breaking it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../../record/src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 29, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const day = (back: number): string => new Date(NOW - back * 86_400_000).toISOString().slice(0, 10);

async function withLog(days: number[]) {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
  const put = await api.kernel.install([
    { id: 'register.log', kind: 'register', body: { id: 'log', name: 'Log', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'on', type: 'day' }] } },
    { id: 'metric.log-streak', kind: 'metric', body: { metric: 'log-streak', name: 'Days in a row', source: 'register.log', value: { streak: { on: 'on' } }, format: 'int', target: { gte: 0 }, window: '30d', compare: 'none' } },
  ] as never);
  assert.ok(put.ok, JSON.stringify(put));
  for (const back of days) assert.ok((await api.create({ register: 'log', fields: { what: 'Ran', on: day(back) } }, owner)).ok);
  const out = (await api.metric({ metric: 'log-streak' }, owner)) as { ok: boolean; value: { value: number; streak: { today: boolean } } };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
}

test('three days in a row up to yesterday is a streak of three, and today has none yet', async () => {
  const read = await withLog([1, 2, 3, 5]);
  assert.equal(read.value, 3);
  assert.equal(read.streak.today, false);
});

test('today counts once it holds an entry', async () => {
  const read = await withLog([0, 1, 2]);
  assert.equal(read.value, 3);
  assert.equal(read.streak.today, true);
});

test('a whole day missed ends it', async () => {
  const read = await withLog([2, 3, 4]);
  assert.equal(read.value, 0);
});
