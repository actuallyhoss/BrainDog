/**
 * Accepting a question that writes rows asks the level a write to that list asks: an Admin the owner held to read on a
 * list writes nothing there by accepting, as she writes nothing there directly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 27, 12);
const TASKS = { id: 'register.tasks', kind: 'register' as const, body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never };
const owner = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true } as CallContext;

test('AN ADMIN HELD TO READ ON A LIST ACCEPTS NO QUESTION THAT WRITES IT, one at a time or in a group', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.kernel.install([TASKS])).ok);
  assert.ok((await api.create({ register: 'tasks', fields: { name: 'payroll line' } }, owner)).ok);
  assert.ok((await api.invite({ person: 'p_3', name: 'Admin', level: 'decide', registers: { tasks: 'read' } } as never, owner)).ok);
  const held = api.kernel.access('p_3')!;
  const admin = { principal: { kind: 'person', id: 'p_3', level: held.level }, registers: held.registers ?? '*', levels: held.levels, credentialed: true } as CallContext;

  const file = (rows: unknown[]) => {
    const filed = api.kernel.propose({ question: 'Add these?', body_kind: 'rowset', body: { register: 'tasks', rows } } as never, 'slash', 'rules') as { ok: true; value: { id: string } };
    assert.ok(filed.ok, JSON.stringify(filed));
    return filed.value.id;
  };
  const one = file([{ name: 'via accept' }, { at: 'tasks#1', version: 1, patch: { name: 'changed via accept' } }]);
  const out = (await api.decide({ id: one, decide: { option: 'accept', reason: '' } }, admin)) as { ok: boolean };
  assert.equal(out.ok, false, 'an Admin held to read accepted rows into the list');
  const many = (await api.decide({ ids: [file([{ name: 'in a group' }])], decide: { option: 'accept', reason: '' } } as never, admin)) as { ok: boolean; value?: { decided: unknown[] } };
  assert.ok(!many.ok || many.value?.decided.length === 0, `a group accept wrote the list: ${JSON.stringify(many)}`);
  assert.deepEqual(sql.all<{ n: string }>("SELECT json_extract(fields, '$.name') AS n FROM entry WHERE register = 'tasks'").map((r) => r.n), ['payroll line']);
  /* THE OWNER STILL MAY. */
  assert.ok(((await api.decide({ id: one, decide: { option: 'accept', reason: '' } }, owner)) as { ok: boolean }).ok);
  sql.close();
});
