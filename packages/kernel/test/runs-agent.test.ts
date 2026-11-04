/**
 * Which agent a run is ("Names: the app and where it runs"): the client's own name, which MCP clients send
 * as `clientInfo` on every request since the 2026-07-28 revision, says the kind of agent when the caller named none, and
 * what to call it. A run that said no agent learns its kind from the first call that does.
 *
 * MEASURED BEFORE: 447 of the owner's newest 500 runs named their agent `other`, so they wore the app's glyph rather
 * than Claude's mark, though Claude made every one of them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agentOf, openRecord, provisionalTitle, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { SESSION_BODY as SESSION_2 } from '../src/migrations/0002_session.ts';
import { learned, opening, RUNS, type RunRegister } from '../src/session.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS]));
  return { k, sql, clock };
}

const as = (session: SessionHints = {}, token = 't_1'): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session });
const lines = (sql: NodeSql, id: string): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM event WHERE target = ?', `entry:${id}`)!.n;

/** Migration 2's register, which kept no app and knew four kinds of agent, as a record that has not run 22 holds it. */
const FIELDS_2 = (JSON.parse(SESSION_2) as { fields: { id: string; values?: string[] }[] }).fields;
const REGISTER_2: RunRegister = { has: (field) => FIELDS_2.some((f) => f.id === field), kinds: FIELDS_2.find((f) => f.id === 'agent')?.values ?? [] };

test('THE CLIENT’S NAME SAYS WHICH AGENT A RUN IS: claude-code is Claude, called Claude Code, and the run stops saying other', async () => {
  const { k, sql } = await record();
  const opened: [string, SessionHints][] = [
    ['t_1', { client: 'claude-code', client_version: '2.1.4' }],
    ['t_2', { client: 'codex-mcp-client', client_version: '0.44.0' }],
    ['t_3', { client: 'cursor-vscode', client_version: '1.0.0' }],
    ['t_4', { client: 'claude-ai' }],
    ['t_5', { client: 'gemini-cli-mcp-client' }],
    ['t_6', { client: 'a-tool-nobody-listed' }],
    ['t_7', { agent: 'codex', client: 'claude-code' }],
    ['t_8', { agent: 'other', client: 'Claude Code' }],
  ];
  for (const [token, session] of opened) value(k.create('tasks', { what: token }, as(session, token)));
  const runs = opened.map((_, i) => k.get(`S${i + 1}`) ?? assert.fail(`S${i + 1} was not opened`));
  assert.deepEqual(
    runs.map((r) => [r.fields.agent, r.fields.doing]),
    [
      ['claude', 'Claude Code'],
      ['codex', 'Codex'],
      ['cursor', 'Cursor'],
      ['claude', 'Claude'],
      ['gemini', 'Gemini'],
      /* AN APP NOBODY LISTED IS CALLED BY THE NAME ITS HELLO GAVE, in plain words, never "Agent run". */
      ['other', 'A tool nobody listed'],
      /* A kind the caller named wins over the one its client implies, and `other` names none. */
      ['codex', 'Codex'],
      ['claude', 'Claude Code'],
    ],
  );
  /* THE REGISTER KEEPS THE APP (migration 22), so each run holds the name and version its client sent, as it sent them. */
  assert.deepEqual(
    runs.map((r) => [r.fields.client, r.fields.client_version]),
    opened.map(([, session]) => [session.client, session.client_version]),
  );
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM observation WHERE kind = 'write.refused'")?.n ?? 0, 0, 'a run failed to open');
  sql.close();
});

test('A RUN THAT SAID NO AGENT LEARNS ITS KIND from the first call that names one, in place, and a kind it has is kept', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'From a script' }, as({ host: 'mbp' })));
  const before = k.get('S1')!;
  assert.deepEqual([before.fields.agent, before.fields.doing], ['other', 'An agent']);

  clock.advance(MIN);
  value(k.create('tasks', { what: 'From the MCP server' }, as({ host: 'mbp', client: 'claude-code', client_version: '2.1.4' })));
  const learnt = k.get('S1')!;
  assert.deepEqual(
    [learnt.fields.agent, learnt.fields.client, learnt.fields.client_version, learnt.fields.doing],
    ['claude', 'claude-code', '2.1.4', 'Claude Code'],
  );
  assert.deepEqual([learnt.version, lines(sql, learnt.id)], [before.version, 1], 'learning who the run is was an edit with a line of its own');

  /* Another kind later, naming the run, is not a reason to change its mind about who it is; naming none, it is another
     agent's host session and opens its own run. */
  clock.advance(MIN);
  value(k.create('tasks', { what: 'Signed codex, as S1' }, as({ spoken: 'S1', agent: 'codex' })));
  assert.equal(k.get('S1')?.fields.agent, 'claude');
  value(k.create('tasks', { what: 'Signed codex' }, as({ host: 'mbp', agent: 'codex' })));
  assert.deepEqual([k.get('S1')?.fields.agent, k.get('S2')?.fields.agent], ['claude', 'codex']);
  sql.close();
});

