/**
 * What a run is called: the agent's own `doing`, at most sixty characters; else its first proposal's
 * question; else the agent and its project, "Claude in BrainDog". Never a day, and a name the record gave is given again
 * whenever the record learns more, while a name somebody wrote is theirs.
 *
 * MEASURED BEFORE: 439 of the owner's newest 500 runs were "Agent run, <day>" and 20 more "Claude run, <day>", and the
 * run working in BrainDog's own repository kept "Claude run, 1 Oct" through every re-attach that told the record where
 * it was, because nothing named a run again once it had opened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clipTitle, openRecord, TITLE_MAX, type Declaration, type SessionHints, type WriteContext } from '../src/index.ts';
import { recordNamed } from '../src/session.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 2, 12);
const MIN = 60_000;

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
    ],
  },
};

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
  value(await k.install([PROJECTS, TASKS]));
  /* THE KEY THE AGENTS HERE WRITE WITH IS THE OWNER'S: a run a person made is for their own keys (`othersRun`). */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_1', 'p_owner', 'h1', 'write', 'One', '2026-09-01T00:00:00.000Z')");
  value(k.create('things', { name: 'BrainDog', repos: ['github.com/actuallyhoss/BrainDog'] }, { actor: 'p_owner' }));
  value(k.create('things', { name: 'Kiln', folders: ['/Users/sam/Code/kiln-type'] }, { actor: 'p_owner' }));
  return { k, sql, clock };
}

const as = (session: SessionHints = {}, token = 't_1'): WriteContext => ({ actor: 'p_owner', principal: { kind: 'token', token }, session });
const doing = (k: Awaited<ReturnType<typeof record>>['k'], spoken: string): unknown => k.get(spoken)?.fields.doing;
const lines = (sql: NodeSql, id: string): number => sql.one<{ n: number }>('SELECT count(*) AS n FROM event WHERE target = ?', `entry:${id}`)!.n;

const BRAINDOG = { host: 'mbp', repo: 'braindog', remote: 'https://github.com/actuallyhoss/BrainDog.git', agent: 'claude' };

test('A RUN IS NAMED FROM WHAT ITS AGENT IS DOING, at most sixty characters and cut at a word', async () => {
  const { k, sql } = await record();
  const long = 'Rewrite the briefing so that it leads with the next step and says each project name once';
  value(k.runFor(as({ ...BRAINDOG, client_id: 'cc-1', doing: long })));
  const named = String(doing(k, 'S1'));
  assert.ok([...named].length <= TITLE_MAX, `${named} is ${named.length} characters`);
  assert.equal(named, 'Rewrite the briefing so that it leads with the next step…');

  /* The run renaming itself is held to the same length; a person naming it from the app is not. */
  value(k.update('session', 'S1', { doing: `${long}, and then the rest of it` }, as({ client_id: 'cc-1' })));
  assert.equal(doing(k, 'S1'), named);
  value(k.update('session', 'S1', { doing: long }, { actor: 'p_owner' }));
  assert.equal(doing(k, 'S1'), long);

  assert.equal(clipTitle('  Fix   the\nfooter  '), 'Fix the footer');
  assert.equal(clipTitle('x'.repeat(80)), `${'x'.repeat(TITLE_MAX - 1)}…`, 'one long word is cut where it must be');
  assert.equal(clipTitle(`${'é'.repeat(70)}`).length, TITLE_MAX, 'an accent was counted as two');
  sql.close();
});

