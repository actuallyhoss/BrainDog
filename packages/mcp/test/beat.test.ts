/**
 * The agent door beats on each tool call ("a real heartbeat"): any client on the door reads Working
 * while it calls tools, hook or none. A beat is never waited on and never fails or slows the call it rides on, a call
 * the door refused before the record saw it does not beat, and a surface with no `beat` answers as it always has.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { tools } from '../src/index.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };
let n = 0;
const req = (method: string, params?: Record<string, unknown>) => ({ jsonrpc: '2.0', id: ++n, method, ...(params === undefined ? {} : { params }) });
const call = (name: string, args: Record<string, unknown>) => req('tools/call', { name, arguments: args });

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
const result = (reply: Reply | null): ToolResult => {
  assert.ok(reply && 'result' in reply, JSON.stringify(reply));
  return reply.result as ToolResult;
};

/** A stub whose `beat` counts what it was handed, and answers as `answer` says. */
function beating(answer: () => Promise<{ ok: true; value: unknown }> = async () => ({ ok: true, value: { run: 'S1' } })) {
  const beats: { args: unknown; ctx: unknown }[] = [];
  const s = stub({
    beat: (args, c) => {
      beats.push({ args, ctx: c });
      return answer();
    },
  });
  return { ...s, beats };
}

/** Within `ms`, or the test fails: a beat that hangs must not hold the answer. */
const inTime = <T>(p: Promise<T>, ms = 1_000): Promise<T> =>
  Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error(`no answer within ${ms} ms`)), ms).unref())]);

test('THREE TOOL CALLS BEAT THREE TIMES, each with the caller\'s own context and nothing more', async () => {
  const { surface, beats, calls } = beating();
  await handle(call('get', { spoken: 'obligations#41' }), surface, ctx);
  await handle(call('search', { q: 'domain' }), surface, ctx);
  await handle(call('context', { format: 'full' }), surface, ctx);
  assert.equal(beats.length, 3);
  for (const b of beats) {
    assert.deepEqual(b.args, {});
    /* THE CALLER'S CONTEXT, never `context`'s full hint on the session: a beat sends nothing a call did not carry. */
    assert.equal(b.ctx, ctx);
  }
  /* THE BEAT IS THE DOOR'S, never a method the tool itself called. */
  assert.equal(calls.filter((c) => c.method === 'beat').length, 0);
});

test('AND IN PROCESS, the same: `call` beats once a call', async () => {
  const { surface, beats } = beating();
  const door = tools(surface);
  await door.call('get', { spoken: 'obligations#41' }, ctx);
  await door.call('list', { register: 'obligations' }, ctx);
  assert.equal(beats.length, 2);
});

test('A CALL REFUSED BEFORE IT REACHES THE RECORD DOES NOT BEAT', async () => {
  const { surface, beats, calls } = beating();
  /* No such tool. */
  assert.equal(result(await handle(call('gett', { spoken: 'obligations#41' }), surface, ctx)).isError, true);
  /* A key the tool does not take. */
  assert.equal(result(await handle(call('get', { spoken: 'obligations#41', colour: 'red' }), surface, ctx)).isError, true);
  /* An answer to a question the door never asks. */
  assert.equal(result(await handle(call('propose', { inputResponses: {} }), surface, ctx)).isError, true);
  assert.equal(beats.length, 0);
  assert.deepEqual(calls.map((c) => c.method), []);
});

test('A BEAT THAT THROWS, REJECTS, REFUSES OR HANGS LEAVES THE ANSWER UNCHANGED AND ON TIME', async () => {
  const plain = stub();
  const want = result(await handle(call('get', { spoken: 'obligations#41' }), plain.surface, ctx));
  const ways: Record<string, NonNullable<ReturnType<typeof stub>['surface']['beat']>> = {
    throws: () => {
      throw new Error('the record is away');
    },
    rejects: async () => {
      throw new Error('the record is away');
    },
    refuses: async () => ({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'beat is how an agent says it is still working.' } }),
    hangs: () => new Promise(() => undefined),
  };
  for (const [way, beat] of Object.entries(ways)) {
    const { surface } = stub({ beat });
    const got = result(await inTime(handle(call('get', { spoken: 'obligations#41' }), surface, ctx)));
    assert.deepEqual(got, want, way);
  }
});

test('A SURFACE WITH NO BEAT ANSWERS AS BEFORE, and calls the record exactly as one with a beat does', async () => {
  const plain = stub();
  const with_ = beating();
  assert.equal(plain.surface.beat, undefined);
  for (const [name, args] of [
    ['get', { spoken: 'obligations#41' }],
    ['search', { q: 'domain' }],
    ['create', { register: 'obligations', fields: { what: 'Renew the domain' } }],
  ] as const) {
    const a = result(await handle(call(name, args), plain.surface, ctx));
    const b = result(await handle(call(name, args), with_.surface, ctx));
    assert.deepEqual(b, a, name);
  }
  assert.deepEqual(with_.calls.map((c) => c.method), plain.calls.map((c) => c.method));
  assert.equal(with_.beats.length, 3);
});
