/**
 * The line under a question on Decide names only fields the list has (`DoesNames.holds`, audit 79, claim 4). A patch
 * may send a field the list lacks: the write refuses it, so the yes changes nothing there, and the line named it by
 * its id read as words. Read on a real record, as Decide's queue reads it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry, QueueQuestion } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'stage', type: 'text', label: 'Stage' },
      { id: 'plain', type: 'text' },
    ],
  } as never,
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

test('A FIELD THE LIST LACKS IS NOT NAMED ON THE LINE, and tags and a field with no label still are', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, owner));
  const ask = async (question: string, patch: Record<string, unknown>) =>
    value<{ id: string }>(await api.propose({ question, body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: `tasks#${ship.seq}`, version: ship.version, patch }] } }, agent)).id;

  const mixed = await ask('Move Ship on?', { stage: 'Live', zzz_internal: 'x' });
  const none = await ask('Mark Ship?', { zzz_internal: 'x' });
  const own = await ask('Tag Ship?', { tags: ['late'], plain: 'Yes' });

  const queue = (api.kernel.block({ kind: 'queue', source: 'governance.open', lead: true }).queue ?? []) as QueueQuestion[];
  const does = (id: string) => queue.find((q) => q.id === id)?.does;
  assert.equal(does(mixed), 'Sets Stage to Live in Tasks.');
  /* WITH NONE LEFT THE LINE KEEPS ITS COUNT, and never says the id as words. */
  assert.equal(does(none), 'Changes 1 in Tasks.');
  /* `tags` IS EVERY LIST'S, declared or not, and a field the list has with no label is named by its id as words. */
  assert.match(does(own) ?? '', /Tags/u);
  assert.match(does(own) ?? '', /Plain/u);
  sql.close();
});
