/**
 * The question an agent's held change asks says what it changes: "Change the cost and due date of Ship?", each field by
 * the name a person reads, never its id. One field of the list's own state alone is still "Mark Ship done?".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

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
      { id: 'cost', type: 'money', label: 'Cost' },
      { id: 'due_on', type: 'day', label: 'Due date' },
      { id: 'web_address', type: 'text' },
      { id: 'link', type: 'text', label: 'URL' },
      { id: 'note', type: 'text', label: '  ' },
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

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_claude', 'p_1', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, owner));
  /* MONEY IS ON THE FLOOR, SO A CHANGE THAT WRITES AN AMOUNT IS FILED AS A QUESTION. */
  const ask = async (patch: Record<string, unknown>): Promise<string> => {
    const out = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch: { cost: { amount: 1_250, currency: 'GBP' }, ...patch } }, agent));
    assert.ok(out.asked, 'the change was held as a question');
    return out.asked.question;
  };
  return { api, ship, ask };
}

test('ONE FIELD CHANGED IS NAMED BY ITS LABEL, in lower case inside the sentence', async () => {
  const { ask } = await record();
  assert.equal(await ask({}), 'Change the cost of Ship?');
});

test('TWO AND THREE FIELDS ARE EACH NAMED, in the order sent, a field with no label by its id with spaces', async () => {
  const { ask } = await record();
  assert.equal(await ask({ due_on: '2026-10-20' }), 'Change the cost and due date of Ship?');
  assert.equal(await ask({ due_on: '2026-10-21', web_address: 'braindog.example' }), 'Change the cost, due date and web address of Ship?');
});

test('MORE THAN THREE NAMES TWO AND COUNTS THE REST', async () => {
  const { ask } = await record();
  const q = await ask({ due_on: '2026-10-22', web_address: 'braindog.example', state: 'done', note: 'soon' });
  assert.equal(q, 'Change the cost, due date and 3 more of Ship?');
});

test('A NAME SPELLED IN CAPITALS KEEPS THEM, and a blank label falls back to the field', async () => {
  const { ask } = await record();
  assert.equal(await ask({ link: 'https://braindog.example', note: 'soon' }), 'Change the cost, URL and note of Ship?');
});

test('NO FIELD IS SAID BY ITS ID WHERE THE ID IS NOT WORDS', async () => {
  const { ask } = await record();
  const q = await ask({ due_on: '2026-10-23', web_address: 'braindog.example' });
  assert.doesNotMatch(q, /_/u);
  assert.doesNotMatch(q, /—/u);
});
