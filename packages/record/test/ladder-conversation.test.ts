/**
 * Outside text drops the run that read it to Ask (DIRECTION §37), and only that run, and the question says so.
 *
 * LIVE 20 OCT: every write of the owner's own agents reached Needs you as a bare question. A read before a session's
 * first write marked the key, not the session, so the first write of every other session on that key asked too; and the
 * question it filed carried no line saying why it asked. A session that names itself (`client_id`) is marked alone now,
 * one that names nothing still marks the whole key, and the question carries the agent's one line as its why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The owner's Claude Code in one session (`client_id`), or naming none. */
const session = (client: string | null): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { ...(client === null ? {} : { client_id: client }), client: 'claude-code', host: 'mac', repo: 'braindog' },
});

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT OR REPLACE INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_claude', 'tasks:add', 'tell', 0, '2026-10-01T00:00:00.000Z')");
  /* TEXT THAT IS NOT THE OWNER'S: a row another person wrote, which reading marks. */
  value(api.kernel.create('tasks', { name: 'Written by Bea' }, { actor: 'p_2' }));
  return { api, sql };
}

const asked = (r: unknown): Asked | null => {
  const x = r as { ok: boolean; value?: unknown };
  return x.ok && x.value !== null && typeof x.value === 'object' && 'asked' in (x.value as object) ? (x.value as Asked) : null;
};

test('A SESSION THAT READ OUTSIDE TEXT BEFORE IT WROTE ASKS, AND ANOTHER SESSION ON THE SAME KEY DOES NOT', async () => {
  const { api, sql } = await record();
  value(await api.list({ register: 'tasks' }, session('cc-a')));
  /* ANOTHER SESSION OF THE SAME AGENT, ON THE SAME MAC, THE SAME DAY: it read nothing, so it writes at its rung. */
  const other = await api.create({ register: 'tasks', fields: { name: 'From the other session' } }, session('cc-b'));
  assert.equal(asked(other), null, 'the session that read nothing is not marked by the one that did');
  value<Entry>(other);
  /* THE SESSION THAT READ IT ASKS, for this write and the rest of its run. */
  const first = asked(await api.create({ register: 'tasks', fields: { name: 'After reading' } }, session('cc-a')));
  assert.match(first?.asked.why ?? '', /This run read something another person wrote, so its changes ask for the rest of it/u);
  const again = asked(await api.create({ register: 'tasks', fields: { name: 'And again' } }, session('cc-a')));
  assert.ok(again, 'its run keeps the mark once it has one');
  sql.close();
});

test('THE QUESTION CARRIES WHY IT ASKS, and one asked for outside text is marked so BrainDog never settles it', async () => {
  const { api, sql } = await record();
  value(await api.list({ register: 'tasks' }, session('cc-a')));
  const out = asked(await api.create({ register: 'tasks', fields: { name: 'After reading' } }, session('cc-a')));
  assert.ok(out);
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.asked.id)!.body) as { context?: string; outside?: boolean };
  assert.equal(body.context, out.asked.why);
  assert.equal(body.outside, true);
  /* A WRITE BELOW ITS RUNG SAYS THAT INSTEAD, and is not marked as outside. */
  const mine = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Mine' } }, session('cc-b')));
  const low = asked(await api.update({ register: 'tasks', seq: mine.seq, patch: { state: 'done' } } as never, session('cc-b')));
  assert.ok(low);
  const plain = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', low.asked.id)!.body) as { context?: string; outside?: boolean };
  assert.match(plain.context ?? '', /ask until 10 of them have been kept/u);
  assert.equal(plain.outside, undefined);
  sql.close();
});

test('A CALL THAT NAMES NO SESSION STILL MARKS THE WHOLE KEY, since nothing tells its sessions apart', async () => {
  const { api, sql } = await record();
  value(await api.list({ register: 'tasks' }, session(null)));
  const out = asked(await api.create({ register: 'tasks', fields: { name: 'Elsewhere' } }, session('cc-b')));
  assert.match(out?.asked.why ?? '', /This run read something another person wrote/u);
  sql.close();
});
