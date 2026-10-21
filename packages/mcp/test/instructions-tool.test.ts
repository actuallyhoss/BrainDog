/**
 * The `instructions` tool, the folded tools and the door's new refusals, over the wire on the seed (agents and MCP plan
 * §2, §6.1 to §6.6; W2-C).
 *
 * WHAT IS HELD: an agent reads what he told it in his voice, takes it and answers it, and the answer carries what the
 * run changed while it held it; of two runs the second is told who has it, at the tool's own field; `schema` and
 * `history` are listed no more and answer by their old names, and `record_index {register}` and `get {history}` are
 * where they live now; `get` takes a name, and a name two things are called is refused with both; an empty patch is
 * refused before the ladder; a tool he switched off is not listed and is refused; a Read agent lists no writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { FOLDED, FOLDED_UNTIL, TOOLS } from '../src/index.ts';
import { installSeed, NOW } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const MIN = 60_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

/** A token's call from one session in Portage's repository, which the seed places on Portage. */
const agent = (client: string, token = 'tok_1'): CallContext => ({
  principal: { kind: 'token', id: token, scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await installSeed(api.kernel)).ok);
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  clock.advance(MIN);
  return { api, sql, clock };
}

let n = 0;
type Result = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown>; _meta?: Record<string, unknown> };
async function call(api: object, ctx: CallContext, name: string, args: Record<string, unknown> = {}, caller = 'c'): Promise<Result> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api as never, { ...ctx }, undefined, undefined, caller)) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result as Result;
}
async function listed(api: object, ctx: CallContext): Promise<string[]> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/list' }, api as never, { ...ctx })) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return (reply.result as { tools: { name: string }[] }).tools.map((t) => t.name);
}

