/**
 * `handoff` takes and drops a step another run left (AGT-C05 job f), over the wire as an agent calls it.
 *
 * TAKE PICKS IT UP, AND THE SECOND OF TWO SESSIONS RACING FOR ONE STEP IS TOLD WHO HAS IT, in the record's own sentence
 * and not a code. DROP CLOSES ONE THAT IS NO LONGER TRUE, and asks why in words. Each is said as what now happens to the
 * step, naming the run that left it by its app with its handle beside it, never an id alone where a name is known.
 *
 * AND ITS STATES ARE THE KERNEL'S. The tool list is also the command's, which does not load the record, so the list is
 * written in `index.ts` and held to `HANDOFF_STATES` by type there and at run time here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HANDOFF_STATES, createRecordApi, type Attached, type CallContext } from '@braindog/record';

import { TOOLS } from '../src/index.ts';
import { handle, type Reply } from '../src/rpc.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const valueOf = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** A record with its owner, and a key for each agent, as the device flow mints them. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  valueOf(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const agent = async (name: string): Promise<CallContext> => {
    const key = valueOf<{ id: string }>(await api.createToken({ scope: 'write', label: name }, owner)).id;
    const ctx: CallContext = {
      principal: { kind: 'token', id: key, scope: 'write', person: 'p_1', level: 'owner' },
      session: { client_id: `c-${name}`, agent: 'claude', host: 'studio-mac', repo: 'kiln' },
    };
    valueOf<Attached>(await api.attach({ source: 'startup', client_id: `c-${name}` }, ctx));
    return ctx;
  };
  /** One `handoff` call as an agent makes it: the text it reads, and whether it was refused. */
  const call = async (args: Record<string, unknown>, ctx: CallContext) => {
    const reply = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'handoff', arguments: args } }, api, ctx)) as Reply;
    assert.ok('result' in reply, JSON.stringify(reply));
    const result = reply.result as { content: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown> };
    return { text: result.content.map((c) => c.text).join('\n'), refused: result.isError === true, value: result.structuredContent ?? {} };
  };
  /** The run a context's step names, read the way an agent reads it. */
  const leftBy = async (ctx: CallContext) => valueOf<{ session: { spoken: string } }>(await api.context({}, ctx)).session.spoken;
  return { sql, api, agent, call, leftBy };
}

test('THE TOOL TAKES take, drop AND why, and its states are the kernel\'s HANDOFF_STATES', () => {
  const tool = TOOLS.find((t) => t.name === 'handoff')!;
  const props = (tool.input as { properties: Record<string, { enum?: string[] }> }).properties;
  for (const key of ['take', 'drop', 'why']) assert.ok(props[key], `handoff does not take ${key}`);
  assert.deepEqual(props.state?.enum, [...HANDOFF_STATES]);
  assert.match(tool.description, /take or drop/u);
});

test('TAKE: the step is yours, said with who left it; a second session racing for it is told who took it, in words', async () => {
  const { sql, agent, call, leftBy } = await record();
  const leaver = await agent('leaver');
  const left = await leftBy(leaver);
  assert.equal((await call({ next: 'Kern the lowercase pairs', state: 'handoff' }, leaver)).refused, false);

  const taker = await agent('taker');
  const took = await call({ take: left }, taker);
  assert.equal(took.refused, false, took.text);
  const tookSaid = `You took the step Claude Code (${left}) left: Kern the lowercase pairs. It is yours now; call handoff with your own next step before you stop.`;
  /* A WRITE ENDS IN A RECEIPT; a step has no batch to undo, so it says the call that changes it. The line above it is not said twice. */
  assert.equal(took.text.split('\n')[0], tookSaid);
  assert.equal(took.text.split('\n')[1], 'Receipt: To change it, call handoff again.');
  assert.equal(took.value.left, left);

  const late = await agent('late');
  const race = await call({ take: left }, late);
  assert.equal(race.refused, true, 'a step already taken was taken twice');
  assert.match(race.text, /already took this/u);
  assert.doesNotMatch(race.text, /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, 'the refusal carried an id');
  sql.close();
});

test('DROP: a step no longer true is closed with a reason, and one with none is asked for it', async () => {
  const { sql, agent, call, leftBy } = await record();
  const other = await agent('other');
  const gone = await leftBy(other);
  assert.equal((await call({ next: 'Ship the specimen page', state: 'handoff' }, other)).refused, false);

  const closer = await agent('closer');
  const bare = await call({ drop: gone }, closer);
  assert.equal(bare.refused, true, 'a step was dropped with no reason');
  assert.match(bare.text, /why this step is dropped/u);

  const dropped = await call({ drop: gone, why: 'The page shipped yesterday.' }, closer);
  assert.equal(dropped.refused, false, dropped.text);
  assert.equal(dropped.text.split('\n')[0], `Dropped the step ${gone} left: Ship the specimen page. Nobody is handed it now.`);
  assert.equal(dropped.text.split('\n')[1], 'Receipt: To change it, call handoff again.');
  assert.doesNotMatch(dropped.text, /—/u, 'an em dash in what an agent reads');
  const row = sql.one<{ state: string; closed_as: string }>(
    "SELECT state, json_extract(fields, '$.closed_as') AS closed_as FROM entry WHERE register = 'session' AND seq = ?",
    Number(gone.slice(1)),
  );
  assert.deepEqual({ ...row }, { state: 'done', closed_as: 'dropped' });
  sql.close();
});

test('A RUN THAT IS NOT THERE is refused in words, for take and for drop, and nothing is taken or closed', async () => {
  const { sql, agent, call } = await record();
  const caller = await agent('caller');
  for (const args of [{ take: 'S99' }, { drop: 'S99', why: 'It shipped.' }]) {
    const out = await call(args, caller);
    assert.equal(out.refused, true, `${JSON.stringify(args)} was not refused: ${out.text}`);
    assert.match(out.text, new RegExp(`at ${Object.keys(args)[0]!}: There is no run called S99 here\\. Name one of the open steps braindog:handoffs lists\\.`, 'u'));
    assert.doesNotMatch(out.text, /\b[0-9A-HJKMNP-TV-Z]{26}\b|—/u, `the refusal carried an id or an em dash: ${out.text}`);
  }
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'session' AND state = 'done'")?.n, 0);
  sql.close();
});
