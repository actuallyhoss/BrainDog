/**
 * One run per host session ("Stop the harm"): a write that names no run joins its token's newest open run
 * instead of opening another, and the host session's own id makes the start hook's run and the tool calls one run.
 *
 * MEASURED BEFORE, on the owner's record: 732 runs, and of the newest 500, 491 abandoned and 439 called "Agent run" and
 * a day. Every write that named no run and no repository opened a run of its own, so 337 deletes made from a scratch
 * folder one afternoon were 337 runs, each in the next briefing and each written off by the sweep twelve hours later.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type SessionHints, type WriteContext } from '../src/index.ts';
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

/** A key's call, carrying what it says about its run. */
const as = (token: string, session: SessionHints = {}): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session });

const runs = (sql: NodeSql): number[] => sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.seq);

/** Who signed a row's first line. */
const signer = (sql: NodeSql, row: Entry): string | undefined =>
  sql.one<{ actor: string }>('SELECT actor FROM event WHERE target = ? ORDER BY rowid LIMIT 1', `entry:${row.id}`)?.actor;

/** Where Claude Code's start hook says it is, with the host session's own id. */
const HOOK = { client_id: 'cc-1', host: 'mbp', repo: 'braindog', cwd: '/Users/mara/Developer/braindog', agent: 'claude' };

test('A WRITE THAT NAMES NO RUN JOINS ITS TOKEN’S OPEN RUN: thirty deletes from a scratch folder are one run, not thirty', async () => {
  const { k, sql, clock } = await record();
  value(k.runFor(as('t_1', HOOK), 'opened: startup'));

  /* The agent runs the command line from its scratch folder: no run named, no repository, a folder nobody lists. */
  const made: Entry[] = [];
  for (let i = 0; i < 30; i++) {
    clock.advance(MIN);
    made.push(value<Entry>(k.create('tasks', { what: `Task ${i}` }, as('t_1', { host: 'mbp', cwd: '/private/tmp/claude-501/scratchpad' }))));
  }
  for (const row of made) value(k.update('tasks', row.id, { deleted_at: new Date(clock.now()).toISOString() }, as('t_1', { cwd: '/private/tmp/claude-501/scratchpad' })));

  assert.deepEqual(runs(sql), [1], 'a write naming no run opened one of its own');
  assert.deepEqual([...new Set(made.map((row) => signer(sql, row)))], ['S1']);
  const s1 = k.get('S1')!;
  assert.deepEqual([s1.state, s1.fields.last_seen], ['active', new Date(clock.now()).toISOString()], 'the writes did not keep the run alive');
  assert.equal(s1.fields.cwd, HOOK.cwd, 'joining moved the run to the scratch folder');
  sql.close();
});

test('THE HOOK’S RUN AND THE TOOL CALLS ARE ONE RUN: the host session id finds it, and a new one is a session of its own', async () => {
  const { k, sql, clock } = await record();
  const hook = value<{ spoken: string; opened: boolean }>(k.runFor(as('t_1', HOOK), 'opened: startup'));
  assert.deepEqual([hook.spoken, hook.opened], ['S1', true]);

  /* An MCP call carrying the session's id and nothing else, then one carrying the run's name. */
  clock.advance(MIN);
  value(k.create('tasks', { what: 'From a tool call' }, as('t_1', { client_id: 'cc-1' })));
  value(k.create('tasks', { what: 'By its name' }, as('t_1', { spoken: 'S1' })));
  assert.deepEqual(runs(sql), [1]);

  /* A second Claude Code window in the same checkout is a second host session, and two agents side by side are two
     runs. A write naming neither then joins the one heard from last. */
  clock.advance(MIN);
  value(k.create('tasks', { what: 'Beside it' }, as('t_1', { ...HOOK, client_id: 'cc-2' })));
  assert.deepEqual(runs(sql), [1, 2]);
  clock.advance(MIN);
  const loose = value<Entry>(k.create('tasks', { what: 'Naming neither' }, as('t_1', { host: 'mbp', repo: 'braindog' })));
  assert.equal(signer(sql, loose), 'S2');

  /* And the session that went quiet comes back by its own id, not by a guess. */
  clock.advance(50 * MIN);
  const back = value<Entry>(k.create('tasks', { what: 'After lunch' }, as('t_1', { client_id: 'cc-1' })));
  assert.equal(signer(sql, back), 'S1');
  assert.deepEqual(runs(sql), [1, 2]);
  sql.close();
});

test('OF TWO OPEN RUNS THE ONE WHERE THE CALLER IS WINS: the same machine and repository first, then the same machine', async () => {
  const { k, sql, clock } = await record();
  value(k.runFor(as('t_1', { client_id: 'a', host: 'mbp', repo: 'braindog' })));
  clock.advance(MIN);
  value(k.runFor(as('t_1', { client_id: 'b', host: 'mbp', repo: 'lanternfish' })));
  clock.advance(MIN);
  value(k.runFor(as('t_1', { client_id: 'c', host: 'pc' })));
  clock.advance(MIN);

  const by = (session: SessionHints): string | undefined => {
    clock.advance(MIN);
    return signer(sql, value<Entry>(k.create('tasks', { what: JSON.stringify(session) }, as('t_1', session))));
  };
  assert.equal(by({ host: 'mbp', repo: 'braindog' }), 'S1', 'the newest run won over the one in this checkout');
  assert.equal(by({ host: 'pc', repo: 'site' }), 'S3', 'a run on another machine won over the one on this machine');
  assert.equal(by({ host: 'mbp', repo: 'lanternfish' }), 'S2');
  /* A command from a scratch folder names the machine and no repository: the run heard from last on it. */
  assert.equal(by({ host: 'mbp', cwd: '/private/tmp/scratch' }), 'S2');
  /* A remote client says nothing of where it is: it joins the run heard from last. */
  assert.equal(by({}), 'S2');
  assert.deepEqual(runs(sql), [1, 2, 3]);
  sql.close();
});

