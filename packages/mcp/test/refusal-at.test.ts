/**
 * Every refusal the door gives points at a field of the tool that was called, and none says `undefined`.
 *
 * WHAT AN AGENT WAS TOLD. On the owner's record `update {spoken: "tasks#346", patch: {}}` was turned into a proposal by
 * the ladder and refused `VALUE_MALFORMED at body.rows[0].patch`: the insides of a body `update` cannot send. And
 * `propose {question}` with no kind answered "undefined is not a kind of proposal"; on the seed `list {}` answered
 * "There is no register called undefined". An agent corrects a call by the field a refusal names and the sentence
 * beside it, so a foreign field sends it nowhere and a word of code tells it nothing.
 *
 * THE WALK. Every tool is called on the seed with nothing, with keys it does not take, and with each of its own fields
 * sent the wrong shape, as an agent and as a token held to one list. Every refusal that comes back is held to the
 * rule: its `at` begins at a field of that tool or a key the caller sent, its text names that same place, and nothing
 * in it says `undefined`. The ladder's proposal is not reached on the seed, so a surface that refuses the way it did
 * stands in for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import type { Result } from '@braindog/ports';

import { TOOLS, type McpSurface } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { atIn, unsaid } from '../src/words.ts';
import { installSeed } from '../../seed/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { stub } from './stub.ts';

type Said = { isError?: boolean; content: { text: string }[]; structuredContent: Record<string, unknown> };

let n = 0;
const call = async <C>(surface: McpSurface<C>, ctx: C, name: string, args: Record<string, unknown>, params: Record<string, unknown> = {}): Promise<Said> => {
  const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { ...params, name, arguments: args } }, surface, ctx)) as Reply;
  assert.ok('result' in reply, `${name} ${JSON.stringify(args)}: ${JSON.stringify(reply)}`);
  return reply.result as Said;
};
const takesOf = (name: string): string[] =>
  Object.keys((TOOLS.find((t) => t.name === name)?.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});
const rootOf = (at: string): string => at.split(/[.[]/u)[0]!;

/**
 * The calls in the walk that the record answers with an internal error today, found by this walk and not the door's to
 * fix. None now: `governance {limit: "many"}` and `propose {question: 42}` were the last, and the record refuses both
 * at the field (W2-A). Each one found comes onto this list until it is fixed, and off it again.
 */
const KNOWN_INTERNAL: readonly string[] = [];

/** The one rule, said once: where it points and what it says. */
function holds(name: string, sent: Record<string, unknown>, said: Said): void {
  const refusal = said.structuredContent;
  const text = said.content[0]!.text;
  const where = `${name} ${JSON.stringify(sent)}: ${text}`;
  assert.doesNotMatch(text, /\bundefined\b/u, `said undefined: ${where}`);
  assert.doesNotMatch(String(refusal.fix ?? ''), /\bundefined\b/u, `the fix says undefined: ${where}`);
  if (refusal.at === undefined) return;
  assert.equal(typeof refusal.at, 'string', where);
  const root = rootOf(refusal.at as string);
  assert.ok(takesOf(name).includes(root) || Object.hasOwn(sent, root), `${name} was refused at ${String(refusal.at)}, which it does not take: ${where}`);
  assert.match(text, new RegExp(` at ${(refusal.at as string).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}:`, 'u'), `the text points elsewhere: ${where}`);
}

/** What a field is sent as when it is sent the wrong shape: a word where a number or an object goes, and the other way. */
const wrongFor = (schema: unknown): unknown[] => {
  const type = typeof schema === 'object' && schema !== null ? (schema as { type?: unknown }).type : undefined;
  if (type === 'string') return [42, {}];
  if (type === 'integer' || type === 'number') return ['many', -1];
  if (type === 'boolean') return ['yes'];
  if (type === 'object') return ['tasks', []];
  if (type === 'array') return ['tasks', {}];
  return [42, 'tasks', {}];
};

test('EVERY REFUSAL IN THE WALK POINTS AT A FIELD OF THE CALLED TOOL, and none says undefined', async (t) => {
  /* The host's log is where a throw's error goes (`KNOWN_INTERNAL`), and it is not what this test reads. */
  t.mock.method(console, 'error', () => {});
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(Date.UTC(2026, 9, 21, 9)) });
  await installSeed(api.kernel);
  const agent = {
    principal: { kind: 'token', id: 't_agent', scope: 'write', person: 'p_seed', level: 'owner' },
    session: { agent: 'claude', client_id: 'refusal-at', cwd: '/Users/studio/Code/kiln-type' },
  } as CallContext;
  const held = { ...agent, principal: { ...agent.principal, id: 't_held' }, registers: ['tasks'] } as CallContext;
  const surface = api as unknown as McpSurface<CallContext>;

  let refusals = 0;
  const internal = new Set<string>();
  for (const tool of TOOLS) {
    const props = (tool.input as { properties?: Record<string, unknown> }).properties ?? {};
    const sends: Record<string, unknown>[] = [{}, { register: 'nope' }, { spoken: 'ZZ999' }, { limit: -1 }, { where: 'x' }, { nonsense: true }];
    for (const [field, schema] of Object.entries(props)) for (const wrong of wrongFor(schema)) sends.push({ [field]: wrong });
    for (const ctx of [agent, held])
      for (const sent of sends) {
        const reply = (await handle({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: tool.name, arguments: sent } }, surface, ctx)) as Reply;
        if ('error' in reply) {
          internal.add(`${tool.name} ${JSON.stringify(sent)}`);
          continue;
        }
        const said = reply.result as Said;
        if (said.isError !== true) continue;
        refusals += 1;
        holds(tool.name, sent, said);
      }
  }
  /* AND THE TWO MEASURED, BY NAME. */
  for (const [name, sent] of [
    ['propose', { question: 'Which glaze?' }],
    ['list', {}],
    ['create', { fields: { what: 'Fire the kiln' } }],
  ] as const) {
    const said = await call(surface, agent, name, sent);
    assert.equal(said.isError, true, `${name} answered`);
    holds(name, sent, said);
  }
  const kind = await call(surface, agent, 'propose', { question: 'Which glaze?' });
  assert.match(kind.content[0]!.text, /^Refused, ENUM_VALUE_UNKNOWN at body_kind: Say which kind of proposal this is, in body_kind\.$/mu);
  assert.match(kind.content[0]!.text, /^Allowed: options, /mu, 'the kinds are no longer listed');
  assert.match((await call(surface, agent, 'list', {})).content[0]!.text, /Say which register you mean\./u);
  /* NO CALL IN THE WALK THROWS BUT THESE (`KNOWN_INTERNAL`). */
  assert.deepEqual([...internal].sort(), [...KNOWN_INTERNAL].sort(), 'a call in the walk answered -32603');
  /* A WALK THAT MET NO REFUSAL PROVES NOTHING. */
  assert.ok(refusals > 150, `the walk met ${String(refusals)} refusals`);
  sql.close();
});