test('ELSE ITS FIRST PROPOSAL’S TITLE: it names a run the record had named, and a second proposal leaves it', async () => {
  const { k, sql, clock } = await record();
  const options = { body_kind: 'options' as const, body: { options: [{ id: 'keep', label: 'Keep it', because: 'Invoices print it.' }, { id: 'drop', label: 'Drop it', because: 'Nobody reads it.' }] } };
  value(k.create('tasks', { what: 'Look at the invoices' }, as({ ...BRAINDOG, client_id: 'cc-1' })));
  assert.equal(doing(k, 'S1'), 'Claude in BrainDog');
  const before = k.get('S1')!;

  clock.advance(MIN);
  /* BY THE TITLE THE AGENT GAVE IT, never the question's own words. */
  value(k.propose({ ...options, question: 'Keep the address field on invoices?', title: 'Keep the address field on invoices?' }, as({ client_id: 'cc-1' })));
  assert.equal(doing(k, 'S1'), 'Keep the address field on invoices?');
  assert.deepEqual([k.get('S1')!.version, lines(sql, before.id)], [before.version, 1], 'naming the run was an edit with a line of its own');
  value(k.propose({ ...options, question: 'And drop the fax number?' }, as({ client_id: 'cc-1' })));
  assert.equal(doing(k, 'S1'), 'Keep the address field on invoices?', 'a second question renamed the run');

  /* A run its agent named keeps the name, and a person's question names no run. */
  value(k.runFor(as({ ...BRAINDOG, client_id: 'cc-2', doing: 'Fix the footer' })));
  value(k.propose({ ...options, question: 'Is the footer black?' }, as({ client_id: 'cc-2' })));
  assert.equal(doing(k, 'S2'), 'Fix the footer');
  value(k.propose({ ...options, question: 'From a person?' }, 'p_owner'));
  assert.deepEqual([doing(k, 'S1'), doing(k, 'S2')], ['Keep the address field on invoices?', 'Fix the footer']);
  /* And the run is found by the words it is now called. */
  assert.deepEqual(k.search('address', { registers: ['session'] }).map((hit) => hit.id), [k.get('S1')!.id]);
  sql.close();
});

test('ELSE THE AGENT AND WHERE IT WORKS: its project by name and never by number, its repository, or the agent alone', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { what: 'a' }, as({ ...BRAINDOG, client_id: 'cc-1' })));
  value(k.create('tasks', { what: 'b' }, as({ host: 'mbp', repo: 'lanternfish', agent: 'codex', client_id: 'cc-2' })));
  value(k.create('tasks', { what: 'c' }, as({ client_id: 'cc-3', agent: 'cursor' })));
  value(k.create('tasks', { what: 'd' }, as({ client_id: 'cc-4' })));
  assert.deepEqual(['S1', 'S2', 'S3', 'S4'].map((s) => doing(k, s)), ['Claude in BrainDog', 'Codex in lanternfish', 'Cursor', 'An agent']);
  for (const s of ['S1', 'S2', 'S3', 'S4']) assert.doesNotMatch(String(doing(k, s)), /\d|things#/u, `${s} is named with a number`);
  sql.close();
});

