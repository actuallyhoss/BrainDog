/**
 * Answering on the person's word, over the wire on the seed (the owner's decision of 27 October): `instructions` takes
 * `answer` with `option` and `said`, and `create` and `update` take `said`, each passed to the record whole.
 *
 * WHAT IS HELD: the three tools list the arguments; a question he told the agent to answer is answered and said as on
 * his word; an empty `said` is refused at its field; his switch off refuses by its name; and a change the ladder would
 * have asked lands with his words. What no word reaches is held in `packages/record/test/on-word.test.ts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { handle, type Reply } from '../src/rpc.ts';
import { installSeed, NOW } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const MIN = 60_000;
const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' }, credentialed: true };

/** His key, from one session in Portage's repository. */
const agent = (client = 'c-one'): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await installSeed(api.kernel)).ok);
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level) VALUES ('p_seed', '*', 'owner')");
  /* A GRANT THE RECORD HOLDS, so the ladder reads its writes. */
  sql.exec("INSERT OR IGNORE INTO token (id, person_id, hash, scope, label, created_at) VALUES ('tok_1', 'p_seed', 'h-tok_1', 'write', 'Claude Code', '2026-09-01T00:00:00.000Z')");
  clock.advance(MIN);
  return { api, sql };
}

let n = 0;
type Result = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };
async function call(api: object, ctx: CallContext, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }, api as never, { ...ctx }, undefined, undefined, 'c')) as Reply;
  assert.ok('result' in reply, JSON.stringify(reply));
  return reply.result as Result;
}

type Api = Awaited<ReturnType<typeof record>>['api'];
const rowsAsked = (api: Api, what: string): string => {
  const filed = api.kernel.propose({ question: `Add ${what}?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ what }] } }, 'slash', 'rules');
  assert.ok(filed.ok);
  return filed.value.id;
};
const statusOf = (api: Api, id: string) => api.kernel.governanceRow('suggestion', id)?.status;

test('THE THREE TOOLS LIST WHAT AN ANSWER ON HIS WORD SENDS', async () => {
  const { api, sql } = await record();
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/list' }, api as never, { ...agent() })) as Reply;
  assert.ok('result' in reply);
  const tools = (reply.result as { tools: { name: string; description: string; inputSchema: { properties: Record<string, unknown> } }[] }).tools;
  const props = (name: string) => Object.keys(tools.find((t) => t.name === name)?.inputSchema.properties ?? {});
  for (const k of ['answer', 'option', 'said']) assert.ok(props('instructions').includes(k), `instructions lists no ${k}`);
  assert.ok(props('create').includes('said'));
  assert.ok(props('update').includes('said'));
  assert.match(tools.find((t) => t.name === 'instructions')!.description, /answer SG9 with option and said decides on their word/u);
  sql.close();
});

test('A QUESTION HE TOLD THE AGENT TO ANSWER IS ANSWERED ON HIS WORD; empty words and his switch off are refused', async () => {
  const { api, sql } = await record();
  const a = rowsAsked(api, 'Write the bounce report');

  const empty = await call(api, agent(), 'instructions', { answer: a, option: 'accept', said: ' ' });
  assert.equal(empty.isError, true);
  assert.equal(empty.structuredContent.code, 'REQUIRED_MISSING');
  assert.equal(empty.structuredContent.at, 'said');

  assert.ok((await api.setPref({ key: 'agents.answer_on_word', value: false }, owner)).ok);
  const off = await call(api, agent(), 'instructions', { answer: a, option: 'accept', said: 'Add it.' });
  assert.equal(off.isError, true);
  assert.match(off.content[0]!.text, /"Agents may answer when you tell them" is off in Settings > Agents/u);
  assert.equal(statusOf(api, a), 'open');
  assert.ok((await api.setPref({ key: 'agents.answer_on_word', value: null }, owner)).ok);

  const done = await call(api, agent(), 'instructions', { answer: a, option: 'accept', said: 'Yes, add the bounce report.' });
  assert.notEqual(done.isError, true, done.content[0]!.text);
  assert.match(done.content[0]!.text, new RegExp(`^Answered "[^"]+" \\(${a}\\) with yes, on Teodor's word\\. Undo is in BrainDog\\.`, 'u'));
  assert.deepEqual(done.structuredContent.answered, { question: a, option: 'accept' });
  assert.equal(statusOf(api, a), 'resolved');
  sql.close();
});

test('A CHANGE THE LADDER WOULD HAVE ASKED LANDS WITH HIS WORDS, and without them it still asks', async () => {
  const { api, sql } = await record();
  const made = api.kernel.create('tasks', { what: 'Ship the Kiln invoice' }, { actor: 'p_seed' });
  assert.ok(made.ok);
  const spoken = `tasks#${String(made.value.seq)}`;

  const asked = await call(api, agent(), 'update', { spoken, patch: { what: 'Ship the Kiln invoice today' } });
  assert.notEqual(asked.isError, true, asked.content[0]!.text);
  assert.equal(api.kernel.get(spoken)?.fields.what, 'Ship the Kiln invoice', 'without his word it asked');

  const open = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")?.n ?? 0;
  const waiting = open();
  const landed = await call(api, agent(), 'update', { spoken, patch: { what: 'Ship the Kiln invoice today' }, said: 'Rename it to say today.' });
  assert.notEqual(landed.isError, true, landed.content[0]!.text);
  assert.equal(api.kernel.get(spoken)?.fields.what, 'Ship the Kiln invoice today');
  /* AND THE QUESTION THAT ASKED IT IS TAKEN BACK (audit 10k, AK16): the change it asked for is made. */
  assert.equal(open(), waiting - 1);
  sql.close();
});
