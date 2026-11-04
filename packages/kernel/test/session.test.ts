/**
 * The session ladder, the heartbeat and the sweep.
 *
 * Every agent write is signed by its run, `S42`, and never by the token behind it. What is asserted
 * here is how the run is found, that finding it writes nothing a reader could mistake for an edit,
 * and that a run which goes quiet is written off by the record rather than left looking alive.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_BODY } from '../src/migrations/0044_seat.ts';
import {
  KERNEL_WRITTEN,
  isStale,
  jcs,
  openRecord,
  provisionalTitle,
  sessionDeclaration,
  type Declaration,
  type Entry,
  type Kernel,
  type SessionHints,
  type WriteContext,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString();

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

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS]));
  /* THE KEYS THIS FILE WRITES WITH: `t_1` is the owner's, and `t_2` somebody else's. Only the maker's own keys name a run they made (`othersRun`). */
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_1', 'p_owner', 'h1', 'write', 'One', '2026-09-01T00:00:00.000Z')");
  sql.exec("INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES ('t_2', 'p_other', 'h2', 'write', 'Two', '2026-09-01T00:00:00.000Z')");
  return { k, sql, clock };
}

/** A token's write, carrying whatever its run says about itself. */
const agent = (session: SessionHints = {}): WriteContext => ({
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session,
});

const events = (sql: NodeSql, id: string) =>
  sql
    .all<{ actor: string; kind: string; field: string | null; note: string | null }>(
      'SELECT actor, kind, field, note FROM event WHERE target = ? ORDER BY rowid',
      `entry:${id}`,
    )
    /* The driver's rows have no prototype, and a plain object is what the assertions compare with. */
    .map((row) => ({ ...row }));

const runs = (sql: NodeSql): number[] =>
  sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.seq);

/* ── the ladder ──────────────────────────────────────────────────────────── */

test('THE LADDER OPENS A RUN for a token write that names none, and the run signs its own create', async () => {
  const { k, sql } = await record();
  const task = value<Entry>(k.create('tasks', { what: 'Wire the ladder' }, agent({ host: 'dev-pc', repo: 'braindog', agent: 'claude' })));

  assert.deepEqual(runs(sql), [1]);
  const run = k.get('S1')!;
  assert.equal(run.state, 'active');
  assert.deepEqual(
    { host: run.fields.host, repo: run.fields.repo, agent: run.fields.agent, token_id: run.fields.token_id, last_seen: run.fields.last_seen },
    { host: 'dev-pc', repo: 'braindog', agent: 'claude', token_id: 't_1', last_seen: iso(NOW) },
  );
  assert.deepEqual(events(sql, run.id), [{ actor: 'S1', kind: 'create', field: null, note: 'opened: auto' }]);
  assert.deepEqual(events(sql, task.id).map((e) => e.actor), ['S1'], 'the task is signed by the token’s person, not its run');
  sql.close();
});

test('A NEW RUN IS NEVER UNTITLED: named for its agent and where it works, never a day, until the agent says', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { what: 'One' }, agent({ host: 'dev-pc', repo: 'braindog', branch: 'master', agent: 'claude' })));
  assert.equal(k.get('S1')!.fields.doing, 'Claude in braindog');
  value(k.create('tasks', { what: 'Two' }, { ...agent({ agent: 'codex' }), principal: { kind: 'token', token: 't_2' } }));
  assert.equal(k.get('S2')!.fields.doing, 'Codex');
  value(k.create('tasks', { what: 'Three' }, { ...agent({ host: 'dev-pc', repo: 'site', doing: 'Fix the footer' }), principal: { kind: 'token', token: 't_3' } }));
  assert.equal(k.get('S3')!.fields.doing, 'Fix the footer', 'what the agent said wins over the starting title');
  value(k.update('session', k.get('S1')!.id, { doing: 'Title the runs' }, agent({ host: 'dev-pc', repo: 'braindog' })));
  assert.equal(k.get('S1')!.fields.doing, 'Title the runs');

  assert.equal(provisionalTitle({ repo: 'braindog' }, null), 'Agent in braindog');
  assert.equal(provisionalTitle({ agent: 'claude', repo: 'braindog' }, 'Lanternly'), 'Claude in Lanternly', 'the project is the place, over the repository');
  assert.equal(provisionalTitle({ agent: 'other' }, null), 'An agent');
  assert.equal(provisionalTitle({ agent: 'claude', client: 'claude-code', host: 'Adas-MacBook-Air.local' }, null), 'Claude Code on MacBook');
  assert.equal(provisionalTitle({ client: 'claude-code' }, 'BrainDog'), 'Claude Code in BrainDog');
  for (const title of ['Claude in braindog', 'Codex', 'Agent in braindog', 'Claude in Lanternly', 'An agent', 'Claude Code in BrainDog', 'Claude Code on MacBook'])
    assert.doesNotMatch(title, /\d/u, `${title} carries a day`);
  sql.close();
});

