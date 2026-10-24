/**
 * `propose` asks once (AGT-C07 job f): it takes a `cause`, a second proposal with an open question's cause is answered
 * "Already waiting as SG1." and files nothing, and `withdraw` takes back a question, refused for anybody but the run that
 * asked in the record's own sentence.
 *
 * Over the real record and kernel first, with two agent keys (`record/test/withdraw.test.ts` sets up the same two), so
 * the join and the refusal are the record's own; then over the stub for what the door alone says and does.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import { ONLY_THE_ASKER } from '../../record/src/methods/withdraw.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import { TOOLS, tools } from '../src/index.ts';
import { stub } from './stub.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const claude: CallContext = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'lanternfish' },
};
const codex: CallContext = {
  principal: { kind: 'token', id: 't_codex', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'x1', client: 'codex', host: 'mac', repo: 'lanternfish' },
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  assert.ok((await api.kernel.install([TASKS])).ok);
  for (const [id, label] of [['t_claude', 'Claude Code'], ['t_codex', 'Codex']] as const)
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, 'write', ?, '2026-10-01T00:00:00.000Z')", id, `h_${id}`, label);
  return { sql, mcp: tools(api) };
}

const ASK = { question: 'Add the launch checklist to Lanternfish?', body_kind: 'options', body: { options: [{ id: 'yes', label: 'Add it', because: 'It is due Friday.' }, { id: 'no', label: 'Leave it', because: 'Nothing is due.' }] }, cause: 'lanternfish-checklist' };

const open = (sql: ReturnType<typeof openSqlite>) => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")?.n;

test('A SECOND PROPOSAL WITH ONE CAUSE JOINS: one question, the second agent answered "Already waiting as" its handle', async () => {
  const { sql, mcp } = await record();
  const first = await mcp.answer('propose', ASK, claude);
  assert.ok(first.result.ok, first.text);
  const id = (first.result.value as { id: string }).id;
  assert.match(id, /^SG\d+$/u);
  assert.match(first.text, /^Asked /u);

  const second = await mcp.answer('propose', { ...ASK, question: 'Should the launch checklist go on Lanternfish?' }, codex);
  assert.ok(second.result.ok, second.text);
  assert.equal((second.result.value as { id: string; joined?: boolean }).id, id, 'the second answer names the question already waiting');
  assert.equal((second.result.value as { joined?: boolean }).joined, true);
  /* THE WAITING QUESTION'S WORDS, not the second agent's: the person reads the first, so the agent is told those. */
  assert.ok(second.text.startsWith(`Already waiting as ${id}. Add the launch checklist to Lanternfish?`), second.text);
  assert.doesNotMatch(second.text, /Should the launch checklist/u, 'the joined answer said the second agent\'s words, not the question waiting');
  assert.doesNotMatch(second.text, /^Asked /mu, 'a joined question is not said as asked');
  assert.equal(open(sql), 1, 'two proposals with one cause made two questions');
  sql.close();
});

test('WITHDRAW BY ANOTHER RUN IS REFUSED in the record\'s sentence, and the run that asked takes it back', async () => {
  const { sql, mcp } = await record();
  const id = (((await mcp.answer('propose', ASK, claude)).result as { value: { id: string } }).value).id;

  const theirs = await mcp.answer('propose', { withdraw: id }, codex);
  assert.equal(theirs.result.ok, false);
  assert.equal((theirs.result as { refusal: { code: string; fix: string } }).refusal.fix, ONLY_THE_ASKER);
  assert.match(theirs.text, /Only the run that asked can take it back\./u);
  assert.equal(open(sql), 1, 'a refused withdrawal closed the question');

  const mine = await mcp.answer('propose', { withdraw: id }, claude);
  assert.ok(mine.result.ok, mine.text);
  assert.equal(mine.text, `Taken back: Add the launch checklist to Lanternfish? (${id}). It is gone from Decide.\nReceipt: Nothing was written, so there is nothing to undo.`);
  assert.equal(open(sql), 0);

  /* AND THE CAUSE IS FREE AGAIN: the next proposal with it files a new question rather than joining a closed one. */
  const again = await mcp.answer('propose', ASK, claude);
  assert.ok(again.result.ok, again.text);
  assert.notEqual((again.result.value as { id: string }).id, id);
  assert.equal((again.result.value as { joined?: boolean }).joined, undefined);
  sql.close();
});

test('THE DOOR HANDS `cause` TO THE RECORD AS SENT, and says a joined answer by the handle the record gave', async () => {
  const handed: unknown[] = [];
  const { surface, calls } = stub({ propose: async (args: never) => (handed.push(args), { ok: true, value: { id: 'SG90', joined: true, widened: 2 } }) });
  const said = await tools(surface).answer('propose', ASK, { who: 'agent' });
  assert.ok(said.result.ok);
  assert.equal((handed[0] as { cause?: string }).cause, 'lanternfish-checklist');
  assert.ok(said.text.startsWith('Already waiting as SG90. Add the launch checklist to Lanternfish? This added 2 more to it.'), said.text);
  assert.match(said.text, /Nothing new was asked\./u);
  /* A JOINED QUESTION IS NOT NEW, so nothing about it is dry run. */
  assert.equal(calls.some((c) => c.method === 'dryRun'), false);
});

test('WITHDRAW GOES ALONE, and a surface without the record\'s `withdraw` answers NOT_IN_THIS_BUILD', async () => {
  let asked = 0;
  const { surface } = stub({ withdraw: async () => (asked++, { ok: true, value: { id: 'SG3', state: 'withdrawn' } }) });
  const beside = await tools(surface).answer('propose', { withdraw: 'SG3', question: 'Replace it?' }, { who: 'agent' });
  assert.equal(beside.result.ok, false);
  assert.equal((beside.result as { refusal: { code: string; at?: string } }).refusal.code, 'FIELD_UNKNOWN');
  assert.equal((beside.result as { refusal: { at?: string } }).refusal.at, 'question');
  assert.equal(asked, 0, 'a withdrawal beside a question reached the record');

  const taken = await tools(surface).answer('propose', { withdraw: 'SG3' }, { who: 'agent' });
  assert.ok(taken.result.ok);
  assert.equal(asked, 1);

  const older = await tools(stub().surface).answer('propose', { withdraw: 'SG3' }, { who: 'agent' });
  assert.equal((older.result as { refusal: { code: string } }).refusal.code, 'NOT_IN_THIS_BUILD');
});

test('THE TOOL TEACHES BOTH: `propose` takes cause and withdraw, and nothing about them is required', () => {
  const input = TOOLS.find((t) => t.name === 'propose')?.input as { properties: Record<string, { description?: string }>; required?: string[] };
  assert.equal(input.properties.cause?.description, 'A short key, so it is asked once.');
  assert.match(input.properties.withdraw?.description ?? '', /takes back/u);
  assert.equal(input.required, undefined, 'a withdrawal sends no question, so propose requires none');
});