test('READ, TAKE, REPLY: what he said in his voice, the one in hand, and the answer with what the run changed', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-one');
  const run = (await api.attach({ source: 'startup', doing: 'Working' }, ctx)) as { ok: true; value: { spoken: string } };
  const told = await api.instruct({ said: 'Tidy the Portage tasks, then stop', to: 'agent', to_agent: 'claude', project: 'Portage' }, owner);
  assert.ok(told.ok, JSON.stringify(told));

  const read = await call(api, ctx, 'instructions');
  assert.notEqual(read.isError, true, read.content[0]!.text);
  assert.match(read.content[0]!.text, /^Teodor said in BrainDog \(IN1\): "Tidy the Portage tasks, then stop"\. Take it with instructions take IN1\.$/mu);
  assert.deepEqual((read.structuredContent.pending as { id: string }[]).map((p) => p.id), ['IN1']);
  /* WHAT WAITS RIDES ON THE ANSWER for a client to keep, its stamp among it. */
  const meta = read._meta?.braindog as { stamp: string; pending: { id: string; line: string }[]; stop: unknown };
  assert.equal(typeof meta.stamp, 'string');
  assert.deepEqual(meta.pending.map((p) => p.id), ['IN1']);
  assert.equal(meta.stop, null);

  const took = await call(api, ctx, 'instructions', { take: 'IN1' });
  assert.notEqual(took.isError, true, took.content[0]!.text);
  assert.match(took.content[0]!.text, /^You have IN1: "Tidy the Portage tasks, then stop"\. When it is done: instructions \{reply:"IN1"/u);

  /* A SECOND RUN IS TOLD WHO HAS IT, AT THE FIELD IT SENT. */
  const other = await call(api, agent('c-two', 'tok_2'), 'instructions', { take: 'IN1' });
  assert.equal(other.isError, true);
  assert.equal(other.structuredContent.at, 'take');
  assert.match(String(other.structuredContent.fix), new RegExp(`^${run.value.spoken} has it`, 'u'));

  const made = await call(api, ctx, 'create', { register: 'tasks', fields: { what: 'Merge the Portage duplicates', thing: 'things#3' } });
  assert.notEqual(made.isError, true, made.content[0]!.text);
  const replied = await call(api, ctx, 'instructions', { reply: 'IN1', said: 'Merged two duplicates.', state: 'done' });
  assert.notEqual(replied.isError, true, replied.content[0]!.text);
  assert.match(replied.content[0]!.text, /^Answered IN1: done\. 1 change in 1 batch while you held it: Merge the Portage duplicates \(tasks#\d+\)\. /u);
  assert.equal((replied.structuredContent.instruction as { state: string }).state, 'done');
  sql.close();
});

test('FOLDED, NOT GONE: schema and history are listed no more, answer by their old names, and live in record_index and get', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-fold');
  const names = await listed(api, ctx);
  for (const f of FOLDED) assert.ok(!names.includes(f.name), `${f.name} is still listed`);
  assert.ok(names.includes('instructions'));
  assert.ok(FOLDED_UNTIL > '2026-12-19', FOLDED_UNTIL);

  const fields = await call(api, ctx, 'record_index', { register: 'tasks' });
  const old = await call(api, ctx, 'schema', { register: 'tasks' });
  assert.notEqual(fields.isError, true, fields.content[0]!.text);
  assert.deepEqual(fields.structuredContent, old.structuredContent);

  const both = await call(api, ctx, 'get', { spoken: 'tasks#1', history: true });
  assert.notEqual(both.isError, true, both.content[0]!.text);
  const lines = await call(api, ctx, 'history', { spoken: 'tasks#1' });
  assert.deepEqual(both.structuredContent.history, lines.structuredContent.rows);
  assert.ok(both.content[0]!.text.includes(lines.content[0]!.text.split('\n')[0]!), both.content[0]!.text);
  sql.close();
});

test('GET BY A NAME: the one thing called that answers as its handle does, and two are refused with each by its handle', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-name');
  const byHandle = await call(api, ctx, 'get', { spoken: 'things#1' });
  const byName = await call(api, ctx, 'get', { spoken: 'Kiln' });
  assert.notEqual(byName.isError, true, byName.content[0]!.text);
  assert.equal(byName.structuredContent.spoken, byHandle.structuredContent.spoken);

  assert.ok(api.kernel.create('tasks', { what: 'Kiln' }, { actor: 'p_seed' }).ok);
  const two = await call(api, ctx, 'get', { spoken: 'kiln' });
  assert.equal(two.isError, true);
  assert.equal(two.structuredContent.code, 'NAME_AMBIGUOUS');
  assert.equal(two.structuredContent.at, 'spoken');
  assert.ok((two.structuredContent.allowed as string[]).length === 2, JSON.stringify(two.structuredContent));
  assert.match(String(two.structuredContent.try), /^get \{"spoken":"/u);

  const none = await call(api, ctx, 'get', { spoken: 'Nothing Is Called This' });
  assert.equal(none.isError, true);
  assert.match(String(none.structuredContent.fix), /Nothing you can read is called Nothing Is Called This/u);
  sql.close();
});

test('AN EMPTY PATCH IS REFUSED BEFORE THE LADDER, and a note with it is sent to log', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-patch');
  const empty = await call(api, ctx, 'update', { spoken: 'tasks#1', patch: {} });
  assert.equal(empty.structuredContent.code, 'PATCH_EMPTY');
  assert.equal(empty.structuredContent.at, 'patch');
  const noted = await call(api, ctx, 'update', { spoken: 'tasks#1', patch: {}, note: 'Looked at it.' });
  assert.equal(noted.structuredContent.try, 'log {"spoken":"tasks#1","note":"Looked at it."}');
  sql.close();
});

test('HIS SETTINGS CUT THE LIST: a tool he switched off is not listed and is refused TOOL_OFF, and a Read agent lists no writes', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-off');
  const set = await api.setAgentProfile({ name: 'Claude Code', match: { kind: 'claude' }, ceiling: 'write', tools: { search: false } } as never, owner);
  assert.ok(set.ok, JSON.stringify(set));
  const names = await listed(api, ctx);
  assert.ok(!names.includes('search'), names.join(' '));
  assert.ok(names.includes('get'));
  const off = await call(api, ctx, 'search', { q: 'kiln' }, 'c-off');
  assert.equal(off.isError, true);
  assert.equal(off.structuredContent.code, 'TOOL_OFF');
  assert.match(String(off.structuredContent.fix), /^Settings > Agents > Claude Code has search off for you/u);

  const row = (set as { ok: true; value: { id: string } }).value;
  assert.ok((await api.setAgentProfile({ id: row.id, ceiling: 'read', tools: {} } as never, owner)).ok);
  const reads = await listed(api, ctx);
  assert.deepEqual(reads, TOOLS.filter((t) => !t.writes).map((t) => t.name));
  sql.close();
});