test('THE HEARTBEAT IS NOT A WRITE: S3 writing a task moves its last_seen and nothing else', async () => {
  const { k, sql, clock } = await record();
  for (const doing of ['one', 'two', 'three']) value(k.create('session', { doing }, { actor: 'p_owner' }));
  const task = value<Entry>(k.create('tasks', { what: 'Draft' }, { actor: 'p_owner' }));
  const before = k.get('S3')!;

  clock.advance(10 * MIN);
  value(k.update('tasks', task.id, { what: 'Final' }, agent({ spoken: 'S3' })));

  const after = k.get('S3')!;
  assert.equal(after.fields.last_seen, iso(NOW + 10 * MIN));
  assert.equal(after.version, before.version, 'the heartbeat bumped the version');
  assert.equal(after.updated_at, before.updated_at, 'the heartbeat moved updated_at');
  assert.equal(events(sql, after.id).length, 1, 'the heartbeat left an event');
  assert.equal(events(sql, task.id).at(-1)?.actor, 'S3');
  assert.deepEqual(runs(sql), [1, 2, 3], 'a named run was replaced by a new one');

  /* So the next edit of the run's own row, made on the version read before, is not a conflict. */
  value(k.update('session', 'S3', { next: 'Run the gates' }, { actor: 'p_owner', version: before.version }));
  sql.close();
});

test('A NAME THAT MATCHES NOTHING IS DROPPED, never recorded as a row of that name', async () => {
  const { k, sql } = await record();
  value(k.create('tasks', { what: 'One' }, agent({ spoken: 'S9' })));
  assert.equal(k.get('S9'), null);
  assert.deepEqual(runs(sql), [1]);

  /* A finished run, named, is passed over the same way. */
  value(k.update('session', 'S1', { state: 'done' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'Two' }, agent({ spoken: 'S1' })));
  assert.deepEqual(runs(sql), [1, 2]);
  assert.equal(k.get('S1')?.state, 'done');
  sql.close();
});

test('A CLIENT ID RE-ATTACHES in any state, and a finished run comes back to active', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Before /clear' }, agent({ client_id: 'cc-1' })));
  value(k.update('session', 'S1', { state: 'done' }, { actor: 'p_owner' }));

  clock.advance(3 * HOUR);
  const task = value<Entry>(k.create('tasks', { what: 'After /clear' }, agent({ client_id: 'cc-1' })));

  assert.deepEqual(runs(sql), [1]);
  const run = k.get('S1')!;
  assert.equal(run.state, 'active');
  assert.equal(run.fields.last_seen, iso(NOW + 3 * HOUR));
  assert.deepEqual(
    events(sql, run.id).map((e) => [e.actor, e.kind]),
    [['S1', 'create'], ['p_owner', 'state'], ['S1', 'state']],
  );
  assert.equal(events(sql, task.id)[0]?.actor, 'S1');

  /* A RUN THAT LEFT A STEP AND IS WORKED IN AGAIN IS WORKING (`REVIVED`): resumed and writing, it comes back
     to active and a new stretch begins, so the step it was handed is no longer the one it leaves (`leftFreshStep`). */
  value(k.update('session', 'S1', { state: 'handoff', next: 'Pick up the sweep' }, { actor: 'p_owner' }));
  clock.advance(MIN);
  value(k.create('tasks', { what: 'Still here' }, agent({ client_id: 'cc-1' })));
  const back = k.get('S1')!;
  assert.equal(back.state, 'active');
  assert.equal(back.fields.last_seen, iso(NOW + 3 * HOUR + MIN));
  assert.equal(back.fields.stretch_at, iso(NOW + 3 * HOUR + MIN), 'coming back began no new stretch');
  assert.equal(back.fields.next, 'Pick up the sweep', 'the step was taken off the run');
  sql.close();
});

