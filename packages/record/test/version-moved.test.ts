/**
 * The version says which lists moved since the one a tab asks about (scope 2026-10-24 A14), so a write to one list drops
 * only what the tab kept over it: any write anywhere moved the one number, and the tab asked everything again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type Version } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'] };

const list = (id: string, name: string) => ({
  id: `register.${id}`,
  kind: 'register' as const,
  body: { id, name, title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
});

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 24, 9)) });
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAW', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } });
  assert.ok((await api.kernel.install([list('tasks', 'Tasks'), list('notes', 'Notes')])).ok);
  return { sql, api };
}

const version = async (api: Awaited<ReturnType<typeof createRecordApi>>, ctx: CallContext, since?: number): Promise<Version> => {
  const out = await (api.version as (c: CallContext, a?: { since?: number }) => Promise<{ ok: boolean; value: Version }>)(ctx, since === undefined ? undefined : { since });
  assert.ok(out.ok, JSON.stringify(out));
  return out.value;
};

test('A WRITE TO TASKS SAYS TASKS MOVED, and nothing else', async () => {
  const { sql, api } = await record();
  const before = (await version(api, owner)).version;
  assert.ok(((await api.create({ register: 'tasks', fields: { name: 'Sweep' } }, owner)) as { ok: boolean }).ok);
  const after = await version(api, owner, before);
  assert.deepEqual(after.moved, ['tasks']);
  assert.ok(after.version > before);
  /* AND NOTHING SINCE THE NEW ONE. */
  assert.deepEqual((await version(api, owner, after.version)).moved, []);
  sql.close();
});

test('TWO LISTS WRITTEN ARE BOTH SAID, and a declaration changed is everything', async () => {
  const { sql, api } = await record();
  const before = (await version(api, owner)).version;
  await api.create({ register: 'tasks', fields: { name: 'Sweep' } }, owner);
  await api.create({ register: 'notes', fields: { name: 'Swept' } }, owner);
  assert.deepEqual((await version(api, owner, before)).moved, ['notes', 'tasks']);
  const mid = (await version(api, owner)).version;
  assert.ok((await api.kernel.install([list('parts', 'Parts')])).ok);
  await api.create({ register: 'parts', fields: { name: 'Bolt' } }, owner);
  const said = (await version(api, owner, mid)).moved;
  assert.ok(said === null || (Array.isArray(said) && said.includes('parts')), JSON.stringify(said));
  sql.close();
});

test('UNASKED, version is the keys it always was; asked by a caller whose version is not the log, it cannot say', async () => {
  const { sql, api } = await record();
  assert.equal('moved' in (await version(api, owner)), false);
  const v = (await version(api, member)).version;
  assert.equal((await version(api, member, v)).moved, null);
  sql.close();
});
