/**
 * The guard reads what he set and what he said (agents and MCP plan §2.4, §5.1, §8.2; W2-A).
 *
 * WHAT IS HELD: a run he stopped or paused is refused every change `RUN_STOPPED` or `RUN_PAUSED` in his words, for
 * every client, and still answers, hands off, logs on itself and ends; its helpers obey it; a resume lets it write
 * again. A settings row narrows and never widens: Read refuses changes, Suggest asks every one, a row's lists and
 * projects ask what is outside them, and a record with no stored row narrows nothing. Only he edits a row, in a
 * browser; `whoami` reads it. `handoff { task }` and `{ done }` move a task in one call. And the two refusals W1-B's walk
 * found as crashes are refused at their field.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_seed', level: 'owner' } };

const agent = (client: string, session: CallContext['session'] = {}): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_seed', level: 'owner' },
  session: { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: client, ...session },
});

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  sql.exec("INSERT OR REPLACE INTO person (id, email, name) VALUES ('p_seed', 'teo@vance-studio.example', 'Teodor')");
  clock.advance(MIN);
  return { api, sql, clock };
}

type Api = Awaited<ReturnType<typeof record>>['api'];
const opened = async (api: Api, ctx: CallContext): Promise<string> => value<{ spoken: string }>(await api.attach({ source: 'startup', doing: 'Working' }, ctx)).spoken;
const task = (what: string) => ({ register: 'tasks', fields: { what } });
const asked = (r: unknown): { why: string } => {
  const v = value<{ asked?: { why: string } }>(r);
  assert.ok(v.asked, `it was written, not asked: ${JSON.stringify(v).slice(0, 200)}`);
  return v.asked;
};

test('A STOPPED RUN IS REFUSED EVERY CHANGE IN HIS WORDS, and still answers, hands off, logs on itself and ends', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-stop');
  const run = await opened(api, ctx);
  value(await api.create(task('Before the stop'), ctx));
  value(await api.instruct({ said: 'Stop and wait for me', kind: 'stop', to_run: run }, owner));

  const no = refusal(await api.create(task('After the stop'), ctx));
  assert.equal(no.code, 'RUN_STOPPED');
  assert.equal(no.fix, 'Teodor stopped this run in BrainDog (IN1): "Stop and wait for me". Reply with instructions, then end.');
  assert.equal(refusal(await api.propose({ question: 'May I?', body_kind: 'options', body: { options: [{ id: 'y', label: 'Yes', because: 'x' }, { id: 'n', label: 'No', because: 'y' }] } }, ctx)).code, 'RUN_STOPPED');
  /* A READ IS NOT A CHANGE. */
  value(await api.list({ register: 'tasks' }, ctx));
  /* WHAT IT IS ASKED TO DO STILL REACHES THE RECORD. */
  const mine = value<{ stop: { kind: string; id: string } | null; lines: string[] }>(await api.instructionsMine({}, ctx));
  assert.deepEqual(mine.stop && [mine.stop.kind, mine.stop.id], ['stop', 'IN1']);
  assert.match(mine.lines[0]!, /^Teodor stopped this run in BrainDog \(IN1\)/u);
  value(await api.instructionsMine({ reply: 'IN1', said: 'Stopped after the first task.' }, ctx));
  value(await api.handoff({ next: 'Pick up the second task once he resumes' }, ctx));
  const seq = Number(run.slice(1));
  value(await api.log({ register: 'session', seq, note: 'Stopped as asked.' }, ctx));
  value(await api.end({}, ctx));
  sql.close();
});

test('A PAUSE HOLDS UNTIL A RESUME, and a helper obeys its lead', async () => {
  const { api, sql } = await record();
  const lead = agent('c-lead');
  const run = await opened(api, lead);
  const helper = agent('c-helper', { parent: run });
  await opened(api, helper);
  value(await api.instruct({ said: 'Hold on', kind: 'pause', to_run: run }, owner));
  const held = refusal(await api.create(task('While paused'), lead));
  assert.equal(held.code, 'RUN_PAUSED');
  assert.match(held.fix, /^Teodor paused this run in BrainDog \(IN1\): "Hold on"\. Wait until it is resumed\.$/u);
  assert.equal(refusal(await api.create(task('A helper writing'), helper)).code, 'RUN_PAUSED');
  value(await api.instruct({ said: 'Go on', kind: 'resume', to_run: run }, owner));
  value(await api.create(task('After the resume'), lead));
  value(await api.create(task('The helper again'), helper));
  sql.close();
});

