/**
 * The door marks itself: `handle` calls the surface's optional `heard` for `hello`, `listed`, `called`
 * and an INTERNAL answer, never waits on it, and a mark that fails leaves the call whole.
 *
 * Over the stub surface and over `serveMcp`, since the HTTP host is the transport that hands `handle` a caller.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { serveMcp } from '../src/http.ts';
import { TOOLS, type McpSurface } from '../src/index.ts';
import { stub, type Ctx } from './stub.ts';

type Mark = { kind: string; n?: number; build?: string; client?: string };

/** A surface whose `heard` keeps what it was handed, answering as `answer` says. */
function marking(answer: (m: Mark) => Promise<unknown> = async () => ({ ok: true, value: {} }), over: Partial<McpSurface<Ctx>> = {}) {
  const marks: Mark[] = [];
  const { surface } = stub({ ...over, heard: ((m: Mark) => (marks.push(m), answer(m))) as never });
  return { surface, marks };
}

const ctx: Ctx = { who: 'agent' };
const call = (id: number, name = 'context') => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });

test('FOUR MARKS: hello with the client, listed with the count, called on the first call, internal on an INTERNAL answer', async () => {
  const { surface, marks } = marking(undefined, { context: async () => ({ ok: false, refusal: { code: 'INTERNAL', fix: 'The record could not answer.' } }) });
  await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', clientInfo: { name: 'claude-code', version: '2.1.4' } } }, surface, ctx);
  await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, surface, ctx);
  await handle(call(3), surface, ctx);
  assert.deepEqual(marks, [
    { kind: 'hello', build: '0.0.0', client: 'claude-code 2.1.4' },
    { kind: 'listed', n: TOOLS.length },
    { kind: 'called', n: 1 },
    { kind: 'internal' },
  ]);
});

test('A THROW BELOW THE DISPATCH IS MARKED INTERNAL, and the caller is still answered -32603', async () => {
  const { surface, marks } = marking(undefined, { context: () => { throw new Error('boom'); } });
  const quiet = console.error;
  console.error = () => undefined;
  try {
    const reply = (await handle(call(1), surface, ctx)) as Reply;
    assert.ok('error' in reply && reply.error.code === -32603);
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(marks.map((m) => m.kind), ['called', 'internal']);
});

test('CALLED IS MARKED ON THE FIRST CALL, then held: the calls in the next minute ride on the next mark', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 9, 12) });
  const { surface, marks } = marking();
  for (let i = 1; i <= 4; i++) await handle(call(i), surface, ctx);
  assert.deepEqual(marks, [{ kind: 'called', n: 1 }], 'every call was marked, a write on the path that must stay fast');
  t.mock.timers.tick(60_000);
  await handle(call(5), surface, ctx);
  assert.deepEqual(marks.at(-1), { kind: 'called', n: 4 }, 'the three held calls and this one are one mark');
  /* ANOTHER CALLER ON THE SAME SURFACE IS ITS OWN FIRST CALL. */
  await handle(call(6), surface, ctx, undefined, undefined, 'another');
  assert.deepEqual(marks.at(-1), { kind: 'called', n: 1 });
});

test('A FAILING MARK LEAVES THE CALL WHOLE: a throw, a rejection, a refusal and one that never settles', async () => {
  const ways: Array<[string, () => unknown]> = [
    ['throws', () => { throw new Error('the mark table is gone'); }],
    ['rejects', () => Promise.reject(new Error('locked'))],
    ['refuses', async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'No.' } })],
    ['hangs', () => new Promise(() => undefined)],
  ];
  for (const [how, heard] of ways) {
    const { surface } = stub({ heard: heard as never });
    const hello = (await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }, surface, ctx)) as Reply;
    assert.ok('result' in hello, `initialize failed when the mark ${how}`);
    const listed = (await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, surface, ctx)) as Reply;
    assert.ok('result' in listed && (listed.result as { tools: unknown[] }).tools.length === TOOLS.length, `tools/list failed when the mark ${how}`);
    const called = (await handle(call(3), surface, ctx)) as Reply;
    assert.ok('result' in called && (called.result as { isError?: boolean }).isError === undefined, `the call failed when the mark ${how}`);
  }
});

test('A SURFACE WITHOUT `heard` IS LEFT ALONE, and a list refused for its cursor is not marked as given', async () => {
  const bare = stub().surface;
  assert.ok('result' in ((await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, bare, ctx)) as Reply));
  const { surface, marks } = marking();
  const paged = (await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { cursor: 'x' } }, surface, ctx)) as Reply;
  assert.ok('error' in paged);
  assert.deepEqual(marks, []);
});

test('OVER HTTP EACH BEARER IS ITS OWN CALLER, so two sessions on one record each count as having called', async () => {
  const { surface, marks } = marking();
  const post = (bearer: string, id: number) =>
    serveMcp(
      new Request('https://brain.dog/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, 'mcp-protocol-version': '2025-11-25' },
        body: JSON.stringify(call(id)),
      }),
      surface,
      ctx,
    );
  for (const [bearer, id] of [['one', 1], ['one', 2], ['two', 3]] as const) assert.equal((await post(bearer, id)).status, 200);
  assert.deepEqual(marks, [{ kind: 'called', n: 1 }, { kind: 'called', n: 1 }]);
});

test('THE DOOR MARKS THROUGH `doorHeard` WHEN THE SURFACE HAS IT, and `heard`, the routed one a key can post to, gets none', async () => {
  const routed: Mark[] = [];
  const own: Mark[] = [];
  const { surface } = stub({ heard: ((m: Mark) => (routed.push(m), Promise.resolve({ ok: true, value: {} }))) as never });
  const door = Object.assign(surface, { doorHeard: (m: Mark) => (own.push(m), Promise.resolve({ ok: true, value: {} })) });
  await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }, door, ctx);
  await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, door, ctx);
  await handle(call(3), door, ctx);
  assert.deepEqual(own.map((m) => m.kind), ['hello', 'listed', 'called']);
  assert.deepEqual(routed, [], 'the door handed its own marks to the routed heard, which refuses them');
});

test('A `doorHeard` THAT THROWS LEAVES THE CALL WHOLE, as a failing `heard` does', async () => {
  const { surface } = stub();
  const door = Object.assign(surface, { doorHeard: () => { throw new Error('no table'); } });
  const called = (await handle(call(1), door, ctx)) as Reply;
  assert.ok('result' in called && (called.result as { isError?: boolean }).isError === undefined);
});
