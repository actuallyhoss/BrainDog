/**
 * No agent read can crash on size (AGT-B03, the record's job).
 *
 * `readFrom` asks whether a read handed an agent text another person wrote, over the rows it read, and it bound one
 * parameter a row. The Durable Object refuses a statement of more than a hundred bound values, so on production an
 * agent's `list` of 101 tasks answered INTERNAL while every test passed: the test database has no such ceiling. This one
 * runs the record on the port's own guard (`guarded`, the ceiling both hosts wrap their database in), so a statement
 * that binds one value a row throws here as it does there.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guarded } from '@braindog/ports';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const agent: CallContext = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'braindog' },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record on the guarded port, with `many` tasks the owner wrote and, last, one another person wrote. */
async function record(many: number) {
  const sql = guarded(openSqlite());
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  for (let i = 0; i < many; i++) value(api.kernel.create('tasks', { name: `Task ${i + 1}` }, { actor: 'p_1' }));
  value(api.kernel.create('tasks', { name: 'Written by Bea' }, { actor: 'p_2' }));
  return { api, sql };
}

test('AN AGENT READS 200 TASKS AND IS ANSWERED, where one bound value a task threw past the hundredth', async () => {
  const { api, sql } = await record(199);
  const listed = value<{ rows: unknown[] }>(await api.list({ register: 'tasks', limit: 200 } as never, agent));
  assert.equal(listed.rows.length, 200);
  sql.close();
});

test('AND THE READ STILL FINDS WHAT ANOTHER PERSON WROTE AMONG THEM, so the run asks for the rest of it', async () => {
  const { api, sql } = await record(199);
  value(await api.list({ register: 'tasks', limit: 200 } as never, agent));
  const after = value<Asked>(await api.create({ register: 'tasks', fields: { name: 'After' } }, agent));
  assert.match(after.asked.why, /another person wrote/u);
  /* A PERSON'S READ MARKS NOTHING, and a person's read of the same 200 answers too. */
  assert.equal(value<{ rows: unknown[] }>(await api.list({ register: 'tasks', limit: 200 } as never, owner)).rows.length, 200);
  sql.close();
});