test('SETTINGS ONLY NARROW: Read refuses, Suggest asks, lists and projects ask what is outside them', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-settings');
  await opened(api, ctx);
  /* NO STORED ROW NARROWS NOTHING, so his agents keep what their tokens give them until the data step writes rows. */
  value(await api.create(task('Written before any row'), ctx));

  const row = value<{ id: string; ceiling: string; effective: { says: string; applies: string } }>(
    await api.setAgentProfile({ name: 'Claude Code', match: { kind: 'claude' }, ceiling: 'read' }, owner),
  );
  assert.equal(row.effective.applies, 'name');
  assert.equal(row.effective.says, 'Reads only; every change is refused.');
  const read = refusal(await api.create(task('On a Read row'), ctx));
  assert.equal(read.code, 'FORBIDDEN');
  assert.match(read.fix, /^Settings › Agents › Claude Code lets this agent read and change nothing\./u);
  value(await api.list({ register: 'tasks' }, ctx));

  value(await api.setAgentProfile({ id: row.id, ceiling: 'propose' }, owner));
  assert.match(asked(await api.create(task('On a Suggest row'), ctx)).why, /lets this agent suggest only/u);

  value(await api.setAgentProfile({ id: row.id, ceiling: 'write', lists_write: ['learnings'] }, owner));
  assert.match(asked(await api.create(task('Outside its lists'), ctx)).why, /lets this agent change Learnings only, so a change to Tasks is asked/u);

  const portage = sql.one<{ id: string; seq: number }>("SELECT id, seq FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Portage'")!;
  const kiln = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things' AND json_extract(fields, '$.name') = 'Kiln'")!;
  value(await api.setAgentProfile({ id: row.id, lists_write: null, projects: [`things#${String(portage.seq)}`] }, owner));
  const inside = value<{ asked?: unknown; seq?: number }>(await api.create({ register: 'tasks', fields: { what: 'On Portage', thing: portage.id } }, ctx));
  assert.equal(inside.asked, undefined);
  assert.match(asked(await api.create({ register: 'tasks', fields: { what: 'On Kiln', thing: kiln.id } }, ctx)).why, /so a change outside them is asked/u);

  /* WHOAMI READS IT, AND NO TOKEN WRITES IT. */
  const me = value<{ effective: { may: string; projects: string[] | null; profile: { name: string } | null } }>(await api.whoami(ctx));
  assert.deepEqual([me.effective.may, me.effective.projects, me.effective.profile?.name], ['write', [`things#${String(portage.seq)}`], 'Claude Code']);
  /* THE STOP SWITCH AND THE CHANNEL, which the CLI's hooks and bridge read: on and off by default, then as he set them. */
  const enforce = async () => value<{ effective: { enforce: { hooks: boolean; channel: boolean } } }>(await api.whoami(ctx)).effective.enforce;
  assert.deepEqual(await enforce(), { hooks: true, channel: false });
  value(await api.setAgentProfile({ id: row.id, enforce: { hooks: false, channel: true } }, owner));
  assert.deepEqual(await enforce(), { hooks: false, channel: true });
  assert.equal(refusal(await api.setAgentProfile({ id: row.id, ceiling: 'write' }, ctx)).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(await api.agentProfiles({}, ctx)).code, 'FORBIDDEN');
  const rows = value<{ id: string }[]>(await api.agentProfiles({}, owner));
  assert.deepEqual(rows.map((r) => r.id).slice(0, 1), ['default']);
  assert.ok(rows.some((r) => r.id === row.id));
  assert.equal(refusal(await api.setAgentProfile({ name: 'Bound', match: { token: 'tok_nobody' } }, owner)).at, 'match.token');
  sql.close();
});

test('A SUGGEST ROW KEEPS A ROWSET A QUESTION, whatever rung the agent earned', async () => {
  const { api, sql } = await record();
  /* A KEY THE RECORD HOLDS, ON THE TELL RUNG FOR ADDING TASKS, so the ladder would land its rowset. */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('tok_1', 'p_seed', 'h', 'write', 'Claude Code', '2026-10-01T00:00:00.000Z')");
  sql.exec("INSERT OR REPLACE INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('tok_1', 'tasks:add', 'tell', 0, '2026-10-01T00:00:00.000Z')");
  const ctx = agent('c-rowset');
  await opened(api, ctx);
  const rowset = (what: string) => ({ question: `Add ${what}?`, body_kind: 'rowset' as const, body: { register: 'tasks', rows: [{ what }] } });
  assert.equal(value<{ landed?: boolean }>(await api.propose(rowset('Landed by the rung'), ctx)).landed, true, 'the rung lands it with no row');
  value(await api.setAgentProfile({ name: 'Claude Code', match: { kind: 'claude' }, ceiling: 'propose' }, owner));
  assert.notEqual(value<{ landed?: boolean }>(await api.propose(rowset('Asked under Suggest'), ctx)).landed, true);
  sql.close();
});

test('A TASK IN HAND IN ONE CALL: handoff task sets it doing and in hand, and handoff done closes it with the note', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-hand');
  const run = await opened(api, ctx);
  const made = value<{ seq: number }>(await api.create(task('Ship the report'), owner));
  const ref = `tasks#${String(made.seq)}`;

  const took = value<{ fields: Record<string, unknown>; task: { spoken: string; state: string | null } }>(await api.handoff({ task: ref }, ctx));
  assert.deepEqual([took.task.spoken, took.task.state], [ref, 'doing']);
  assert.equal(took.fields.task, ref);
  assert.equal(took.fields.doing, 'Ship the report');

  const done = value<{ fields: Record<string, unknown>; task: { state: string | null } }>(await api.handoff({ done: ref, note: 'Sent to Ada.', next: 'Start the next report' }, ctx));
  assert.equal(done.task.state, 'done');
  assert.equal(done.fields.task, undefined);
  assert.equal(done.fields.next, 'Start the next report');
  const note = sql.one<{ note: string }>("SELECT note FROM event WHERE target = (SELECT 'entry:' || id FROM entry WHERE register = 'tasks' AND seq = ?) AND note IS NOT NULL ORDER BY rowid DESC LIMIT 1", made.seq);
  assert.equal(note?.note, 'Sent to Ada.');

  assert.equal(refusal(await api.handoff({ task: ref, done: ref }, ctx)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await api.handoff({ task: 'tasks#99999' }, ctx)).at, 'task');
  assert.equal(refusal(await api.handoff({ task: ref, session: run }, owner)).code, 'FORBIDDEN');
  sql.close();
});

test('THE TWO CRASHES W1-B FOUND ARE REFUSED AT THEIR FIELD', async () => {
  const { api, sql } = await record();
  const ctx = agent('c-walk');
  assert.equal(refusal(await api.governance({ limit: 'many' } as never, ctx)).at, 'limit');
  assert.equal(refusal(await api.propose({ question: 42 } as never, ctx)).at, 'question');
  assert.equal(refusal(await api.propose({ question: {} } as never, ctx)).at, 'question');
  sql.close();
});
