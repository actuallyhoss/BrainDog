/**
 * The agent door's limits: a limit under 1 reaches the record as sent and is refused there in the
 * record's words, never made 1 without a word; a limit past a hundred is answered a hundred, and the answer's last line
 * says how many of how many and that the rest is the same call with the cursor beside it.
 *
 * ON A REAL RECORD WITH 130 ENTRIES, because the count and the cursor are the record's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const ERRANDS = {
  id: 'register.errands',
  kind: 'register' as const,
  body: { id: 'errands', name: 'Errands', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function record(n: number) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([ERRANDS])).ok);
  for (let i = 1; i <= n; i += 1) assert.ok(api.kernel.create('errands', { what: `Errand ${String(i)}` }, { actor: 'p_1' }).ok);
  return { sql, api };
}

type ToolResult = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };

let id = 0;
async function call(api: Awaited<ReturnType<typeof record>>['api'], name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, api, owner)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result as ToolResult;
}

const textOf = (r: ToolResult): string => r.content.map((c) => c.text).join('\n');

test('A LIMIT PAST A HUNDRED IS ANSWERED A HUNDRED, and the last line says 100 of N and the call for the rest', async () => {
  const { sql, api } = await record(130);
  const out = await call(api, 'list', { register: 'errands', limit: 200 });
  assert.notEqual(out.isError, true, textOf(out));
  const rows = out.structuredContent.rows as unknown[];
  assert.equal(rows.length, 100);
  const cursor = out.structuredContent.cursor;
  assert.equal(typeof cursor, 'string', 'no cursor for the rest');
  const last = textOf(out).split('\n').at(-1) ?? '';
  assert.ok(last.startsWith('100 of 130. More: the same call with this cursor. list '), last);
  assert.ok(last.includes(String(cursor)), 'the line does not carry the cursor');
  assert.doesNotMatch(last, /—/u);

  /* THE REST IS THE SAME CALL WITH THE CURSOR, and it answers the thirty left with no line about a cut. */
  const rest = await call(api, 'list', { register: 'errands', limit: 200, cursor });
  assert.equal((rest.structuredContent.rows as unknown[]).length, 30);
  assert.ok(!textOf(rest).includes('More:'), textOf(rest));
  sql.close();
});

test('A LIMIT OF A HUNDRED OR LESS IS SAID AS BEFORE, with no line about a cut', async () => {
  const { sql, api } = await record(130);
  const out = await call(api, 'list', { register: 'errands', limit: 100 });
  assert.equal((out.structuredContent.rows as unknown[]).length, 100);
  assert.ok(!textOf(out).includes('the same call with this cursor'), textOf(out));
  sql.close();
});

test('A LIMIT UNDER 1 IS REFUSED BY THE RECORD AT limit, never answered as one', async () => {
  const { sql, api } = await record(3);
  for (const limit of [0, -5]) {
    const out = await call(api, 'list', { register: 'errands', limit });
    assert.equal(out.isError, true, `limit ${String(limit)} was answered: ${textOf(out)}`);
    assert.equal(out.structuredContent.at, 'limit');
    assert.match(String(out.structuredContent.try ?? ''), /"limit":1/u, 'the refusal does not hand the corrected call');
  }
  sql.close();
});

test('ACTIVITY PAST A HUNDRED IS ANSWERED A HUNDRED TOO', async () => {
  const { sql, api } = await record(130);
  const out = await call(api, 'activity', { limit: 200 });
  assert.notEqual(out.isError, true, textOf(out));
  assert.equal((out.structuredContent.rows as unknown[]).length, 100);
  assert.match(textOf(out).split('\n').at(-1) ?? '', /^100 so far\. More: the same call with this cursor\. activity /u);
  sql.close();
});