test('A LIVE RUN ON THE SAME HOST AND REPO IS ADOPTED, but not by a caller with its own client id, and not once stale', async () => {
  const { k, sql, clock } = await record();
  const where = { host: 'dev-pc', repo: 'braindog' };
  value(k.create('tasks', { what: 'a' }, agent(where)));
  clock.advance(30 * MIN);
  value(k.create('tasks', { what: 'b' }, agent(where)));
  assert.deepEqual(runs(sql), [1], 'a live run on the same host and repo was not adopted');

  /* Two agents side by side in one checkout are two runs. */
  value(k.create('tasks', { what: 'c' }, agent({ ...where, client_id: 'cc-2' })));
  assert.deepEqual(runs(sql), [1, 2]);

  clock.advance(46 * MIN);
  value(k.create('tasks', { what: 'd' }, agent(where)));
  assert.deepEqual(runs(sql), [1, 2, 3], 'a run quiet for 46 minutes was adopted');
  sql.close();
});

test('A REMOTE CLIENT THAT SAYS NOTHING OF WHERE IT IS keeps one run per token: its create and its handoff are one run', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'a' }, agent({ agent: 'other' })));
  clock.advance(10 * MIN);
  value(k.create('tasks', { what: 'b' }, agent({ agent: 'other' })));
  assert.deepEqual(runs(sql), [1], 'a second write with no whereabouts opened a second run');

  /* Another token is another run. The same token naming no run joins the one it has, wherever it says it is; a client
     id the record has not met is a host session of its own. */
  value(k.create('tasks', { what: 'c' }, { ...agent({ agent: 'other' }), principal: { kind: 'token', token: 't_2' } }));
  value(k.create('tasks', { what: 'd' }, agent({ host: 'dev-pc', repo: 'braindog' })));
  assert.deepEqual(runs(sql), [1, 2], 'a write naming no run opened one beside its token’s open run');
  value(k.create('tasks', { what: 'e' }, agent({ client_id: 'cc-9' })));
  assert.deepEqual(runs(sql), [1, 2, 3]);

  clock.advance(46 * MIN);
  value(k.create('tasks', { what: 'f' }, agent({ agent: 'other' })));
  assert.deepEqual(runs(sql), [1, 2, 3, 4], 'a run quiet for 46 minutes was adopted');
  sql.close();
});

test('A PERSON IS NEVER A RUN, whatever the request says about one', async () => {
  const { k, sql } = await record();
  const task = value<Entry>(
    k.create('tasks', { what: 'From the browser' }, {
      actor: 'p_owner',
      principal: { kind: 'person' },
      session: { host: 'dev-pc', repo: 'braindog', client_id: 'cc-1' },
    }),
  );
  assert.deepEqual(runs(sql), []);
  assert.equal(events(sql, task.id)[0]?.actor, 'p_owner');
  sql.close();
});

test('A REFUSED WRITE OPENS NO RUN, and spends no number', async () => {
  const { k, sql } = await record();
  assert.equal(refusal(k.create('tasks', {}, agent({ host: 'dev-pc', repo: 'braindog' }))).code, 'REQUIRED_MISSING');
  assert.deepEqual(runs(sql), []);
  value(k.create('tasks', { what: 'Now' }, agent()));
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

test('A RUN THAT CANNOT BE OPENED leaves the write in under the caller’s name, and records the defect', async () => {
  const { k, sql } = await record();
  const task = value<Entry>(k.create('tasks', { what: 'Unattributed' }, agent({ agent: 'gpt' })));
  assert.deepEqual(runs(sql), []);
  assert.equal(events(sql, task.id)[0]?.actor, 'p_owner');
  assert.equal(
    sql.one<{ n: number }>("SELECT n FROM observation WHERE kind = 'write.refused' AND subject = 'session.agent:ENUM_VALUE_UNKNOWN'")?.n,
    1,
  );
  sql.close();
});

test('A RUN WRITING ITS OWN ROW carries last_seen in that write, with no event for it', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'Open' }, agent({ client_id: 'cc-1' })));
  const before = k.get('S1')!;

  clock.advance(5 * MIN);
  const after = value<Entry>(
    k.update('session', 'S1', { next: 'Run the gates' }, { ...agent({ client_id: 'cc-1' }), version: before.version }),
  );
  assert.equal(after.version, before.version + 1);
  assert.equal(after.fields.last_seen, iso(NOW + 5 * MIN));
  assert.deepEqual(
    events(sql, after.id).map((e) => [e.actor, e.kind, e.field]),
    [['S1', 'create', null], ['S1', 'edit', 'next']],
  );
  sql.close();
});

