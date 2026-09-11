/**
 * An agent's runs, through the record: every token write signed by its run, and the three calls a run
 * is kept by.
 *
 * What is asserted is the attribution a person reads a week later: which run wrote a row, what it was
 * doing, and what it tried. A person in a browser is never a run, whatever their call carries.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { createRecordApi, type Attached, type Boot, type CallContext, type LiveRun } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);
const MIN = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS])).ok);
  return { api, sql, clock };
}

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const HERE = { host: 'dev-pc', repo: 'braindog', agent: 'claude' };

/** A token's call, carrying what its run says about itself. */
const agent = (session: CallContext['session'] = {}, more: Partial<CallContext> & { scope?: 'read' | 'propose' | 'write' } = {}): CallContext => {
  const { scope = 'write', ...rest } = more;
  return { principal: { kind: 'token', id: 'tok_1', scope, person: 'p_1', level: 'owner' }, session, ...rest };
};

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: { ok: boolean }): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const events = (sql: NodeSql, id: string) =>
  sql
    .all<{ actor: string; kind: string; note: string | null }>('SELECT actor, kind, note FROM event WHERE target = ? ORDER BY rowid', `entry:${id}`)
    .map((row) => ({ ...row }));

const runs = (sql: NodeSql): number[] =>
  sql.all<{ seq: number }>("SELECT seq FROM entry WHERE register = 'session' ORDER BY seq").map((r) => r.seq);

const run = async (api: Awaited<ReturnType<typeof record>>['api'], spoken: string): Promise<Entry> =>
  value<Entry | null>(await api.get({ spoken }, owner)) ?? assert.fail(`${spoken} is not there`);

/* ── attribution ─────────────────────────────────────────────────────────── */

test('A TOKEN WRITE IS SIGNED BY ITS RUN, and the next write from the same client is the same run', async () => {
  const { api, sql } = await record();
  const said = { ...HERE, client_id: 'c-1' };
  const one = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'One' } }, agent(said)));
  const two = value<Entry>(await api.update({ register: 'tasks', seq: one.seq!, patch: { what: 'One, done' } }, agent(said)));

  assert.deepEqual(runs(sql), [1]);
  assert.deepEqual(events(sql, two.id).map((e) => e.actor), ['S1', 'S1']);
  const s1 = await run(api, 'S1');
  assert.deepEqual(
    { client_id: s1.fields.client_id, token_id: s1.fields.token_id, host: s1.fields.host, repo: s1.fields.repo, agent: s1.fields.agent },
    { client_id: 'c-1', token_id: 'tok_1', host: 'dev-pc', repo: 'braindog', agent: 'claude' },
  );
  assert.deepEqual(events(sql, s1.id), [{ actor: 'S1', kind: 'create', note: 'opened: auto' }]);
  sql.close();
});

test('A PERSON IS NEVER A RUN, whatever hints their call carries', async () => {
  const { api, sql } = await record();
  const hinted: CallContext = { ...owner, session: { ...HERE, client_id: 'c-9', spoken: 'S1' } };
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'Mine' } }, hinted));
  value(await api.log({ register: 'tasks', seq: task.seq!, note: 'Checked by hand.' }, hinted));

  assert.deepEqual(runs(sql), []);
  assert.deepEqual(events(sql, task.id).map((e) => e.actor), ['p_1', 'p_1']);
  assert.equal(refusal(await api.attach({ source: 'startup' }, hinted)).code, 'FORBIDDEN');
  assert.deepEqual(runs(sql), []);
  sql.close();
});

test('A TOKEN’S NOTE IS SIGNED BY ITS RUN, and a note against nothing opens none', async () => {
  const { api, sql } = await record();
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'Draft' } }, owner));
  const said = agent({ ...HERE, client_id: 'c-1' });

  refusal(await api.log({ register: 'tasks', seq: 99, note: 'Nothing here.' }, said));
  assert.deepEqual(runs(sql), []);

  value(await api.log({ register: 'tasks', seq: task.seq!, note: 'Read it through.' }, said));
  assert.deepEqual(runs(sql), [1]);
  assert.deepEqual(events(sql, task.id).at(-1), { actor: 'S1', kind: 'note', note: 'Read it through.' });
  sql.close();
});

/* ── attach ──────────────────────────────────────────────────────────────── */

