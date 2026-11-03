/**
 * The prompts (agents and MCP plan §6.3; W2-C): start, wrap and ask, which a client shows a person as commands and which
 * cost the tool list nothing.
 *
 * WHAT IS HELD: the three are listed and read without asking the record; each names only tools that are listed, with
 * arguments those tools take; `ask` puts what it was given into its words; a name there is none of is -32602 with the
 * names there are; and every word is plain ASCII, as the tool list's are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, type Reply } from '../src/rpc.ts';
import { TOOLS } from '../src/index.ts';
import { PROMPTS } from '../src/instructions.ts';
import { stub } from './stub.ts';

const ctx = { who: 'agent' };
let n = 0;
const ask = async (method: string, params: Record<string, unknown> = {}) => (await handle({ jsonrpc: '2.0', id: ++n, method, params }, stub().surface, ctx)) as Reply;
const textOf = (r: Reply): string => {
  assert.ok('result' in r, JSON.stringify(r));
  return (r.result as { messages: { content: { text: string } }[] }).messages.map((m) => m.content.text).join('\n');
};

test('FOUR PROMPTS, listed and read without a call to the record', async () => {
  const { surface, calls } = stub();
  const listed = (await handle({ jsonrpc: '2.0', id: 1, method: 'prompts/list' }, surface, ctx)) as Reply;
  assert.ok('result' in listed);
  assert.deepEqual((listed.result as { prompts: { name: string }[] }).prompts.map((p) => p.name), ['start', 'wrap', 'ask', 'addon']);
  for (const p of PROMPTS) assert.ok((await handle({ jsonrpc: '2.0', id: 2, method: 'prompts/get', params: { name: p.name } }, surface, ctx)) !== null);
  assert.equal(calls.length, 0);
});

test('START IS CONTEXT, THEN INSTRUCTIONS, THEN A PLAN IN ONE LINE; WRAP ANSWERS, HANDS OFF AND KEEPS A LESSON ONLY IF NEEDED', async () => {
  const start = textOf(await ask('prompts/get', { name: 'start' }));
  assert.ok(start.indexOf('context') < start.indexOf('instructions') && start.indexOf('instructions') < start.indexOf('handoff'), start);
  assert.match(start, /instructions with \{take:"<its id>"\}/u);
  const wrap = textOf(await ask('prompts/get', { name: 'wrap' }));
  assert.match(wrap, /instructions \{reply:"<its id>", said:/u);
  assert.match(wrap, /handoff \{done:"<task>"/u);
  /* WHEN A LESSON IS WORTH KEEPING, and its topic the skill it bears on. */
  assert.match(wrap, /a dead end a later session would repeat, create a learning with topic/u);
});

test('EVERY TOOL A PROMPT NAMES IS LISTED, and every argument it shows is one that tool takes', async () => {
  const listed = new Map(TOOLS.map((t) => [t.name, Object.keys((t.input as { properties?: object }).properties ?? {})]));
  for (const p of PROMPTS) {
    const text = textOf(await ask('prompts/get', { name: p.name, arguments: { about: 'the Kiln specimen' } }));
    for (const [, tool, args] of text.matchAll(/\b([a-z_]+) (?:with )?\{([^}]*)\}/gu)) {
      if (tool === 'body' || tool === undefined) continue;
      assert.ok(listed.has(tool), `${p.name} names ${tool}, which is not listed`);
      for (const [, key] of (args ?? '').matchAll(/(?:^|[,{]\s*)"?([a-z_]+)"?:/gu)) assert.ok(listed.get(tool)!.includes(key!), `${p.name} sends ${tool} ${key ?? ''}`);
    }
    assert.match(text, /^[\x20-\x7E\n]*$/u, `${p.name} carries a character outside plain ASCII`);
  }
  assert.match(textOf(await ask('prompts/get', { name: 'ask', arguments: { about: 'the Kiln specimen' } })), /^Ask the person to decide: the Kiln specimen\./u);
});

test('A PROMPT THERE IS NONE OF IS -32602, naming the ones there are', async () => {
  const r = await ask('prompts/get', { name: 'deploy' });
  assert.ok('error' in r);
  assert.equal(r.error.code, -32602);
  assert.deepEqual((r.error.data as { allowed: string[] }).allowed, ['start', 'wrap', 'ask', 'addon']);
});