test('ANOTHER MACHINE, ANOTHER REPOSITORY OR ANOTHER AGENT IS ANOTHER HOST SESSION: its write opens its own run, placed where it is', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const projects: Declaration = {
    id: 'register.things',
    kind: 'register',
    body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
  };
  const tasks: Declaration = {
    id: 'register.tasks',
    kind: 'register',
    body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'thing', type: 'ref', to: 'things', scope: { widen: 'person' } }] },
  };
  value(await k.install([projects, tasks]));
  const [braindog, lanternfish] = ['braindog', 'lanternfish'].map((repo) => value<Entry>(k.create('things', { name: repo, repos: [repo] }, { actor: 'p_owner' })).id);
  /* Claude's session in BrainDog, opened by its start hook. */
  value(k.runFor(as('t_1', HOOK), 'opened: startup'));
  assert.equal(k.get('S1')?.fields.project, 'things#1');

  /* Codex in the Lanternfish checkout on the same machine and key, naming no run: not Claude's, and its task is Lanternfish's. */
  clock.advance(MIN);
  const codex = value<Entry>(k.create('tasks', { what: 'Fix the checkout' }, as('t_1', { host: 'mbp', repo: 'lanternfish', agent: 'codex' })));
  assert.equal(signer(sql, codex), 'S2', 'a Codex write in Lanternfish was signed as Claude’s BrainDog run');
  assert.deepEqual([codex.fields.thing, k.get('S2')?.fields.project], [lanternfish, 'things#2'], 'the Lanternfish task was filed under BrainDog');
  value(k.create('tasks', { what: 'Naming Lanternfish', thing: lanternfish }, as('t_1', { host: 'mbp', repo: 'lanternfish', agent: 'codex' })));

  /* The same key on the PC, and Codex in the BrainDog checkout, are host sessions of their own too. */
  clock.advance(MIN);
  value(k.create('tasks', { what: 'From the PC' }, as('t_1', { host: 'pc', repo: 'braindog' })));
  value(k.create('tasks', { what: 'Codex in BrainDog' }, as('t_1', { host: 'mbp', repo: 'braindog', agent: 'codex' })));
  assert.deepEqual(runs(sql), [1, 2, 3, 4]);
  /* And Claude's own write from the checkout still lands in Claude's run. */
  const claude = value<Entry>(k.create('tasks', { what: 'Claude again' }, as('t_1', { host: 'mbp', repo: 'braindog', agent: 'claude' })));
  assert.deepEqual([signer(sql, claude), claude.fields.thing], ['S1', braindog]);
  sql.close();
});

test('ONLY ITS OWN, ONLY OPEN, ONLY RECENT: another key’s run, a person’s, a handoff, a finished run and a quiet one are never joined', async () => {
  const { k, sql, clock } = await record();
  /* Another key's run, and a run a person made for an agent to take up: either is named outright or not at all. */
  value(k.runFor(as('t_2', { client_id: 'theirs' })));
  value(k.create('session', { doing: 'For whoever picks it up' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'Mine' }, as('t_1')));
  assert.deepEqual(runs(sql), [1, 2, 3], 'a key joined a run it did not open');
  assert.equal(k.get('S3')?.fields.token_id, 't_1');

  /* A run waiting on a handoff is a request for the next run, and is not taken by a guess. */
  value(k.update('session', 'S3', { state: 'handoff', next: 'Pick up the sweep' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'Next' }, as('t_1')));
  assert.deepEqual(runs(sql), [1, 2, 3, 4]);

  /* A finished run is over. */
  value(k.update('session', 'S4', { state: 'done' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'After it finished' }, as('t_1')));
  assert.deepEqual(runs(sql), [1, 2, 3, 4, 5]);

  /* An idle run is open: the end hook left it so, and a write in the next minutes is the same work coming back. */
  value(k.update('session', 'S5', { state: 'idle' }, { actor: 'p_owner' }));
  clock.advance(10 * MIN);
  value(k.create('tasks', { what: 'Back from idle' }, as('t_1')));
  assert.deepEqual(runs(sql), [1, 2, 3, 4, 5]);
  assert.equal(k.get('S5')?.state, 'active');

  /* Forty-six minutes of silence is past the window, and the next write opens a run of its own. */
  clock.advance(46 * MIN);
  value(k.create('tasks', { what: 'Much later' }, as('t_1')));
  assert.deepEqual(runs(sql), [1, 2, 3, 4, 5, 6]);
  sql.close();
});

test('A READ NAMES THE RUN A WRITE WOULD JOIN, and writes nothing', async () => {
  const { k, sql, clock } = await record();
  value(k.runFor(as('t_1', HOOK)));
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  clock.advance(5 * MIN);
  assert.equal(k.findRun({}, 't_1')?.seq, 1, 'a call with no hints did not find its token’s run');
  assert.equal(k.findRun({ cwd: '/private/tmp' }, 't_1')?.seq, 1);
  assert.equal(k.findRun({}, 't_2'), null, 'another key found the run');
  assert.equal(k.findRun({ client_id: 'cc-9' }, 't_1'), null, 'a host session the record has not met found a run');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before);
  assert.equal(k.get('S1')?.fields.last_seen, new Date(NOW).toISOString(), 'reading moved the heartbeat');
  sql.close();
});
