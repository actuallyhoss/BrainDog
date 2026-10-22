/**
 * `context`'s `topic`, over `/mcp`: what an agent with no folder says the person is working on. The tool lists it, the
 * door hands it to the record as it was sent, and the one line the record asks an agent with no folder (`ask`) is said
 * after the card, the plan's too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { briefed } from '../src/briefing.ts';
import { PROMPTS, promptOf } from '../src/instructions.ts';
import { TOOLS } from '../src/index.ts';
import type { Decl, Look } from '../src/brief.ts';
import { stub, type Ctx } from './stub.ts';

const ctx: Ctx = { who: 'agent' };
const look: Look = { now: Date.UTC(2026, 9, 22), decl: () => undefined as Decl | undefined, title: () => undefined, actor: (b) => b, decider: 'Ada' };
const ASK = 'You have no folder, so no project yet. Ask what they are working on, then call context with topic set to its name.';

test('THE TOOL LISTS topic, and the start prompt asks for it when there is no folder', () => {
  const context = TOOLS.find((t) => t.name === 'context') ?? assert.fail('no context tool');
  const props = (context.input as { properties?: Record<string, unknown> }).properties ?? {};
  assert.ok(Object.hasOwn(props, 'topic'), 'context does not list topic');
  assert.ok(PROMPTS.some((p) => p.name === 'start'));
  assert.match(promptOf('start', {})?.messages[0]?.content.text ?? '', /With no folder, pass topic/u);
});

test('THE DOOR HANDS topic TO THE RECORD as it was sent', async () => {
  const { surface, calls } = stub();
  const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'context', arguments: { topic: 'Kiln works' } } }, surface, ctx)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  const asked = calls.find((c) => c.method === 'context') ?? assert.fail('the record was not asked');
  assert.deepEqual(asked.args, { topic: 'Kiln works' });
});

test('THE ASK IS SAID AFTER THE CARD, and kept in the answer', () => {
  const out = briefed({ context: { session: null, project: null, card: 'BrainDog · no project', ask: ASK, registers: [] }, look, home: null });
  assert.equal(out.value.ask, ASK);
  assert.ok(out.text.split('\n').includes(ASK), out.text);
});

test('THE ASK IS KEPT WHEN THE PLAN TAKES THE PLACE OF THE REST', () => {
  const out = briefed({ context: { session: null, project: null, card: 'BrainDog', plan: 'BrainDog · no project', ask: ASK, registers: [] }, look, home: null });
  assert.ok(out.text.startsWith('BrainDog · no project'), out.text);
  assert.ok(out.text.split('\n').includes(ASK), out.text);
});

test('NO ASK, NO LINE: a briefing the record asked nothing in says nothing of a topic', () => {
  const out = briefed({ context: { session: null, project: { spoken: 'things#1', name: 'Kiln' }, card: 'BrainDog · project Kiln', registers: [] }, look, home: null });
  assert.equal(out.value.ask, undefined);
  assert.doesNotMatch(out.text, /topic/u);
});
