/**
 * The decision card's facts wherever the record answers a question outside a page's queue: `governance`, which /decide/<id> reads, and `propose`, which an agent says back. The run that asked and its app,
 * the money accepting writes, and what changes from what to what, each in names and never as an id.
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
      { id: 'state', type: 'enum', values: ['open', 'done'], labels: { open: 'Open', done: 'Done' }, default: 'open' },
      { id: 'cost', type: 'money', label: 'Cost' },
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
  return { api, sql, ship };
}

type Facts = {
  run?: { id: string; name?: string; app?: string };
  money?: { amount: number; currency: string }[];
  changes?: { field: string; label?: string; before: unknown; after: unknown }[];
  kinds?: string[];
};

test('A QUESTION READ BY ITS ID SAYS WHO ASKED FROM WHICH APP, WHAT MONEY MOVES AND WHAT CHANGES', async () => {
  const { api, sql, ship } = await record();
  /* MONEY IS ON THE FLOOR, SO THE AGENT'S CHANGE IS FILED AS A QUESTION. */
  const asked = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch: { cost: { amount: 1_250, currency: 'GBP' }, state: 'done' } }, agent));
  const row = value<Facts & { question: string }>(await api.governance({ register: 'suggestion', id: asked.asked.id }, owner));
  assert.equal(row.question, 'Change the cost and state of Ship?');
  assert.match(row.run?.id ?? '', /^S\d+$/u);
  assert.ok(typeof row.run?.app === 'string' && row.run.app !== '' && !row.run.app.includes('-'), row.run?.app);
  assert.deepEqual(row.money, [{ amount: 1_250, currency: 'GBP' }]);
  assert.deepEqual(row.changes, [
    { field: 'cost', label: 'Cost', before: null, after: { amount: 1_250, currency: 'GBP' } },
    { field: 'state', before: 'Open', after: 'Done' },
  ]);
  /* AND IN THE LIST OF THEM, as the queue reads it. */
  const listed = value<(Facts & { id: string })[]>(await api.governance({ register: 'suggestion' }, owner));
  assert.deepEqual(listed[0]?.money, [{ amount: 1_250, currency: 'GBP' }]);
  assert.doesNotMatch(JSON.stringify(row.changes), /[0-9A-HJKMNP-TV-Z]{26}/u);
  /* A READER OF ONE LIST GETS THE MONEY, AND NOT THE RUN OR WHAT THE ROW HOLDS NOW, as the kernel draws the card only for
     a reader of every list. */
  const scoped = value<Facts | null>(await api.governance({ register: 'suggestion', id: asked.asked.id }, { ...owner, registers: ['tasks'] }));
  assert.deepEqual(scoped?.money, [{ amount: 1_250, currency: 'GBP' }]);
  assert.equal(scoped?.run, undefined);
  assert.equal(scoped?.changes, undefined);
  sql.close();
});

test("AN AGENT'S PROPOSAL IS ANSWERED WITH THE SAME FACTS, so it can say what it asked to move", async () => {
  const { api, sql, ship } = await record();
  const filed = value<Facts & { id: string }>(
    await api.propose({ question: 'Price Ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: `tasks#${ship.seq}`, version: ship.version, patch: { cost: { amount: 900, currency: 'EUR' } } }] } }, agent),
  );
  assert.deepEqual(filed.money, [{ amount: 900, currency: 'EUR' }]);
  assert.deepEqual(filed.changes, [{ field: 'cost', label: 'Cost', before: null, after: { amount: 900, currency: 'EUR' } }]);
  assert.match(filed.run?.id ?? '', /^S\d+$/u);
  sql.close();
});