test('A WRITE THE LADDER TURNED INTO A PROPOSAL IS REFUSED AT update\'s OWN FIELD, and propose keeps its own body', async () => {
  const proposal = (at: string) => async (): Promise<Result<unknown>> => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'A patch changes at least one field.', at } });
  const { surface } = stub({ update: proposal('body.rows[0].patch'), propose: proposal('body.rows[0].patch') });

  const update = await call(surface, { who: 'agent' }, 'update', { spoken: 'tasks#346', patch: {} });
  assert.equal(update.structuredContent.at, 'patch');
  assert.match(update.content[0]!.text, /^Refused, VALUE_MALFORMED at patch: A patch changes at least one field\.$/mu);
  assert.doesNotMatch(JSON.stringify(update), /body\.rows/u);

  const sent = { question: 'Apply this?', body_kind: 'rowset', body: { rows: [{ at: 'tasks#346', version: 1, patch: {} }] } };
  const propose = await call(surface, { who: 'agent' }, 'propose', sent);
  assert.equal(propose.structuredContent.at, 'body.rows[0].patch', 'a field propose does take was renamed');

  /* AND IN THE FULL ANSWER, whose text is the JSON. */
  const full = await call(surface, { who: 'agent' }, 'update', { spoken: 'tasks#346', patch: {}, format: 'full' });
  assert.equal((JSON.parse(full.content[0]!.text) as { at?: string }).at, 'patch');

  /* A PLACE NONE OF THE TOOL'S FIELDS REACHES IS LEFT OUT, and the sentence still says what to do. */
  const { surface: nowhere } = stub({ update: proposal('body.rows[0]') });
  const lost = await call(nowhere, { who: 'agent' }, 'update', { spoken: 'tasks#346', patch: { what: 'x' } });
  assert.equal(lost.structuredContent.at, undefined);
  assert.match(lost.content[0]!.text, /^Refused, VALUE_MALFORMED: A patch changes at least one field\.$/mu);
});

test('A RETRY THAT ANSWERS ITS OWN QUESTION IS REFUSED AT the key it sent, wherever it sent it', async () => {
  const { surface, calls } = stub();
  for (const [args, params] of [
    [{ question: 'Which?', inputResponses: {} }, {}],
    [{ question: 'Which?' }, { inputResponses: {} }],
  ] as const) {
    const said = await call(surface, { who: 'agent' }, 'propose', args, params);
    assert.equal(said.structuredContent.at, 'inputResponses');
    holds('propose', { ...params, ...args }, said);
  }
  assert.equal(calls.filter((c) => c.method === 'propose').length, 0);
});

test('atIn TAKES THE PATH FROM THE FIRST PART THE TOOL TAKES, and unsaid writes no word of code', () => {
  const update = ['spoken', 'patch', 'version', 'note', 'op_id'];
  assert.equal(atIn('body.rows[0].patch', update, {}), 'patch');
  assert.equal(atIn('body.rows[2].patch.what', update, {}), 'patch.what');
  assert.equal(atIn('patch', update, {}), 'patch');
  assert.equal(atIn('body.rows[0]', update, {}), undefined);
  assert.equal(atIn('body.rows[0].patch', ['question', 'body_kind', 'body'], {}), 'body.rows[0].patch');
  assert.equal(atIn('limit', ['register'], { limit: 3 }), 'limit', 'a key the caller sent is a place it can go');
  assert.equal(atIn(undefined, update, {}), undefined);
  assert.equal(atIn('', update, {}), undefined);

  assert.equal(unsaid('undefined is not a kind of proposal.', 'body_kind'), 'Say which kind of proposal this is, in body_kind.');
  assert.equal(unsaid('null is not a kind of proposal. Read the grammar.', undefined), 'Say which kind of proposal this is. Read the grammar.');
  assert.equal(unsaid('There is no register called undefined.', 'register'), 'Say which register you mean.');
  assert.equal(unsaid('There is no register called undefined.', undefined), 'Say which register you mean.');
  assert.equal(unsaid('There is no list called undefined.', 'body.register'), 'Say which list you mean, in body.register.');
  assert.equal(unsaid('There is no register called nope.', 'register'), 'There is no register called nope.');
  assert.equal(unsaid('undefined is not a live row of tasks.', 'at'), 'Say which live row of tasks this is, in at.');
  assert.equal(unsaid('The step after undefined never ran.', undefined), 'The step after nothing never ran.');
  assert.equal(unsaid('Send {"due": null} to clear it.', 'patch'), 'Send {"due": null} to clear it.', 'a null in an example was taken out');
});