test('ATTACH OPENS A RUN SIGNED BY ITSELF, and attaching again resumes it and refreshes where it stands', async () => {
  const { api, sql, clock } = await record();
  const first = value<Attached>(
    await api.attach({ source: 'startup', client_id: 'c-1', doing: 'Wire the ladder', branch: 'master', head: 'aee9762' }, agent(HERE)),
  );
  assert.deepEqual([first.spoken, first.resumed, first.project], ['S1', false, null]);
  assert.deepEqual(
    { doing: first.session.fields.doing, branch: first.session.fields.branch, head: first.session.fields.head, last_seen: first.session.fields.last_seen },
    { doing: 'Wire the ladder', branch: 'master', head: 'aee9762', last_seen: iso(NOW) },
  );
  assert.deepEqual(events(sql, first.session.id), [{ actor: 'S1', kind: 'create', note: 'opened: startup' }]);
  assert.deepEqual(runs(sql), [1], 'asking the ladder left a row behind');

  clock.advance(5 * MIN);
  const again = value<Attached>(await api.attach({ source: 'resume', client_id: 'c-1', branch: 'feature', head: '41b120e' }, agent(HERE)));
  assert.deepEqual([again.spoken, again.resumed], ['S1', true]);
  assert.deepEqual(
    { doing: again.session.fields.doing, branch: again.session.fields.branch, head: again.session.fields.head, last_seen: again.session.fields.last_seen },
    { doing: 'Wire the ladder', branch: 'feature', head: '41b120e', last_seen: iso(NOW + 5 * MIN) },
  );
  assert.deepEqual(events(sql, again.session.id).at(-1)?.actor, 'S1');
  assert.ok(events(sql, again.session.id).some((e) => e.note === 'attached: resume'));

  /* Another client is another run, and the number the question used was given back. */
  assert.equal(value<Attached>(await api.attach({ source: 'startup', client_id: 'c-2' }, agent(HERE))).spoken, 'S2');
  assert.deepEqual(runs(sql), [1, 2]);
  sql.close();
});

test('RE-ATTACHING NEVER OVERWRITES THE HANDOFF, and brings a finished run back', async () => {
  const { api, sql } = await record();
  const said = agent(HERE);
  value(await api.attach({ source: 'startup', client_id: 'c-1', doing: 'Money page' }, said));
  value(await api.handoff({ next: 'Ship the chart', tried: 'Stacked bars read as totals', note: 'Lines, not bars' }, agent({ ...HERE, client_id: 'c-1' })));
  value(await api.handoff({ state: 'done' }, agent({ ...HERE, client_id: 'c-1' })));

  const back = value<Attached>(await api.attach({ source: 'clear', client_id: 'c-1', doing: 'Money page, again' }, said));
  assert.deepEqual([back.spoken, back.resumed, back.session.state], ['S1', true, 'active']);
  assert.deepEqual(
    { next: back.session.fields.next, tried: back.session.fields.tried, notes: back.session.fields.notes, doing: back.session.fields.doing },
    { next: 'Ship the chart', tried: ['Stacked bars read as totals'], notes: ['Lines, not bars'], doing: 'Money page, again' },
  );
  sql.close();
});

test('ATTACH CHECKS WHAT IT IS GIVEN, and a token that cannot propose is refused', async () => {
  const { api, sql } = await record();
  const said = agent(HERE);
  assert.deepEqual(
    [refusal(await api.attach({} as never, said)).code, refusal(await api.attach({} as never, said)).at],
    ['ENUM_VALUE_UNKNOWN', 'source'],
  );
  assert.equal(refusal(await api.attach({ source: 'startup', client_id: 'has space' }, said)).at, 'client_id');
  assert.equal(refusal(await api.attach({ source: 'startup', doing: 'x'.repeat(281) }, said)).code, 'OUT_OF_BOUNDS');
  assert.equal(refusal(await api.attach({ source: 'startup', title: 'Doing' } as never, said)).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(await api.attach({ source: 'startup' }, agent(HERE, { scope: 'read' }))).code, 'FORBIDDEN');
  assert.deepEqual(runs(sql), []);
  sql.close();
});

/* ── handoff ─────────────────────────────────────────────────────────────── */

test('HANDOFF APPENDS tried AND note, keeps the last fifty of each, and moves state along the transitions', async () => {
  const { api, sql } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, said));

  for (let i = 1; i <= 55; i++) value(await api.handoff({ tried: `dead end ${i}`, note: `why ${i}` }, said));
  const s1 = await run(api, 'S1');
  const tried = s1.fields.tried as string[];
  const notes = s1.fields.notes as string[];
  assert.deepEqual([tried.length, tried[0], tried.at(-1)], [50, 'dead end 6', 'dead end 55']);
  assert.deepEqual([notes.length, notes[0], notes.at(-1)], [50, 'why 6', 'why 55']);

  const next = value<Entry>(await api.handoff({ next: 'Run the gates' }, said));
  assert.equal(next.fields.next, 'Run the gates');
  assert.equal((next.fields.tried as string[]).length, 50, 'a handoff without tried touched tried');

  assert.equal(value<Entry>(await api.handoff({ state: 'handoff' }, said)).state, 'handoff');
  assert.equal(refusal(await api.handoff({ state: 'idle' }, said)).code, 'TRANSITION_ILLEGAL');
  assert.equal(events(sql, s1.id).at(-1)?.actor, 'S1');
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