test('A NAME THE RECORD GAVE FOLLOWS WHAT IT LEARNS: placed again by its host session id the run is renamed, in place', async () => {
  const { k, sql, clock } = await record();
  /* A hook that could not read git: a host session id and a folder, and so no project. */
  value(k.runFor(as({ client_id: 'cc-1', host: 'mbp', cwd: '/tmp/x', agent: 'claude' }), 'opened: startup'));
  assert.equal(doing(k, 'S1'), 'Claude');
  const opened = k.get('S1')!;

  /* A tool call of the same session from the checkout: the run is placed in BrainDog, and named for it. */
  clock.advance(MIN);
  value(k.create('tasks', { what: 'From the checkout' }, as({ client_id: 'cc-1', remote: BRAINDOG.remote, cwd: '/Users/mara/Developer/braindog' })));
  const placed = k.get('S1')!;
  assert.deepEqual([placed.fields.project, placed.fields.doing], ['things#1', 'Claude in BrainDog']);
  assert.deepEqual([placed.version, placed.updated_at, lines(sql, opened.id)], [opened.version, opened.updated_at, 1], 'the record noting where the run is was an edit');

  /* The run's own write of its row carries the new name in the write, with no line for the name. Past the three
     minutes in which a row's maker folds its own edits into the row's first line. */
  clock.advance(5 * MIN);
  value(k.update('session', 'S1', { next: 'Read the gates' }, as({ client_id: 'cc-1', cwd: '/Users/sam/Code/kiln-type/src' })));
  const moved = k.get('S1')!;
  /* PLACED ONCE AND NEVER MOVED (`placeOnce`): from Kiln's folder the run stays in BrainDog, under the same name. */
  assert.deepEqual([moved.fields.project, moved.fields.doing], ['things#1', 'Claude in BrainDog']);
  assert.deepEqual(
    sql.all<{ field: string | null }>('SELECT field FROM event WHERE target = ? ORDER BY rowid', `entry:${moved.id}`).map((e) => e.field),
    [null, 'next'],
  );

  /* A name a person gave is theirs: the run moving does not touch it. */
  value(k.update('session', 'S1', { doing: 'Payroll letters' }, { actor: 'p_owner' }));
  clock.advance(MIN);
  value(k.create('tasks', { what: 'Elsewhere' }, as({ client_id: 'cc-1', remote: BRAINDOG.remote })));
  assert.deepEqual([k.get('S1')!.fields.project, doing(k, 'S1')], ['things#1', 'Payroll letters']);
  sql.close();
});

test('THE OLD NAMES ARE THE RECORD’S TOO: "Claude run, 2 Oct", "Kiln, 2 Oct" in Kiln and "braindog on master" are named again', async () => {
  const { k, sql } = await record();
  /* Runs as the ladder named them before, carried over by hand, each with the host session that comes back to it. */
  for (const [client_id, said] of [
    ['old-1', { doing: 'Claude run, 2 Oct', agent: 'claude' }],
    ['old-2', { doing: 'Kiln, 2 Oct', agent: 'codex' }],
    ['old-3', { doing: 'braindog on master', repo: 'braindog', agent: 'claude' }],
    ['old-4', { doing: 'Agent run, 2 Oct' }],
    ['old-5', { doing: 'Kern the lowercase pairs', agent: 'claude' }],
  ] as const)
    value(k.create('session', { client_id, ...said }, { actor: 'p_owner' }));
  for (const client_id of ['old-1', 'old-2', 'old-3', 'old-4', 'old-5'])
    value(k.create('tasks', { what: client_id }, as(client_id === 'old-2' ? { client_id, cwd: '/Users/sam/Code/kiln-type' } : { client_id, remote: BRAINDOG.remote })));
  assert.deepEqual(
    ['S1', 'S2', 'S3', 'S4', 'S5'].map((s) => doing(k, s)),
    ['Claude in BrainDog', 'Codex in Kiln', 'Claude in BrainDog', 'Agent in BrainDog', 'Kern the lowercase pairs'],
  );

  const run = (doingSaid: string, more: Record<string, string> = {}) => ({ fields: { doing: doingSaid, ...more }, created_at: '2026-10-01T21:47:40.000Z' });
  assert.deepEqual(recordNamed(run('Claude run, 1 Oct')), { name: 'Claude' });
  /* A place must be the run's project, its repository or a known project, so the name is read with it. */
  assert.deepEqual(recordNamed(run('Claude Code in BrainDog'), 'BrainDog'), { name: 'Claude Code' });
  assert.deepEqual(recordNamed(run('Agent run')), { name: null });
  /* AND THE NAMES A RUN IS GIVEN NOW, from its hello and its machine: "Claude Code on MacBook", an app nobody listed by its own name. */
  assert.deepEqual(recordNamed(run('Claude Code on MacBook')), { name: 'Claude Code' });
  assert.deepEqual(recordNamed(run('An agent')), { name: null });
  /* The app's own name is not carried on (RM8): `learned` says it again through `selfNamed`. */
  assert.deepEqual(recordNamed(run('Zed on MacBook', { client: 'zed' })), { name: null });
  assert.equal(recordNamed(run('Zed on MacBook')), null, 'an app the run never named was read as its own');
  assert.deepEqual(recordNamed(run('Lanternly, 1 Oct'), 'Lanternly'), { name: null });
  assert.deepEqual(recordNamed(run('braindog on master', { repo: 'braindog' })), { name: null });
  assert.equal(recordNamed(run('Lanternly, 3 Oct'), 'Lanternly'), null, 'a day the run did not open on is somebody’s words');
  assert.equal(recordNamed(run('Fix the footer')), null);
  assert.equal(recordNamed(run('Claude in')), null, 'a name with no place is somebody’s words');
  sql.close();
});