test('WHERE THE REGISTER KEEPS THE CLIENT, its name and version are recorded, and its newer version replaces the older', () => {
  const keeps: RunRegister = { has: (field) => RUNS.has(field) || field === 'client' || field === 'client_version', kinds: [...RUNS.kinds, 'gemini'] };
  const hints: SessionHints = { client: 'gemini-cli-mcp-client', client_version: '0.8.1', host: 'mbp', spoken: 'S9' };
  assert.deepEqual(opening(hints, keeps), { client: 'gemini-cli-mcp-client', client_version: '0.8.1', host: 'mbp', agent: 'gemini' });
  assert.deepEqual(opening(hints), opening(hints, keeps), 'the kernel’s own register is not the one migration 22 seats');
  assert.deepEqual(opening(hints, REGISTER_2), { host: 'mbp' }, 'migration 2’s register kept a field it does not declare');
  /* A kind the register has no value for is left to the register's `other`, and the run still wears its own name. */
  assert.equal(provisionalTitle(hints, 'Kiln', REGISTER_2.kinds), 'Gemini in Kiln');
  /* WITH NO PLACE, THE APP AND ITS KIND OF MACHINE, never the host's own name and never "run". */
  assert.equal(provisionalTitle({ client: 'claude-code', host: 'Samis-MacBook-Pro.local' }, null), 'Claude Code on MacBook');
  assert.equal(provisionalTitle({ client: 'zed', host: 'DESKTOP-7F3K2Q' }, null), 'Zed on Windows PC');
  assert.equal(provisionalTitle({ client: 'mcp-remote', host: 'box-17' }, null), 'An agent');
  assert.equal(provisionalTitle({ client: 'claude-ai' }, null), 'Claude');
  /* AN APP'S OWN NAME NEVER PASSES FOR SOMEBODY (RM8): a person's name here, or a word of BrainDog's own, follows "An app calling itself". */
  const taken = (name: string) => name.toLowerCase() === 'sami';
  assert.equal(provisionalTitle({ client: 'Sami', host: 'Samis-MacBook-Pro.local' }, null, undefined, taken), 'An app calling itself Sami on MacBook');
  assert.equal(provisionalTitle({ client: 'Owner' }, null), 'An app calling itself Owner');
  assert.equal(provisionalTitle({ client: 'BrainDog Health' }, null), 'An app calling itself BrainDog Health');
  assert.equal(provisionalTitle({ client: 'zed', host: 'DESKTOP-7F3K2Q' }, null, undefined, taken), 'Zed on Windows PC', 'an app named for nobody is said by its name');

  const run = { fields: { agent: 'gemini', client: 'gemini-cli-mcp-client', client_version: '0.8.0', doing: 'Gemini run' }, created_at: new Date(NOW).toISOString() };
  assert.deepEqual(learned(run, hints, 'Kiln', keeps), { client_version: '0.8.1', doing: 'Gemini in Kiln' });
  assert.deepEqual(learned(run, hints, 'Kiln', keeps, ['doing']), { client_version: '0.8.1' }, 'a name the call writes itself was overwritten');

  assert.deepEqual(agentOf({ client: 'Claude Code' }), { agent: 'claude', name: 'Claude Code' });
  assert.deepEqual(agentOf({ client: 'GitHub Copilot' }, REGISTER_2.kinds), { agent: undefined, name: 'Copilot' });
  assert.deepEqual(agentOf({ client: 'GitHub Copilot' }), { agent: 'copilot', name: 'Copilot' });
  assert.deepEqual(agentOf({}), { agent: undefined, name: 'Agent' });
});
