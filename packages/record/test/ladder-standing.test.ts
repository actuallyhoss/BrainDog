/**
 * Where every agent stands on the ladder, read back (ENG-A12, DIRECTION §37 "a ladder per agent and kind"): `trust`
 * answers each connected agent by its name with the kinds it has a rung for, in words, the rung, since when, whether the
 * thirty-day lift set it, and when and why it was taken back. The ladder ran on every write and nothing could read it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const HOUR = 3_600_000;

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], default: 'open' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const agent = (): CallContext => ({
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'braindog' },
});

type Standing = {
  agents: { agent: string; connected: string | null; kinds: { kind: string; rung: string; since: string; lifted: boolean; dropped: { at: string; why: string | null } | null }[] }[];
};

/** A record whose clock the test moves, with three grants: one at work, one connected and unused, one revoked. */
async function record() {
  const sql = openSqlite();
  const clock = { at: NOW, now: () => clock.at };
  const api = await createRecordApi({ sql, clock: clock as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  const token = (id: string, label: string, revoked: string | null) =>
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at, revoked_at) VALUES (?, 'p_1', ?, 'write', ?, '2026-10-01T00:00:00.000Z', ?)", id, `h_${id}`, label, revoked);
  token('t_claude', 'Claude Code', null);
  token('t_cursor', 'Cursor', null);
  token('t_gone', 'An old script', '2026-10-02T00:00:00.000Z');
  return { api, sql, clock };
}

/** The rungs the ladder's arrival left a write token (`seedLadder`), as it writes them: at Do and tell, since that run. */
const lift = (sql: NodeSql, kind: string): string => {
  const at = sql.one<{ applied_at: string }>('SELECT applied_at FROM migration WHERE version = 25')!.applied_at;
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_claude', ?, 'tell', 0, ?)", kind, at);
  return at;
};

const open = (sql: NodeSql) => sql.all<{ id: string; opened_by: string; body_kind: string }>("SELECT id, opened_by, body_kind FROM suggestion WHERE status = 'open' ORDER BY rowid");

test('TRUST ANSWERS EACH AGENT BY NAME WITH ITS KINDS IN WORDS: one climbed, one lifted, one taken back by an undo', async () => {
  const { api, sql, clock } = await record();
  const arrived = lift(sql, 'tasks:move:done');
  lift(sql, 'tasks:edit');

  /* TEN KEPT AND A YES: adding tasks climbs to Do and tell, an hour after the ladder arrived. */
  clock.at = NOW + HOUR;
  for (let i = 0; i < 10; i += 1) {
    value<Asked>(await api.create({ register: 'tasks', fields: { name: `Task ${i}` } }, agent()));
    value(await api.decide({ id: open(sql).find((q) => q.body_kind === 'rowset')!.id, decide: { option: 'accept', reason: 'fine' } }, owner));
  }
  value(await api.decide({ id: open(sql).find((q) => q.opened_by === 'rule:ladder')!.id, decide: { option: 'yes', reason: '' } }, owner));

  /* A CHANGE ON A LIFTED KIND IS WRITTEN, AND THE OWNER UNDOES IT: that kind goes back to Ask. */
  clock.at = NOW + 2 * HOUR;
  assert.equal(value<Entry>(await api.update({ register: 'tasks', seq: 1, patch: { state: 'done' } }, agent())).fields.state, 'done');
  clock.at = NOW + 3 * HOUR;
  const plan = value<{ hash: string; steps: unknown[] }>(await api.undoRun({ run: 'S1', dry: true }, owner));
  assert.equal(plan.steps.length, 1, 'the run made one change of its own');
  value(await api.undoRun({ run: 'S1', hash: plan.hash }, owner));

  const said = value<Standing>(await api.trust(undefined, owner));
  assert.deepEqual(
    said.agents.map((a) => a.agent),
    ['Claude Code', 'Cursor'],
    'every connected agent by its name, and a revoked one that never climbed is not listed',
  );
  assert.doesNotMatch(JSON.stringify(said), /t_claude|t_cursor|tasks:/u, 'no grant id and no kind key in what a person reads');
  const iso = (ms: number) => new Date(ms).toISOString();
  assert.deepEqual(said.agents[0]!.kinds, [
    { kind: 'add tasks', rung: 'tell', since: iso(NOW + HOUR), lifted: false, dropped: null },
    { kind: 'change tasks', rung: 'tell', since: arrived, lifted: true, dropped: null },
    { kind: 'mark tasks done', rung: 'ask', since: iso(NOW + 3 * HOUR), lifted: false, dropped: { at: iso(NOW + 3 * HOUR), why: 'A change like this was undone.' } },
  ]);
  /* AN AGENT WITH NO RUNG YET HAS NO KIND TO NAME: everything it does asks. */
  assert.deepEqual(said.agents[1], { agent: 'Cursor', connected: '2026-10-01T00:00:00.000Z', kinds: [] });
  sql.close();
});

test('THREE DECLINES IN A ROW SAY SO, and reading where agents stand writes nothing', async () => {
  const { api, sql, clock } = await record();
  clock.at = NOW + HOUR;
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_claude', 'tasks:add', 'ask', 0, ?)", new Date(clock.at).toISOString());
  const before = value<Standing>(await api.trust(undefined, owner));
  assert.deepEqual(before.agents[0]!.kinds, [{ kind: 'add tasks', rung: 'ask', since: new Date(NOW + HOUR).toISOString(), lifted: false, dropped: null }]);

  clock.at = NOW + 2 * HOUR;
  for (let i = 0; i < 3; i += 1) {
    const filed = value<{ id: string }>(await api.propose({ question: `Add ${i}?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ name: `No ${i}` }] } }, agent()));
    value(await api.decide({ id: filed.id, resolved_as: 'wont-fix', reason: 'no' }, owner));
  }
  const count = () => sql.one<{ n: number }>('SELECT (SELECT COUNT(*) FROM event) + (SELECT COUNT(*) FROM pref) + (SELECT COUNT(*) FROM ladder) AS n')!.n;
  const held = count();
  const after = value<Standing>(await api.trust(undefined, owner));
  assert.equal(count(), held, 'a read');
  const at = new Date(NOW + 2 * HOUR).toISOString();
  assert.deepEqual(after.agents[0]!.kinds, [{ kind: 'add tasks', rung: 'ask', since: at, lifted: false, dropped: { at, why: '3 changes like this in a row were declined.' } }]);
  sql.close();
});

test('TRUST IS THE WHOLE RECORD\'S: a caller held to some lists is refused, and the owner\'s own agent that reads everything may ask', async () => {
  const { api, sql } = await record();
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' }, registers: ['tasks'] };
  const refused = (await api.trust(undefined, member)) as { ok: boolean; refusal?: { code: string } };
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.code, 'FORBIDDEN');
  assert.equal(value<Standing>(await api.trust(undefined, agent())).agents.length, 2);
  sql.close();
});

test('A KEY THAT IS NOT AN AGENT IS NOT LISTED: a running job\'s bearer and a report key, whose labels are ids', async () => {
  const { api, sql } = await record();
  const key = (id: string, scope: string, label: string) =>
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, ?, ?, '2026-10-03T00:00:00.000Z')", id, `h_${id}`, scope, label);
  key('t_job', 'propose', 'job:01JZ8QK3F7R2M9V4XN6TCB5HAD');
  key('t_report', 'write', 'report:01JZ8QK3F7R2M9V4XN6TCB5HAE');
  const said = value<Standing>(await api.trust(undefined, owner));
  assert.deepEqual(
    said.agents.map((a) => a.agent),
    ['Claude Code', 'Cursor'],
  );
  assert.doesNotMatch(JSON.stringify(said), /job:|report:|01JZ8QK3/u, 'no id reaches what a person reads');
  sql.close();
});

test('TRUST IS THE OWNER\'S: a colleague who reads or decides over every list is refused, and so is a grant of theirs', async () => {
  const { api, sql } = await record();
  const refused = async (ctx: CallContext, why: string, code = 'FORBIDDEN') => {
    const out = (await api.trust(undefined, ctx)) as { ok: boolean; refusal?: { code: string; fix: string } };
    assert.equal(out.ok, false, why);
    assert.equal(out.refusal?.code, code, why);
    return out.refusal!.fix;
  };
  /* EVERY LEVEL UNDER OWNER, WITH NOTHING NARROWING IT: the whole record is read, and the agents are still not theirs. */
  for (const level of ['read', 'write', 'decide'] as const) {
    const fix = await refused({ principal: { kind: 'person', id: 'p_2', level }, credentialed: true }, `a person invited to ${level}`);
    assert.match(fix, /owner/u, 'the sentence says whose it is');
    assert.doesNotMatch(fix, /part of it|—/u, 'and does not say they are held to part of a record they read whole');
  }
  /* A LEVEL THAT DOES NOT READ AT ALL is stopped a step earlier, by the read every method of this group asks for. */
  await refused({ principal: { kind: 'person', id: 'p_2', level: 'append' }, credentialed: true }, 'a person invited to add only', 'LEVEL_REQUIRED');
  assert.equal(((await api.trust(undefined, { principal: { kind: 'person', id: 'p_2', level: null } })) as { ok: boolean }).ok, false, 'a person with no level on the record');
  await refused({ principal: { kind: 'token', id: 't_theirs', scope: 'write', person: 'p_2', level: 'decide' } }, 'a grant a colleague made');
  /* AN OWNER HELD TO SOME LISTS IS STILL HELD TO PART OF IT, and is told that. */
  assert.match(await refused({ principal: { kind: 'person', id: 'p_1', level: 'owner' }, registers: ['tasks'] }, 'an owner narrowed to one list'), /part of it/u);
  /* THE OWNER, EVERY LIST: in person, named as every list, and through a grant of their own. */
  assert.equal(value<Standing>(await api.trust(undefined, owner)).agents.length, 2);
  assert.equal(value<Standing>(await api.trust(undefined, { ...owner, registers: '*' })).agents.length, 2);
  assert.equal(value<Standing>(await api.trust(undefined, agent())).agents.length, 2);
  sql.close();
});

test('TWO GRANTS OF ONE NAME ARE TOLD APART: the later one carries a number, and each keeps its own kinds', async () => {
  const { api, sql } = await record();
  const grant = (id: string, label: string | null, at: string) =>
    sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, 'write', ?, ?)", id, `h_${id}`, label, at);
  grant('t_laptop', 'claude  code', '2026-10-03T00:00:00.000Z');
  grant('t_named', 'Claude Code 2', '2026-10-04T00:00:00.000Z');
  grant('t_third', 'Claude Code', '2026-10-05T00:00:00.000Z');
  grant('t_slash', 'Slash', '2026-10-05T01:00:00.000Z');
  grant('t_bare', null, '2026-10-05T02:00:00.000Z');
  grant('t_blank', '  ', '2026-10-05T03:00:00.000Z');
  const since = '2026-10-05T12:00:00.000Z';
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_claude', 'tasks:add', 'tell', 0, ?)", since);
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('t_laptop', 'tasks:edit', 'ask', 0, ?)", since);

  const said = value<Standing>(await api.trust(undefined, owner));
  assert.deepEqual(
    said.agents.map((a) => [a.agent, a.connected]),
    [
      ['Claude Code', '2026-10-01T00:00:00.000Z'],
      ['Cursor', '2026-10-01T00:00:00.000Z'],
      /* THE SAME NAME HOWEVER IT WAS TYPED, numbered past the grant that is named "Claude Code 2" itself. */
      ['claude  code 3', '2026-10-03T00:00:00.000Z'],
      ['Claude Code 2', '2026-10-04T00:00:00.000Z'],
      ['Claude Code 4', '2026-10-05T00:00:00.000Z'],
      /* SLASH IS SLASH'S NAME, whether or not Slash is listed yet. */
      ['Slash 2', '2026-10-05T01:00:00.000Z'],
      ['Your agent', '2026-10-05T02:00:00.000Z'],
      ['Your agent 2', '2026-10-05T03:00:00.000Z'],
    ],
  );
  const names = said.agents.map((a) => a.agent.replace(/\s+/gu, ' ').toLowerCase());
  assert.equal(new Set(names).size, names.length, 'no two agents read alike');
  const kinds = (name: string) => said.agents.find((a) => a.agent === name)!.kinds.map((k) => `${k.kind}: ${k.rung}`);
  assert.deepEqual(kinds('Claude Code'), ['add tasks: tell'], 'the first keeps its own rung');
  assert.deepEqual(kinds('claude  code 3'), ['change tasks: ask'], 'and the second keeps its own');
  assert.doesNotMatch(JSON.stringify(said), /t_laptop|t_third|t_claude/u, 'told apart by a number and a date, never a grant id');

  /* SLASH WITH A RUNG IS LISTED LAST UNDER ITS OWN NAME, and the grant named after it keeps the number it had. */
  sql.exec("INSERT INTO ladder (agent, kind, rung, accepted_unchanged, since) VALUES ('slash', 'tasks:add', 'tell', 0, ?)", since);
  const withSlash = value<Standing>(await api.trust(undefined, owner)).agents;
  assert.equal(withSlash.length, said.agents.length + 1);
  assert.deepEqual({ agent: withSlash.at(-1)!.agent, connected: withSlash.at(-1)!.connected }, { agent: 'Slash', connected: null });
  assert.deepEqual(
    withSlash.slice(0, -1).map((a) => a.agent),
    said.agents.map((a) => a.agent),
    'no grant changed its name when Slash arrived',
  );
  sql.close();
});