test('AN AGENT’S OWN WORDS ARE NEVER TAKEN FOR THE RECORD’S: a doing shaped a little like a name the record gives is kept', async () => {
  const { k, sql, clock } = await record();
  const said = ['Standup notes, 2 Oct', 'Payroll run, 2 Oct', 'Claude in the loop: fix the sweep', 'braindog on fire: the build'];
  said.forEach((words, i) => value(k.runFor(as({ ...BRAINDOG, client_id: `cc-${i}`, doing: words }))));
  /* Each run's next call, which names it again only while its name is the record's own. */
  clock.advance(MIN);
  said.forEach((_, i) => value(k.create('tasks', { what: `Task ${i}` }, as({ client_id: `cc-${i}` }))));
  assert.deepEqual(['S1', 'S2', 'S3', 'S4'].map((s) => doing(k, s)), said);

  const run = (doingSaid: string, more: Record<string, string> = {}) => ({ fields: { doing: doingSaid, ...more }, created_at: '2026-10-02T09:00:00.000Z' });
  assert.equal(recordNamed(run('Standup notes, 2 Oct'), 'BrainDog'), null, 'a day after somebody’s words was read as the record’s');
  assert.equal(recordNamed(run('Payroll run, 2 Oct')), null, 'a run of something no agent is called was read as an agent’s');
  assert.equal(recordNamed(run('Claude in the loop: fix the sweep')), null, 'a sentence was read as a place');
  assert.equal(recordNamed(run('braindog on fire: the build', { repo: 'braindog' })), null, 'a sentence was read as a branch');
  sql.close();
});

test('ANOTHER KEY NAMES NOTHING OF A RUN IT DID NOT OPEN: its question and its hints leave the run as it was', async () => {
  const { k, sql, clock } = await record();
  const options = { body_kind: 'options' as const, body: { options: [{ id: 'keep', label: 'Keep it', because: 'Invoices print it.' }, { id: 'drop', label: 'Drop it', because: 'Nobody reads it.' }] } };
  value(k.runFor(as({ client_id: 'cc-1', host: 'mbp', cwd: '/tmp/x' })));
  const before = k.get('S1')!;
  assert.deepEqual([before.fields.agent, before.fields.doing], ['other', 'An agent']);

  /* A second key, naming the first key's run as a stale folder file would, and saying it is Claude in BrainDog. Its
     question and its note are refused as its writes are, rather than signed as S1 (`foreignRun`). */
  clock.advance(MIN);
  const asked = k.propose({ ...options, question: 'Keep the address field on invoices?' }, as({ spoken: 'S1', ...BRAINDOG }, 't_2'));
  const noted = k.log('things', 1, as({ spoken: 'S1', client: 'claude-code', client_version: '2.1.4' }, 't_2'), 'Looked at it');
  for (const out of [asked, noted]) {
    assert.equal(out.ok, false, 'another key was signed as S1');
    if (!out.ok && 'refusal' in out) assert.deepEqual([out.refusal.code, out.refusal.at], ['FORBIDDEN', 'session']);
    else assert.fail('refused without a refusal');
  }
  const after = k.get('S1')!;
  assert.deepEqual([after.fields.agent, after.fields.doing, after.fields.client], ['other', 'An agent', undefined], 'another key renamed the run');
  sql.close();
});