/* ── what only the record writes ─────────────────────────────────────────── */

test('UNIQUE NAMES THE ROW: a second run with the same client id is ALREADY_KNOWN, naming S1', async () => {
  const { k, sql } = await record();
  value(k.create('session', { client_id: 'cc-1' }, { actor: 'p_owner' }));
  const clash = refusal(k.create('session', { client_id: 'cc-1' }, { actor: 'p_owner' }));
  assert.equal(clash.code, 'ALREADY_KNOWN');
  assert.equal(clash.at, 'client_id');
  assert.match(clash.fix, /^S1 already has that client_id\.$/);
  sql.close();
});

test('THE KERNEL-WRITTEN FIELDS are refused from a person and from a run alike', async () => {
  const { k, sql } = await record();
  assert.deepEqual(
    [...KERNEL_WRITTEN],
    [
      'last_seen', 'project', 'token_id', 'started', 'stretch_at', 'next_at', 'closed_as', 'closed_at', 'taken_by', 'took', 'parent', 'wrote', 'seen_before',
      'instruction', 'task', 'profile', 'pulse_at', 'stopped', 'worktree', 'seat',
    ],
  );
  value(k.create('session', { doing: 'Mine' }, { actor: 'p_owner' }));

  /* EACH WITH A VALUE ITS TYPE TAKES, so the refusal is about who writes it and not about the value. */
  const INSTANTS = ['last_seen', 'started', 'stretch_at', 'next_at', 'closed_at', 'seen_before', 'pulse_at'];
  /* last_seen on a create, or on a run never heard from here, is carried as seen_before (run-carried.ts); runs-imported.test.ts and run-carried.test.ts hold that, and a run heard from here still refuses it. */
  for (const key of KERNEL_WRITTEN.filter((k) => k !== 'last_seen')) {
    const said = INSTANTS.includes(key) ? iso(NOW) : key === 'wrote' ? 1 : key === 'closed_as' ? 'taken' : key === 'stopped' ? 'stop' : 'x';
    for (const out of [
      k.create('session', { doing: 'Another', [key]: said }, { actor: 'p_owner' }),
      k.update('session', 'S1', { [key]: said }, { actor: 'p_owner' }),
      k.update('session', 'S1', { [key]: said }, agent({ spoken: 'S1' })),
    ]) {
      const r = refusal(out);
      assert.equal(r.code, 'IMMUTABLE_FIELD', `${key} was accepted`);
      assert.equal(r.at, key);
    }
  }
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

test('STALE IS DERIVED at 45 minutes, and the declaration has nowhere to store it', () => {
  const row = { fields: { last_seen: iso(NOW) }, updated_at: iso(NOW - HOUR) };
  assert.equal(isStale(row, NOW + 44 * MIN), false);
  assert.equal(isStale(row, NOW + 46 * MIN), true);
  assert.equal(isStale({ fields: {}, updated_at: iso(NOW) }, NOW + 46 * MIN), true, 'a row with no last_seen is judged by updated_at');
  assert.ok(!SESSION_BODY.includes('stale'));
});

/* ── the sweep ───────────────────────────────────────────────────────────── */

test('THE TWELVE-HOUR SWEEP abandons quiet runs, leaves a handoff waiting, and never writes done', async () => {
  const { k, sql, clock } = await record();
  value(k.create('tasks', { what: 'a' }, agent({ client_id: 'working' })));
  value(k.create('tasks', { what: 'b' }, agent({ client_id: 'resting' })));
  value(k.update('session', 'S2', { state: 'idle' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'c' }, agent({ client_id: 'waiting' })));
  value(k.update('session', 'S3', { state: 'handoff', next: 'Pick up the sweep' }, { actor: 'p_owner' }));
  clock.advance(11 * HOUR);
  value(k.create('tasks', { what: 'd' }, agent({ client_id: 'recent' })));
  clock.advance(90 * MIN);

  /* The hourly row, due now. `createRecord` arms it on a real record. */
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01J00000000000000000000001', ?, 'purge', 'sweep', '{}', 'pending', 0)",
    iso(clock.now()),
  );
  /* The sweep, and the signs' night beside it, armed as the record opened (`armSigns`). */
  assert.ok((await k.drain()).done >= 1);

  assert.deepEqual(['S1', 'S2', 'S3', 'S4'].map((s) => k.get(s)?.state), ['abandoned', 'abandoned', 'handoff', 'active']);
  assert.deepEqual(events(sql, k.get('S1')!.id).at(-1), {
    actor: 'system',
    kind: 'state',
    field: 'state',
    note: 'Nothing heard from this run in twelve hours.',
  });
  assert.equal(sql.all("SELECT 1 FROM entry WHERE register = 'session' AND state = 'done'").length, 0);

  /* And the next morning the run re-attaches by its client id. */
  value(k.create('tasks', { what: 'e' }, agent({ client_id: 'working' })));
  assert.equal(k.get('S1')?.state, 'active');
  sql.close();
});

/* ── who may declare it ──────────────────────────────────────────────────── */

test('NOBODY BUT THE KERNEL DECLARES register.session, and the kernel’s own bytes change nothing', async () => {
  const { k, sql } = await record();
  assert.equal(sessionDeclaration().id, 'register.session');
  assert.equal(jcs(sessionDeclaration().body), SESSION_BODY, 'the kernel’s declaration is not the one its newest migration seats');
  assert.ok(k.register('session')?.fields.some((f) => f.id === 'client'), 'a new record holds a register that keeps no app');

  const mine: Declaration = {
    id: 'register.session',
    kind: 'register',
    body: { id: 'session', name: 'Mine', title: 'what', fields: [{ id: 'what', type: 'text' }] },
  };
  for (const decl of [mine, { ...mine, pack: 'agents' }, { ...mine, pack: 'kernel' }, { ...sessionDeclaration(), pack: 'agents' }]) {
    const r = refusal(await k.install([decl]));
    assert.equal(r.code, 'PROVIDES_CONFLICT', `${decl.pack ?? 'a person'} declared register.session`);
    assert.equal(r.at, 'register.session');
  }

  const again = value<{ id: string; changed: boolean }[]>(await k.install([sessionDeclaration()]));
  assert.equal(again[0]?.changed, false);
  assert.equal(sql.all("SELECT 1 FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL").length, 1);
  assert.ok(k.register('session')?.fields.some((f) => f.id === 'client'));
  assert.equal(k.register('session')?.name, 'Agent runs');
  sql.close();
});

/* ── asking for the run before a write ───────────────────────────────────── */

test('runFor OPENS A RUN SIGNED BY ITSELF, and finds it again without writing a thing', async () => {
  /* `attach` and `handoff` must know the run before they write its row. This asks the ladder directly,
     where the record used to write an empty row as the token and undo it to learn the answer. */
  const { k, sql, clock } = await record();
  const said = agent({ client_id: 'c-1', host: 'dev-pc', repo: 'braindog' });
  const opened = value<{ run: Entry; spoken: string; opened: boolean }>(k.runFor(said, 'opened: startup'));
  assert.deepEqual([opened.spoken, opened.opened], ['S1', true]);
  assert.deepEqual(events(sql, opened.run.id), [{ actor: 'S1', kind: 'create', field: null, note: 'opened: startup' }]);
  assert.deepEqual([opened.run.fields.token_id, opened.run.fields.last_seen], ['t_1', iso(NOW)]);

  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  clock.advance(5 * MIN);
  const found = value<{ run: Entry; spoken: string; opened: boolean }>(k.runFor(said));
  assert.deepEqual([found.spoken, found.opened, found.run.id], ['S1', false, opened.run.id]);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before, 'finding the run wrote an event');
  const now = k.get('S1')!;
  assert.deepEqual([now.version, now.fields.last_seen], [1, iso(NOW)], 'finding the run wrote to it');
  assert.equal(sql.one<{ next: number }>("SELECT next FROM counter WHERE name = 'seq:session'")?.next, 2, 'a number was spent');

  /* And the read-only half names it, or nothing, and writes nothing either. */
  assert.equal(k.findRun({ client_id: 'c-1' })?.id, opened.run.id);
  assert.equal(k.findRun({ client_id: 'c-9' }), null);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, before);

  assert.equal(refusal(k.runFor({ actor: 'p_owner' })).code, 'FORBIDDEN', 'a person was given a run');
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

test('A TOKEN’S NOTE IS SIGNED BY ITS RUN AND MOVES ITS HEARTBEAT, and a note against nothing opens none', async () => {
  const { k, sql, clock } = await record();
  const task = value<Entry>(k.create('tasks', { what: 'Draft' }, { actor: 'p_owner' }));
  const said = agent({ client_id: 'c-1' });

  assert.equal(refusal(k.log('tasks', 99, said, 'Nothing here.')).code, 'OUT_OF_BOUNDS');
  assert.deepEqual(runs(sql), [], 'a note against nothing opened a run');

  value(k.log('tasks', task.seq!, said, 'Read it through.'));
  assert.deepEqual(events(sql, task.id).at(-1), { actor: 'S1', kind: 'note', field: null, note: 'Read it through.' });
  const s1 = k.get('S1')!;

  clock.advance(10 * MIN);
  value(k.log('tasks', task.seq!, said, 'Read it again.'));
  const later = k.get('S1')!;
  assert.equal(later.fields.last_seen, iso(NOW + 10 * MIN), 'the note left the heartbeat where it was');
  assert.equal(later.version, s1.version, 'the heartbeat bumped the version');
  assert.deepEqual(events(sql, s1.id).map((e) => e.kind), ['create'], 'the heartbeat wrote an event');

  /* A person's note is signed by the person and opens no run. */
  value(k.log('tasks', task.seq!, { actor: 'p_owner' }, 'Checked.'));
  assert.equal(events(sql, task.id).at(-1)?.actor, 'p_owner');
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

test('A TOKEN’S PROPOSAL IS SIGNED BY ITS RUN, a refused one opens none, and its question can be read back', async () => {
  const { k, sql } = await record();
  const options = {
    question: 'Keep the address field?',
    body_kind: 'options' as const,
    body: { options: [{ id: 'keep', label: 'Keep it', because: 'Invoices print it.' }, { id: 'drop', label: 'Drop it', because: 'Nobody reads it.' }] },
  };

  assert.equal(refusal(k.propose({ ...options, question: ' ' }, agent({ client_id: 'c-1' }))).code, 'REQUIRED_MISSING');
  assert.deepEqual(runs(sql), [], 'a refused proposal opened a run');

  const made = value<{ id: string }>(k.propose(options, agent({ client_id: 'c-1' })));
  assert.equal(k.governanceRow('suggestion', made.id)?.opened_by, 'S1');
  assert.equal(
    sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${made.id}`)?.actor,
    'S1',
  );
  assert.equal(k.question(made.id), 'Keep the address field?');
  assert.equal(k.question('SG99'), null);

  /* A bare name still signs as itself: the record's own mechanisms propose that way. */
  const mine = value<{ id: string }>(k.propose(options, 'p_owner'));
  assert.equal(k.governanceRow('suggestion', mine.id)?.opened_by, 'p_owner');
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

test('A RUN BELONGS TO THE TOKEN THAT OPENED IT: another key naming it, holding its client id or writing its row is refused', async () => {
  const { k, sql, clock } = await record();
  const where = { host: 'dev-pc', repo: 'braindog' };
  value(k.create('tasks', { what: 'Mine' }, agent({ ...where, client_id: 'cc-1' })));
  const other = (session: SessionHints = {}): WriteContext => ({ actor: 'p_other', principal: { kind: 'token', token: 't_2' }, session });

  for (const said of [{ spoken: 'S1' }, { client_id: 'cc-1' }]) {
    const out = refusal(k.create('tasks', { what: 'As S1' }, other(said)));
    assert.deepEqual([out.code, out.at], ['FORBIDDEN', 'session']);
    assert.equal(refusal(k.runFor(other(said))).code, 'FORBIDDEN');
    assert.equal(k.findRun(said, 't_2'), null);
    assert.equal(k.findRun(said, 't_1')?.seq, 1);
  }
  assert.equal(refusal(k.update('session', 'S1', { next: 'Mine now' }, other())).code, 'FORBIDDEN');
  assert.deepEqual(runs(sql), [1], 'a refused key opened a run');

  /* One machine and one checkout is not one run: the other key opens its own. */
  clock.advance(MIN);
  value(k.create('tasks', { what: 'Theirs' }, other(where)));
  assert.deepEqual(runs(sql), [1, 2]);
  assert.equal(k.get('S2')?.fields.token_id, 't_2');
  assert.equal(k.get('S1')?.version, 1);
  sql.close();
});

test('A RUN A PERSON MADE IS FOR THEIR OWN KEYS, one an automation made is shared with any key that names it, and a run a key makes by hand is that key’s', async () => {
  const { k, sql } = await record();
  value(k.create('session', { doing: 'For whoever picks it up' }, { actor: 'p_owner' }));
  value(k.create('tasks', { what: 'Picked up' }, agent({ spoken: 'S1' })));
  const notHis = refusal(k.create('tasks', { what: 'Me too' }, { actor: 'p_other', principal: { kind: 'token', token: 't_2' }, session: { spoken: 'S1' } }));
  assert.deepEqual([notHis.code, notHis.at], ['FORBIDDEN', 'session']);
  assert.deepEqual(runs(sql), [1]);
  value(k.create('session', { doing: 'For any key' }, { actor: 'system' }));
  value(k.create('tasks', { what: 'Mine too' }, { actor: 'p_other', principal: { kind: 'token', token: 't_2' }, session: { spoken: 'S2' } }));
  value(k.create('tasks', { what: 'And mine' }, agent({ spoken: 'S2' })));
  assert.deepEqual(runs(sql), [1, 2]);

  const made = value<Entry>(k.create('session', { doing: 'By hand' }, agent()));
  assert.equal(made.fields.token_id, 't_1');
  const other: WriteContext = { actor: 'p_other', principal: { kind: 'token', token: 't_2' }, session: { spoken: `S${made.seq}` } };
  assert.equal(refusal(k.create('tasks', { what: 'Not mine' }, other)).code, 'FORBIDDEN');
  sql.close();
});

test('A NOTE AND A QUESTION ARE NEVER SIGNED AS ANOTHER KEY’S RUN: naming it is refused, and the key’s own run still signs', async () => {
  const { k, sql } = await record();
  const task = value<Entry>(k.create('tasks', { what: 'Mine' }, agent({ client_id: 'cc-1' })));
  const options = { question: 'Keep it?', body_kind: 'options' as const, body: { options: [{ id: 'y', label: 'Yes', because: 'It helps.' }, { id: 'n', label: 'No', because: 'It does not.' }] } };
  const other = (session: SessionHints): WriteContext => ({ actor: 'p_other', principal: { kind: 'token', token: 't_2' }, session });
  const notes = () => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'note'")?.n);

  for (const said of [{ spoken: 'S1' }, { client_id: 'cc-1' }]) {
    const noted = refusal(k.log('tasks', task.seq!, other(said), 'Signed as S1?'));
    assert.deepEqual([noted.code, noted.at], ['FORBIDDEN', 'session']);
    const asked = refusal(k.propose(options, other(said)));
    assert.deepEqual([asked.code, asked.at], ['FORBIDDEN', 'session']);
  }
  assert.equal(notes(), 0);
  assert.equal(Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n), 0);
  assert.deepEqual(runs(sql), [1], 'a refused key opened a run');

  /* Its own run signs as it did, a run the owner made is not its to name (`othersRun`), and an automation's still is any key's. */
  value(k.log('tasks', task.seq!, other({ client_id: 'cc-2' }), 'Mine now'));
  assert.equal(events(sql, task.id).at(-1)?.actor, 'S2');
  value(k.create('session', { doing: 'For the owner\'s keys' }, { actor: 'p_owner' }));
  assert.deepEqual([refusal(k.log('tasks', task.seq!, other({ spoken: 'S3' }), 'Picked up')).code], ['FORBIDDEN']);
  value(k.create('session', { doing: 'For whoever picks it up' }, { actor: 'system' }));
  value(k.log('tasks', task.seq!, other({ spoken: 'S4' }), 'Picked up'));
  assert.equal(events(sql, task.id).at(-1)?.actor, 'S4');
  sql.close();
});
