/**
 * The line a tool's answer carries when something new waits, and `_meta.braindog` on every answer (agents and MCP plan
 * §2.3 B, §3.4, §8.3; W2-C).
 *
 * WHAT IS HELD: an instruction he sends a run reaches it on its next tool answer, whatever the tool, said once and in his
 * words, and the record hears it was seen in a tool answer; nothing is added when nothing new waits; a stop is said on
 * every answer while it stands, except one the record already refused for it; the line is two lines and 200 characters
 * at most; and a tool's answer never waits long for the check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handle, piggyback, type Reply } from '../src/rpc.ts';
import { installSeed, NOW } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };
const agent: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: 'piggy' },
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await installSeed(api.kernel)).ok);
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  clock.advance(60_000);
  return { api, sql, clock };
}

let n = 0;
type Result = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown>; _meta?: { braindog?: { stamp: string; pending: { id: string }[]; stop: unknown } } };
async function call(api: object, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api as never, { ...agent }, undefined, undefined, 'piggy')) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result as Result;
}

test('A NEW INSTRUCTION RIDES ON THE NEXT TOOL ANSWER, once, in his words, and the record hears it was seen there', async () => {
  const { api, sql, clock } = await record();
  const opened = await call(api, 'handoff', { doing: 'Reading the Portage board' });
  assert.notEqual(opened.isError, true, opened.content[0]!.text);
  const run = String((opened.structuredContent as { spoken?: string }).spoken);
  const quiet = await call(api, 'list', { register: 'tasks', limit: 2 });
  assert.doesNotMatch(quiet.content[0]!.text, /New for you/u, 'a line was added with nothing waiting');
  assert.deepEqual(quiet._meta?.braindog?.pending, []);
  const before = quiet._meta?.braindog?.stamp;

  clock.advance(60_000);
  assert.ok((await api.instruct({ said: 'Merge wave 1, then stop', to_run: run }, owner)).ok);
  const told = await call(api, 'search', { q: 'kiln' });
  const last = told.content[0]!.text.split('\n').at(-1)!;
  assert.match(last, /^New for you: Teodor \(IN1\): "Merge wave 1, then stop"\. Take it: instructions \{take:"IN1"\}\.$/u);
  assert.ok(last.length <= 200);
  /* AND IN THE JSON COPY, which is what Claude Code hands its model in place of the text. */
  assert.deepEqual(told.structuredContent.new_for_you, [last]);
  assert.equal(quiet.structuredContent.new_for_you, undefined, 'the copy said something new with nothing waiting');
  assert.notEqual(told._meta?.braindog?.stamp, before, 'the stamp did not move');
  assert.deepEqual(told._meta?.braindog?.pending.map((p) => p.id), ['IN1']);

  /* SAID ONCE: the next answer carries it in _meta and adds no line. */
  const again = await call(api, 'list', { register: 'tasks', limit: 2 });
  assert.doesNotMatch(again.content[0]!.text, /New for you/u, 'the instruction was said twice');

  /* AND THE RECORD WAS TOLD IT WAS SEEN IN A TOOL ANSWER (never waited on, so asked after a turn). */
  await new Promise((r) => setTimeout(r, 20));
  const threads = await api.instructionList({}, owner);
  assert.ok(threads.ok, JSON.stringify(threads));
  const seen = (threads.value as { rows: { id: string; seen: { how: string }[] }[] }).rows.find((t) => t.id === 'IN1')?.seen ?? [];
  assert.deepEqual(seen.map((s) => s.how), ['tool']);
  sql.close();
});

test('A STOP IS SAID ON EVERY ANSWER WHILE IT STANDS, and not again beside the refusal that already says it', async () => {
  const { api, sql } = await record();
  const opened = await call(api, 'handoff', { doing: 'Tidying' });
  const run = String((opened.structuredContent as { spoken?: string }).spoken);
  assert.ok((await api.instruct({ said: 'Wrong repo', kind: 'stop', to: 'run', to_run: run }, owner)).ok);
  for (let i = 0; i < 2; i++) {
    const read = await call(api, 'list', { register: 'tasks', limit: 1 });
    assert.match(read.content[0]!.text.split('\n').at(-1)!, /^Teodor stopped this run in BrainDog \(IN1\): "Wrong repo"\./u);
    assert.deepEqual((read._meta?.braindog?.stop as { kind: string }).kind, 'stop');
  }
  const write = await call(api, 'create', { register: 'tasks', fields: { what: 'Should not land' } });
  assert.equal(write.isError, true);
  assert.equal(write.structuredContent.code, 'RUN_STOPPED');
  assert.equal(write.content[0]!.text.split('stopped this run').length, 2, `the stop was said twice: ${write.content[0]!.text}`);
  sql.close();
});

test('TWO LINES AND 200 CHARACTERS AT MOST, the words cut and the call kept whole', () => {
  const long = 'Rebuild every page of the specimen site against the new axis table and check each instance by eye. '.repeat(6);
  const w = {
    stamp: 's',
    stop: null,
    pending: [
      { id: 'IN7', kind: 'tell', said: long, at: '', to: 'run', by: 'Teodor', taken_by: null, line: '' },
      { id: 'IN8', kind: 'tell', said: 'And this', at: '', to: 'run', by: 'Teodor', taken_by: null, line: '' },
    ],
  };
  const out = piggyback(w, new Set());
  assert.equal(out.lines.length, 1);
  assert.ok(out.lines.join('\n').length <= 200, `${String(out.lines.join('\n').length)}: ${out.lines.join('\n')}`);
  assert.match(out.lines[0]!, /\.\.\."\. Take it: instructions \{take:"IN7"\}\. And 1 more: instructions\.$/u);
  assert.deepEqual(out.shown, ['IN7', 'IN8']);
  assert.deepEqual(piggyback(w, new Set(out.shown)).lines, []);
});
