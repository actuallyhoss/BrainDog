/**
 * A write that can be sent again (AGT-B05, RQ-AGT-407): `create` and `update` take an `op_id`, the agent door passes it
 * to the record, and the record replays the write it was minted for. An agent whose answer was lost sends the same call
 * once more and lands one write: one task for "add a task called Buy stamps", one version for one change.
 *
 * THE RECORD IS REAL HERE, because the replay is the record's (`kernel/src/index.ts`, the `op_id` read before a write).
 * The line a replay ends with is the door's, and it is read off the record's own mark, so that half is asked of a stub.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { REPLAYED, TOOLS, tools } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const ERRANDS = {
  id: 'register.errands',
  kind: 'register' as const,
  body: {
    id: 'errands',
    name: 'Errands',
    title: 'what',
    fields: [{ id: 'what', type: 'text', required: true }],
  } as never,
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([ERRANDS])).ok);
  return { sql, api };
}

type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };

let n = 0;
async function call(api: Awaited<ReturnType<typeof record>>['api'], name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result as ToolResult;
}

test('CREATE AND UPDATE LIST op_id, as text and never required', () => {
  for (const name of ['create', 'update']) {
    const input = TOOLS.find((t) => t.name === name)?.input as { properties: Record<string, { type?: string }>; required?: string[] };
    assert.equal(input.properties.op_id?.type, 'string', `${name} does not take op_id`);
    assert.ok(!(input.required ?? []).includes('op_id'), `${name} requires op_id`);
  }
});

test('A CREATE SENT TWICE WITH ONE op_id WRITES ONE ENTRY, and both answers name it', async () => {
  const { sql, api } = await record();
  const ask = { register: 'errands', fields: { what: 'Buy stamps' }, op_id: 'op-buy-stamps-1' };
  const first = await call(api, 'create', ask);
  const again = await call(api, 'create', ask);
  assert.notEqual(first.isError, true, first.content[0]?.text);
  assert.notEqual(again.isError, true, again.content[0]?.text);
  assert.equal(again.structuredContent.spoken, first.structuredContent.spoken);
  const listed = await api.list({ register: 'errands' } as never, owner);
  assert.ok(listed.ok);
  assert.equal((listed.value as { rows: unknown[] }).rows.length, 1, 'the second call wrote a second errand');

  /* AND A NEW op_id IS A NEW WRITE, so the key is what makes the replay, never the words. */
  await call(api, 'create', { ...ask, op_id: 'op-buy-stamps-2' });
  const after = await api.list({ register: 'errands' } as never, owner);
  assert.ok(after.ok);
  assert.equal((after.value as { rows: unknown[] }).rows.length, 2);
  sql.close();
});

test('AN UPDATE SENT TWICE WITH ONE op_id MOVES THE VERSION ONCE', async () => {
  const { sql, api } = await record();
  const made = await call(api, 'create', { register: 'errands', fields: { what: 'Buy stamps' } });
  const spoken = String(made.structuredContent.spoken);
  const ask = { spoken, patch: { what: 'Buy stamps and envelopes' }, op_id: 'op-envelopes' };
  const first = await call(api, 'update', ask);
  const again = await call(api, 'update', ask);
  assert.notEqual(first.isError, true, first.content[0]?.text);
  assert.notEqual(again.isError, true, again.content[0]?.text);
  assert.equal(first.structuredContent.version, 2);
  assert.equal(again.structuredContent.version, 2, 'the second call moved the version again');
  sql.close();
});

test('A USED op_id ON ANOTHER KIND OF WRITE IS REFUSED AT op_id, never answered with another entry', async () => {
  const { sql, api } = await record();
  await call(api, 'create', { register: 'errands', fields: { what: 'Buy stamps' }, op_id: 'op-once' });
  const letter = await call(api, 'create', { register: 'errands', fields: { what: 'Post the letter' } });
  const spoken = String(letter.structuredContent.spoken);
  const other = await call(api, 'update', { spoken, patch: { what: 'Post the parcel' }, op_id: 'op-once' });
  assert.equal(other.isError, true, other.content[0]?.text);
  assert.equal(other.structuredContent.at, 'op_id');
  const got = await call(api, 'get', { spoken });
  assert.equal((got.structuredContent.fields as { what: string }).what, 'Post the letter');
  sql.close();
});

test('THE DOOR PASSES op_id TO THE RECORD, and a replay the record marks ends with one line saying so', async () => {
  const entry = { id: 'e1', register: 'errands', seq: 3, fields: { what: 'Buy stamps' }, state: null, version: 1, created_at: '', updated_at: '', deleted_at: null };
  const sent: unknown[] = [];
  const { surface } = stub({
    create: async (args) => {
      sent.push(args);
      return { ok: true, value: { ...entry, replayed: true } } as never;
    },
  });
  const said = await tools(surface).answer('create', { register: 'errands', fields: { what: 'Buy stamps' }, op_id: 'op-1' }, { who: 'agent' });
  assert.equal((sent[0] as { op_id?: string }).op_id, 'op-1');
  assert.ok(said.result.ok);
  assert.equal(said.text.split('\n').at(-1), REPLAYED);
  assert.equal((said.result.value as { replayed?: boolean }).replayed, true);

  const fresh = await tools(stub({ create: async () => ({ ok: true, value: entry }) as never }).surface).answer(
    'create',
    { register: 'errands', fields: { what: 'Buy stamps' } },
    { who: 'agent' },
  );
  assert.ok(!fresh.text.includes(REPLAYED), 'a first write said it was a replay');
});
