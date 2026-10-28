/**
 * A write whose answer was lost is sent once more with the same operation id, and is one entry.
 *
 * WHY THIS FILE EXISTS. The bridge never sent a tool call twice, so a create that timed out was answered UNREACHABLE
 * whether the host had written it or not, and the agent wrote it again: two tasks for one "add a task". Now `forward`
 * in `src/bridge.ts` makes an `op_id` for a create or an update the app sent without one, and on an answer that never
 * came sends the same call once more. The record answers a second sending of one id with the first one's entry.
 *
 * THE HOST HERE IS A FAKE THAT KEEPS ENTRIES BY OPERATION ID, as the kernel does (`opId` in
 * `packages/kernel/src/index.ts`), and loses the answer it chooses after it has written. That is the failure itself: the
 * write landed and the answer did not. The last case runs the same through a real self-host, whose door lists the
 * argument (`packages/mcp/src/index.ts`); it turns to a todo if the door stops listing it.
 *
 * RED FIRST, MEASURED over a copy of `src/bridge.ts` with one line changed: with the retry in `forward` gone, the lost
 * create, the twice-away create, the update and the self-host case go red (one POST, UNREACHABLE); with `withOpId`
 * marking a call to send again without making an id, the same four and the unit case go red (two tasks on the record).
 * The read and the old-host cases stay green under both, as they should. With a new id made for each sending, every
 * retry case goes red, the self-host update at a version among them (answered VERSION_STALE).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';

import { TOOLS } from '@braindog/mcp';

import { openKeyStore, recordKeys } from '../../selfhost/src/keys.ts';
import { start } from '../../selfhost/src/server.ts';
import { opTools, serveBridge, withOpId } from '../src/bridge.ts';
import type { Target } from '../src/http.ts';

type Rpc = { id?: string | number | null; result?: Record<string, any>; error?: { message: string } };
type Call = { name: string; arguments: Record<string, unknown> };

const HELLO = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.2.0' } };
const schema = (props: Record<string, unknown>) => ({ type: 'object', properties: props });

/**
 * A host holding tasks, whose list says `create` and `update` take `op_id` unless `old` is set. `lose` picks which
 * tool calls lose their answer after the host acted on them: each call is counted from one.
 */
function host(opts: { old?: boolean; lose?: (call: Call, n: number) => boolean } = {}) {
  const entries = new Map<string, { seq: number; what: string }>();
  const byOp = new Map<string, number>();
  const calls: Call[] = [];
  const op = opts.old ? {} : { op_id: { type: 'string' } };
  const tools = [
    { name: 'list', inputSchema: schema({ register: { type: 'string' } }) },
    { name: 'create', inputSchema: schema({ register: { type: 'string' }, fields: { type: 'object' }, ...op }) },
    { name: 'update', inputSchema: schema({ spoken: { type: 'string' }, patch: { type: 'object' }, ...op }) },
  ];
  const answer = (id: unknown, result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  const fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: unknown; method: string; params?: Record<string, any> };
    if (body.method === 'initialize') return answer(body.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'braindog', version: '0' } });
    if (body.method === 'tools/list') return answer(body.id, { tools });
    const call = { name: String(body.params?.name), arguments: (body.params?.arguments ?? {}) as Record<string, unknown> };
    calls.push(call);
    let text = 'Tasks: none.';
    if (call.name === 'create') {
      const known = typeof call.arguments.op_id === 'string' ? byOp.get(call.arguments.op_id) : undefined;
      const seq = known ?? entries.size + 1;
      if (known === undefined) entries.set(String(seq), { seq, what: String((call.arguments.fields as { what?: string }).what) });
      if (typeof call.arguments.op_id === 'string') byOp.set(call.arguments.op_id, seq);
      text = `Added task ${String(seq)}.`;
    }
    if (call.name === 'update') text = 'Changed task 1.';
    /* THE HOST ACTED, AND THE ANSWER WAS LOST ON THE WAY BACK. */
    if (opts.lose?.(call, calls.length)) throw new TypeError('fetch failed');
    return answer(body.id, { content: [{ type: 'text', text }] });
  }) as typeof globalThis.fetch;
  return { fetch, entries, calls };
}

