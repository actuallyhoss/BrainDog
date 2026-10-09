/**
 * `braindog:handoffs`: the next steps runs left and nobody has taken, read as a resource. It is one table over the page
 * source `handoffs.open`, drawn by the record's `previewPage` and filed nowhere, so an agent reads the same steps the
 * briefing's Next line and the Agents page read, with the app that left each beside its words.
 *
 * ON A REAL RECORD, because the read is the record's: a step left by one run is there, a step taken is not, and nothing
 * is written by reading it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Attached, type CallContext } from '@braindog/record';

import { tools, ttlOf } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const valueOf = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  valueOf(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const agent = async (name: string): Promise<CallContext> => {
    const key = valueOf<{ id: string }>(await api.createToken({ scope: 'write', label: name }, owner)).id;
    const ctx: CallContext = {
      principal: { kind: 'token', id: key, scope: 'write', person: 'p_1', level: 'owner' },
      session: { client_id: `c-${name}`, agent: 'claude', host: 'studio-mac', repo: 'kiln' },
    };
    valueOf<Attached>(await api.attach({ source: 'startup', client_id: `c-${name}` }, ctx));
    return ctx;
  };
  const handoff = async (args: Record<string, unknown>, ctx: CallContext) => {
    const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'handoff', arguments: args } }, api, ctx)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    assert.notEqual((reply.result as { isError?: boolean }).isError, true, JSON.stringify(reply.result));
  };
  const read = async (ctx: CallContext) => {
    const reply = (await handle({ jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'braindog:handoffs' } }, api, ctx)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const text = (reply.result as { contents: { text: string }[] }).contents[0]?.text ?? '';
    return JSON.parse(text) as { title: string; blocks: { rows?: { fields: Record<string, unknown> }[]; refusals?: unknown[] }[] };
  };
  return { sql, api, agent, handoff, read };
}

/** What an agent reads of each step: its words, and the app that left it. */
const steps = (page: Awaited<ReturnType<Awaited<ReturnType<typeof record>>['read']>>) => {
  assert.equal(page.blocks.length, 1, 'one table');
  const block = page.blocks[0]!;
  assert.deepEqual(block.refusals ?? [], [], JSON.stringify(block.refusals));
  return (block.rows ?? []).map((r) => ({ next: r.fields.next, agent: r.fields.agent }));
};

test('A STEP ONE RUN LEFT IS READ BY ANOTHER, with the app that left it, and reading writes nothing', async () => {
  const { sql, agent, handoff, read } = await record();
  const leaver = await agent('leaver');
  await handoff({ next: 'Kern the lowercase pairs', state: 'handoff' }, leaver);

  const reader = await agent('reader');
  const first = steps(await read(reader));
  assert.deepEqual(first.map((s) => s.next), ['Kern the lowercase pairs']);
  assert.equal(first[0]?.agent, 'Claude');

  /* READING WRITES NOTHING: the record counts no page opened for it, and the step is still there to take. */
  const before = sql.one<{ n: number }>('SELECT total_changes() AS n')!.n;
  await read(reader);
  assert.equal(sql.one<{ n: number }>('SELECT total_changes() AS n')!.n, before, 'reading the steps wrote something');
  sql.close();
});

test('IT IS LISTED FOR A CALLER WHO CAN READ IT, never held, and a record with no preview lists no address', async () => {
  const { sql, api, agent } = await record();
  const listed = await tools(api).resources(await agent('lister'));
  assert.ok(listed.some((r) => r.uri === 'braindog:handoffs'), 'braindog:handoffs is not listed');
  assert.equal(ttlOf('braindog:handoffs'), 0);

  const before = stub().surface;
  delete before.previewPage;
  assert.ok(!(await tools(before).resources({ who: 'agent' })).some((r) => r.uri === 'braindog:handoffs'));
  sql.close();
});

test('THE BODY IS ONE TABLE OVER handoffs.open, and the record is asked nothing else to draw it', async () => {
  const bodies: unknown[] = [];
  const { surface, calls } = stub({
    previewPage: async (args) => {
      bodies.push(args.body);
      return { ok: true, value: { page: 'handoffs', title: 'Next steps left', blocks: [{ kind: 'table', rows: [] }] } };
    },
  });
  const read = await tools(surface).read('braindog:handoffs', { who: 'agent' });
  assert.ok(read.ok);
  const body = bodies[0] as { blocks: { kind: string; source: string }[] };
  assert.deepEqual(body.blocks.map((b) => [b.kind, b.source]), [['table', 'handoffs.open']]);
  assert.deepEqual(calls.map((c) => c.method), []);
});