test('A TOKEN HANDS OFF ONLY ITS OWN RUN, and a person names the one they mean', async () => {
  const { api, sql } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, said));

  assert.deepEqual(
    [refusal(await api.handoff({ session: 'S1', next: 'x' }, said)).code, refusal(await api.handoff({ session: 'S1', next: 'x' }, said)).at],
    ['FORBIDDEN', 'session'],
  );
  assert.equal(refusal(await api.handoff({ next: 'x' }, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.handoff({}, said)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await api.handoff({ title: 'Doing' } as never, said)).code, 'FIELD_UNKNOWN');

  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'A task' } }, owner));
  assert.equal(refusal(await api.handoff({ session: `tasks#${task.seq}`, next: 'x' }, owner)).code, 'VALUE_MALFORMED');

  const picked = value<Entry>(await api.handoff({ session: 'S1', next: 'Pick up the gates', state: 'handoff' }, owner));
  assert.deepEqual([picked.fields.next, picked.state], ['Pick up the gates', 'handoff']);
  assert.equal(events(sql, picked.id).at(-1)?.actor, 'p_1');
  sql.close();
});

test('A HANDOFF FROM AN AGENT WITH NO RUN YET OPENS ONE, and lands on it', async () => {
  const { api, sql } = await record();
  const out = value<Entry>(await api.handoff({ next: 'Start with the hooks' }, agent({})));
  assert.deepEqual(runs(sql), [1]);
  assert.equal(out.fields.next, 'Start with the hooks');
  assert.deepEqual(events(sql, out.id).map((e) => e.actor), ['S1', 'S1']);
  sql.close();
});

/* ── reading runs ────────────────────────────────────────────────────────── */

test('sessionsLive DERIVES stale, age_s AND same_repo, leaves finished runs out, and opens no run', async () => {
  const { api, sql, clock } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  clock.advance(50 * MIN);
  value(await api.attach({ source: 'startup', client_id: 'c-2' }, agent({ ...HERE, repo: 'site' })));
  value(await api.attach({ source: 'startup', client_id: 'c-3' }, agent(HERE)));
  value(await api.handoff({ state: 'done' }, agent({ ...HERE, client_id: 'c-3' })));

  const live = value<LiveRun[]>(await api.sessionsLive({}, agent({ repo: 'braindog' })));
  assert.deepEqual(
    live.map((r) => [r.spoken, r.stale, r.age_s, r.same_repo]),
    [
      ['S2', false, 0, false],
      ['S1', true, 3000, true],
    ],
  );
  assert.deepEqual(runs(sql), [1, 2, 3], 'reading who is live opened a run');
  assert.equal(value<LiveRun[]>(await api.sessionsLive({}, owner)).every((r) => r.same_repo === false), true);
  sql.close();
});

test('BOOT CARRIES THE LIVE RUNS AND WHAT WAITS ON A PERSON, each held to what the caller may read', async () => {
  const { api, sql } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  const asked = value<{ id: string }>(
    await api.propose({ question: 'Add these?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ fields: { what: 'Proposed' } }] } }, owner),
  );

  const boot = value<Boot>(await api.boot(owner));
  assert.deepEqual(boot.sessions.map((s) => s.spoken), ['S1']);
  assert.deepEqual(boot.waiting.map((w) => [w.id, w.body_kind]), [[asked.id, 'rowset']]);

  const scoped = value<Boot>(await api.boot(agent(HERE, { registers: ['tasks'] })));
  assert.deepEqual(scoped.sessions, [], 'a token held to tasks read the runs');
  assert.equal(scoped.waiting.length, 1);
  sql.close();
});

test('GET ANSWERS S1, and a run the caller may not read answers as no row', async () => {
  const { api, sql } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'A task' } }, owner));

  assert.equal((await run(api, 'S1')).fields.client_id, 'c-1');
  assert.equal(value<Entry | null>(await api.get({ spoken: 'S9' }, owner)), null);
  assert.equal(value<Entry | null>(await api.get({ spoken: `tasks#${task.seq}` }, owner))?.id, task.id);
  assert.equal(value<Entry | null>(await api.get({ spoken: 'S1' }, agent(HERE, { registers: ['tasks'] }))), null);
  sql.close();
});