/** A bridge over two pipes on `fetch`, and a way to ask it something and read the line that answers. */
function bridge(t: { after: (f: () => void) => void }, fetch: typeof globalThis.fetch, target: Target = { key: 'http://host.test', base: 'http://host.test', token: 'not-a-secret' }) {
  const home = mkdtempSync(join(tmpdir(), 'braindog-op-id-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: Rpc[] = [];
  const waiting: (() => void)[] = [];
  const said: string[] = [];
  createInterface({ input: output }).on('line', (line) => {
    lines.push(JSON.parse(line) as Rpc);
    for (const wake of waiting.splice(0)) wake();
  });
  const done = serveBridge({ input, output, home, fetch, ms: 2_000, say: (l) => void said.push(l) }, target, async () => ({}));
  let next = 0;
  const ask = async (method: string, params?: Record<string, unknown>): Promise<Rpc> => {
    const id = ++next;
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`);
    for (;;) {
      const found = lines.find((r) => r.id === id);
      if (found) return found;
      await new Promise<void>((wake) => waiting.push(wake));
    }
  };
  const end = async () => {
    input.end();
    await done;
  };
  return { ask, end, said };
}

/** A session that has said hello and read the list, as Claude Code starts one. */
async function started(t: { after: (f: () => void) => void }, fetch: typeof globalThis.fetch, target?: Target) {
  const b = bridge(t, fetch, target);
  await b.ask('initialize', HELLO);
  await b.ask('tools/list', {});
  return b;
}

const textOf = (r: Rpc) => JSON.stringify(r);

test('A CREATE WHOSE ANSWER WAS LOST IS SENT ONCE MORE WITH THE SAME op_id, and the record holds one task', async (t) => {
  const h = host({ lose: (call, n) => call.name === 'create' && n === 1 });
  const b = await started(t, h.fetch);
  const got = await b.ask('tools/call', { name: 'create', arguments: { register: 'tasks', fields: { what: 'Buy stamps' } } });
  await b.end();

  assert.notEqual(got.result?.isError, true, `the retry was not answered: ${textOf(got)}`);
  assert.ok(textOf(got).includes('Added task 1.'), textOf(got));
  assert.equal(h.calls.length, 2, 'the create was not sent exactly twice');
  const [first, second] = h.calls.map((c) => c.arguments.op_id);
  assert.equal(typeof first, 'string', 'the bridge made no op_id for a create sent without one');
  assert.equal(second, first, 'the retry carried another op_id, so the record would write it again');
  assert.equal(h.entries.size, 1, `"add a task" made ${String(h.entries.size)} tasks`);
  assert.ok(b.said.some((l) => l.includes('sent once more')), 'nothing on stderr said the write was sent again');
});

test('A READ WHOSE ANSWER WAS LOST IS NEVER SENT AGAIN, and answers UNREACHABLE', async (t) => {
  const h = host({ lose: (call) => call.name === 'list' });
  const b = await started(t, h.fetch);
  const got = await b.ask('tools/call', { name: 'list', arguments: { register: 'tasks' } });
  await b.end();

  assert.equal(h.calls.length, 1, 'a read was sent twice');
  assert.equal(h.calls[0]!.arguments.op_id, undefined, 'a read was given an op_id');
  assert.equal(got.result?.isError, true, textOf(got));
  assert.ok(textOf(got).includes('UNREACHABLE'), textOf(got));
});

test('A CREATE AWAY TWICE IS SENT TWICE, NOT THREE TIMES, and the agent is told it is unreachable', async (t) => {
  const h = host({ lose: (call) => call.name === 'create' });
  const b = await started(t, h.fetch);
  const got = await b.ask('tools/call', { name: 'create', arguments: { register: 'tasks', fields: { what: 'Buy stamps' } } });
  await b.end();

  assert.equal(h.calls.length, 2);
  assert.ok(textOf(got).includes('UNREACHABLE'), textOf(got));
  assert.equal(h.entries.size, 1, 'the two sendings of one id wrote two tasks');
});

test('AN UPDATE IS GIVEN AN ID TOO, AND AN ID THE APP SENT IS SENT AS THE APP WROTE IT', async (t) => {
  const h = host({ lose: (_call, n) => n === 1 || n === 3 });
  const b = await started(t, h.fetch);
  await b.ask('tools/call', { name: 'update', arguments: { spoken: 'task 1', patch: { what: 'Buy two stamps' } } });
  await b.ask('tools/call', { name: 'create', arguments: { register: 'tasks', fields: { what: 'Post it' }, op_id: 'mine-1' } });
  await b.end();

  assert.deepEqual(
    h.calls.map((c) => c.name),
    ['update', 'update', 'create', 'create'],
  );
  assert.equal(typeof h.calls[0]!.arguments.op_id, 'string');
  assert.equal(h.calls[1]!.arguments.op_id, h.calls[0]!.arguments.op_id);
  assert.deepEqual(
    h.calls.slice(2).map((c) => c.arguments.op_id),
    ['mine-1', 'mine-1'],
  );
});

test('A HOST WHOSE LIST DOES NOT NAME op_id IS SENT NONE, and a lost create is not sent again', async (t) => {
  /* AN OLD HOST REFUSES AN ARGUMENT ITS TOOL DOES NOT LIST, so an id made here would fail every write. */
  const h = host({ old: true, lose: (call) => call.name === 'create' });
  const b = await started(t, h.fetch);
  const got = await b.ask('tools/call', { name: 'create', arguments: { register: 'tasks', fields: { what: 'Buy stamps' } } });
  await b.end();

  assert.equal(h.calls.length, 1, 'a write with no operation id was sent twice, which is two tasks');
  assert.equal(h.calls[0]!.arguments.op_id, undefined);
  assert.ok(textOf(got).includes('UNREACHABLE'), textOf(got));
});

test('withOpId AND opTools: only create and update, only a listed argument, and never over the app’s own', () => {
  const takes = opTools({ tools: [{ name: 'create', inputSchema: { properties: { op_id: {} } } }, { name: 'list', inputSchema: { properties: {} } }] });
  assert.deepEqual([...takes], ['create']);
  const call = (name: string, args?: unknown) => ({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, ...(args === undefined ? {} : { arguments: args }) } });
  const made = withOpId(call('create', { register: 'tasks' }), takes, () => 'op_x');
  assert.equal(made.again, true);
  assert.equal((made.message.params as { arguments: { op_id: string } }).arguments.op_id, 'op_x');
  assert.equal(withOpId(call('update', {}), takes, () => 'op_x').again, false, 'update is not listed with op_id here');
  assert.equal(withOpId(call('list', {}), new Set(['list']), () => 'op_x').again, false, 'a read was made retryable');
  assert.equal(withOpId(call('create', { op_id: 7 }), takes, () => 'op_x').again, false, 'an id of another shape was replaced');
  assert.equal(withOpId(call('create', 'not an object'), takes, () => 'op_x').again, false);
  assert.equal(withOpId({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'braindog:boot' } }, takes).again, false);
});

/* THE DOOR TAKES THE ARGUMENT once `create` lists it; until then it refuses it, and this case waits. */
const listed = opTools({ tools: TOOLS.map((x) => ({ name: x.name, inputSchema: (x as unknown as { input: unknown }).input })) }).has('create');

/** A real self-host holding a Things list, and a fetch to it that throws away the first answer to the tool `lost`. */
async function selfHost(t: { after: (f: () => Promise<void>) => void }, lost: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-op-id-host-'));
  const store = await openKeyStore(join(dir, 'kek.key'));
  const serverKey = randomBytes(32).toString('base64url');
  const running = await start({ file: join(dir, 'record.brain'), directory: join(dir, 'directory.sqlite'), port: 0, host: '127.0.0.1', token: serverKey, sessionKey: new Uint8Array(randomBytes(32)), keys: store, pollMs: 0 });
  t.after(async () => {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const person = running.directory.person$('ada@example.com', 'Ada');
  assert.ok(person.ok);
  const rec = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
  const owner = { id: person.value.id, email: 'ada@example.com', name: 'Ada' };
  assert.ok((await running.api.createRecord({ id: rec, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner, keys: await recordKeys(store, rec) })).ok);
  const things = { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] };
  assert.ok((await running.api.kernel.install([{ id: 'register.things', kind: 'register', body: things as never }])).ok);
  const base = `http://127.0.0.1:${(running.server.address() as { port: number }).port}`;

  /* THE REAL HOST WRITES, AND THE FIRST ANSWER TO `lost` IS THROWN AWAY on its way back. */
  const sent = { n: 0 };
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const res = await globalThis.fetch(input, init);
    const body = JSON.parse(String(init?.body)) as { method?: string; params?: { name?: string } };
    if (body.method === 'tools/call' && body.params?.name === lost && ++sent.n === 1) throw new TypeError('fetch failed');
    return res;
  }) as typeof globalThis.fetch;
  return { running, sent, fetch, target: { key: base, base, token: serverKey } as Target, owner: person.value.id };
}

test(
  'THROUGH A REAL SELF-HOST, A CREATE WHOSE ANSWER WAS LOST IS ONE THING ON THE RECORD',
  { todo: listed ? false : 'waits on op_id in the create tool of packages/mcp/src/index.ts (mcp-index-45)' },
  async (t) => {
    const h = await selfHost(t, 'create');
    const b = await started(t, h.fetch, h.target);
    const got = await b.ask('tools/call', { name: 'create', arguments: { register: 'things', fields: { name: 'Buy stamps' } } });
    await b.end();

    assert.equal(h.sent.n, 2, 'the lost create was not sent once more');
    assert.notEqual(got.result?.isError, true, textOf(got));
    /* The line "Already saved by this operation." waits on the kernel marking a replay (mcp-index-45), so it is not pinned. */
    const listedThings = await h.running.api.kernel.list({ register: 'things', limit: 10 });
    assert.ok(listedThings.ok);
    assert.equal(listedThings.value.rows.length, 1, 'one "add a thing" made two things on the record');
  },
);

/*
 * THE RETRY CARRIES THE VERSION THE FIRST SENDING READ, and the first sending moved it. A record that compared the
 * version before it looked for the id would answer the retry VERSION_STALE, and the agent would be told its change was
 * lost when it had landed, and re-apply it. The record looks for the id first (`writing`, step zero, in the kernel).
 */
test(
  'THROUGH A REAL SELF-HOST, AN UPDATE AT A VERSION WHOSE ANSWER WAS LOST IS NOT RETRIED INTO A CONFLICT, and moves the version once',
  { todo: listed ? false : 'waits on op_id in the update tool of packages/mcp/src/index.ts (mcp-index-45)' },
  async (t) => {
    const h = await selfHost(t, 'update');
    const made = h.running.api.kernel.create('things', { name: 'Buy stamps' }, { actor: h.owner });
    assert.ok(made.ok, JSON.stringify(made));
    const b = await started(t, h.fetch, h.target);
    const got = await b.ask('tools/call', { name: 'update', arguments: { spoken: `things#${String(made.value.seq)}`, patch: { name: 'Buy two stamps' }, version: made.value.version } });
    await b.end();

    assert.equal(h.sent.n, 2, 'the lost update was not sent exactly once more');
    assert.notEqual(got.result?.isError, true, `the retry was refused: ${textOf(got)}`);
    assert.ok(!textOf(got).includes('VERSION_STALE'), `the retry was answered as a conflict: ${textOf(got)}`);
    const now = h.running.api.kernel.get(`things#${String(made.value.seq)}`);
    assert.equal(now?.version, made.value.version + 1, 'the update sent twice moved the version twice');
    assert.equal(now?.fields.name, 'Buy two stamps');
  },
);
