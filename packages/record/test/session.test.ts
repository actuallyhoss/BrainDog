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

import { createRecordApi, type Attached, type Boot, type CallContext, type Context, type EventLine, type LiveRun, type WhatsNew } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const iso = (ms: number): string => new Date(ms).toISOString();

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

/** A list of tools with the stamp an agent's scan writes each day, as the agents pack declares one. */
const TOOLS = {
  id: 'register.tools',
  kind: 'register' as const,
  body: {
    id: 'tools',
    name: 'Tools',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'seen', label: 'Last seen', type: 'instant' },
    ],
  } as never,
};

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await api.kernel.install([TASKS, TOOLS])).ok);
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
  /* THE GRACE WINDOW (docs/02 §8) FOLDS THIS: the run's own edit lands inside the create's first three
     minutes, so it writes no second line, only the version this second write still carries. */
  assert.equal(two.version, 2);
  assert.deepEqual(events(sql, two.id).map((e) => e.actor), ['S1']);
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
  const { api, sql, clock } = await record();
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'Draft' } }, owner));
  const said = agent({ ...HERE, client_id: 'c-1' });

  refusal(await api.log({ register: 'tasks', seq: 99, note: 'Nothing here.' }, said));
  assert.deepEqual(runs(sql), []);

  value(await api.log({ register: 'tasks', seq: task.seq!, note: 'Read it through.' }, said));
  assert.deepEqual(runs(sql), [1]);
  assert.deepEqual(events(sql, task.id).at(-1), { actor: 'S1', kind: 'note', note: 'Read it through.' });

  /* AND IT MOVES THE RUN'S HEARTBEAT, with no version and no event: a run that only reads and notes
     is still working, and must not go stale for it. */
  const s1 = await run(api, 'S1');
  clock.advance(10 * MIN);
  value(await api.log({ register: 'tasks', seq: task.seq!, note: 'Read it again.' }, said));
  const later = await run(api, 'S1');
  assert.deepEqual([later.fields.last_seen, later.version], [iso(NOW + 10 * MIN), s1.version]);
  assert.deepEqual(events(sql, s1.id).map((e) => e.kind), ['create']);
  sql.close();
});

test('A TOKEN’S PROPOSAL IS SIGNED BY ITS RUN, and a person’s by the person', async () => {
  const { api, sql } = await record();
  const body = { register: 'tasks', rows: [{ fields: { what: 'Proposed' } }] };
  const mine = value<{ id: string }>(await api.propose({ question: 'Add this?', body_kind: 'rowset', body }, agent({ ...HERE, client_id: 'c-1' })));
  const theirs = value<{ id: string }>(await api.propose({ question: 'And this?', body_kind: 'rowset', body }, owner));

  const opened = value<{ opened_by: string }>(await api.governance({ id: mine.id }, owner));
  assert.equal(opened.opened_by, 'S1');
  assert.equal(value<{ opened_by: string }>(await api.governance({ id: theirs.id }, owner)).opened_by, 'p_1');
  assert.deepEqual(runs(sql), [1]);
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
  assert.deepEqual(runs(sql), [1], 'attaching opened more than the one run');
  /* AND THE BRIEFING FOR IT RIDES IN THE SAME ANSWER, so the start hook needs one call. */
  assert.deepEqual([first.context.session?.spoken, first.context.project], ['S1', null]);

  clock.advance(5 * MIN);
  const again = value<Attached>(await api.attach({ source: 'resume', client_id: 'c-1', branch: 'feature', head: '41b120e' }, agent(HERE)));
  assert.deepEqual([again.spoken, again.resumed], ['S1', true]);
  assert.deepEqual(
    { doing: again.session.fields.doing, branch: again.session.fields.branch, head: again.session.fields.head, last_seen: again.session.fields.last_seen },
    { doing: 'Wire the ladder', branch: 'feature', head: '41b120e', last_seen: iso(NOW + 5 * MIN) },
  );
  assert.deepEqual(events(sql, again.session.id).at(-1)?.actor, 'S1');
  assert.ok(events(sql, again.session.id).some((e) => e.note === 'attached: resume'));

  /* Another client is another run, S2: finding S1 again spent no number. */
  assert.equal(value<Attached>(await api.attach({ source: 'startup', client_id: 'c-2' }, agent(HERE))).spoken, 'S2');
  assert.deepEqual(runs(sql), [1, 2]);
  sql.close();
});

test('RE-ATTACHING NEVER OVERWRITES THE HANDOFF, and brings an idle run back', async () => {
  const { api, sql } = await record();
  const said = agent(HERE);
  value(await api.attach({ source: 'startup', client_id: 'c-1', doing: 'Money page' }, said));
  value(await api.handoff({ next: 'Ship the chart', tried: 'Stacked bars read as totals', note: 'Lines, not bars' }, agent({ ...HERE, client_id: 'c-1' })));
  /* Idle, not done: a run marked done leaves its next step behind, which the test below holds. */
  value(await api.handoff({ state: 'idle' }, agent({ ...HERE, client_id: 'c-1' })));

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
  /* THE GRACE WINDOW (docs/02 §8) FOLDS THIS TOO: the auto-open and the handoff that names its first next
     step land in the same write, so the run's history opens already holding it, one line signed 'S1'. */
  assert.equal(out.version, 2);
  assert.deepEqual(events(sql, out.id).map((e) => e.actor), ['S1']);
  sql.close();
});


test('A VAGUE NEXT STEP IS REFUSED, as the description says: carry on is not a step', async () => {
  const { api, sql } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, said));
  for (const next of ['carry on', 'Carry on.', 'continue', 'Keep going!', 'TBD', 'same as before', '...', 'next steps']) {
    const out = refusal(await api.handoff({ next }, said));
    assert.deepEqual([out.code, out.at], ['VALUE_MALFORMED', 'next'], next);
  }
  assert.equal((await run(api, 'S1')).fields.next, undefined);
  assert.equal(value<Entry>(await api.handoff({ next: 'Carry on with the sweep test in schedule.test.ts' }, said)).fields.next, 'Carry on with the sweep test in schedule.test.ts');
  sql.close();
});

test('A RUN MARKED DONE LEAVES ITS OLD NEXT STEP BEHIND, so the next briefing does not send anyone after it', async () => {
  const { api, sql } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, said));
  value(await api.handoff({ next: 'Wire the sweep into the purge row' }, said));
  const done = value<Entry>(await api.handoff({ state: 'done', note: 'The sweep is wired.' }, said));
  assert.deepEqual([done.state, done.fields.next], ['done', undefined]);

  const later = value<{ handoff: unknown }>(await api.context({}, agent({ ...HERE, client_id: 'c-2' })));
  assert.equal(later.handoff, null, 'a finished run handed on the step it finished');

  /* A run that finishes and names a next step in the same call leaves that one. */
  value(await api.attach({ source: 'startup', client_id: 'c-3' }, agent({ ...HERE, client_id: 'c-3' })));
  const left = value<Entry>(await api.handoff({ state: 'done', next: 'Tag the release once CI is green' }, agent({ ...HERE, client_id: 'c-3' })));
  assert.equal(left.fields.next, 'Tag the release once CI is green');
  sql.close();
});

test('A STATE THE CALLER NAMED IS THE STATE IT GETS, and a quiet run only revives when no state was named', async () => {
  const { api, sql } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, said));

  /* A RUN THAT WENT QUIET CAN STILL HAND OFF. `handoff` is exempt from the twelve-hour sweep and `idle`
     is not, so turning one into the other is not a smaller version of the same thing: it is the
     difference between a run someone picks up and a run that is swept away. */
  assert.equal(value<Entry>(await api.handoff({ state: 'idle' }, said)).state, 'idle');
  assert.equal(value<Entry>(await api.handoff({ state: 'handoff' }, said)).state, 'handoff');

  /* AND IT CAN STILL FINISH. A second run, so the first keeps its own history. */
  const two = agent({ ...HERE, client_id: 'c-2' });
  value(await api.attach({ source: 'startup', client_id: 'c-2' }, two));
  assert.equal(value<Entry>(await api.handoff({ state: 'idle' }, two)).state, 'idle');
  assert.equal(value<Entry>(await api.handoff({ state: 'done', note: 'Nothing came of it.' }, two)).state, 'done');

  /* REVIVAL IS FOR THE CALL THAT NAMES NO STATE: a token writing a handoff is working again. */
  const three = agent({ ...HERE, client_id: 'c-3' });
  value(await api.attach({ source: 'startup', client_id: 'c-3' }, three));
  value(await api.handoff({ state: 'idle' }, three));
  assert.equal(value<Entry>(await api.handoff({ next: 'Read the gate output' }, three)).state, 'active');
  sql.close();
});

test('A REFUSED HANDOFF OPENS NO RUN, because the run it writes to is part of the write', async () => {
  const { api, sql } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  /* THE CHEAPEST WAY IN IS A STATE NOBODY DECLARED, refused by the kernel inside the write. The run
     this call had to open to have somewhere to write must go back with it, or three retries of one
     malformed call leave three runs, each active and each in the next briefing. */
  const bad = refusal(await api.handoff({ state: 'banana', next: 'Read the gate output' }, said));
  assert.deepEqual([bad.code, bad.at], ['ENUM_VALUE_UNKNOWN', 'state']);
  assert.deepEqual(value<{ rows: Entry[] }>(await api.list({ register: 'session' }, owner)).rows, []);
  /* AND THE SAME CALL MADE WELL STILL OPENS ONE, so the rollback is not a refusal to work. */
  assert.equal(value<Entry>(await api.handoff({ state: 'idle', next: 'Read the gate output' }, said)).state, 'idle');
  assert.equal(value<{ rows: Entry[] }>(await api.list({ register: 'session' }, owner)).rows.length, 1);
  sql.close();
});

/* ── whose run it is ─────────────────────────────────────────────────────── */

/** Another token's call: `tok_2` of another person, or `tok_3`, the same person's narrower key. */
const as = (id: string, person: string, scope: 'read' | 'propose' | 'write', session: CallContext['session'] = {}): CallContext => ({
  principal: { kind: 'token', id, scope, person, level: person === 'p_1' ? 'owner' : 'write' },
  session,
});

test('A RUN BELONGS TO THE TOKEN THAT OPENED IT: another person’s token names it and is refused', async () => {
  const { api, sql } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent({ ...HERE, client_id: 'c-1' })));
  const before = await run(api, 'S1');

  const stranger = as('tok_2', 'p_2', 'write', { spoken: 'S1' });
  const write = refusal(await api.create({ register: 'tasks', fields: { what: 'Signed as S1' } }, stranger));
  assert.deepEqual([write.code, write.at], ['FORBIDDEN', 'session']);
  assert.equal(refusal(await api.handoff({ next: 'Rewrite the gates in Rust' }, stranger)).code, 'FORBIDDEN');
  assert.equal(refusal(await api.attach({ source: 'startup' }, stranger)).code, 'FORBIDDEN');
  const direct = refusal(await api.update({ register: 'session', seq: 1, patch: { next: 'Delete the record' } }, as('tok_2', 'p_2', 'write')));
  assert.equal(direct.code, 'FORBIDDEN');

  const after = await run(api, 'S1');
  assert.deepEqual([after.version, after.fields.next], [before.version, before.fields.next]);
  assert.deepEqual(runs(sql), [1]);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'tasks'")!.n, 0);
  sql.close();
});

test('A NARROWER TOKEN OF THE SAME PERSON is not the run its wider key opened, by client id or by name', async () => {
  const { api, sql } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent({ ...HERE, client_id: 'c-1' })));

  const narrow = as('tok_3', 'p_1', 'propose', { ...HERE, client_id: 'c-1' });
  const out = refusal(await api.handoff({ next: 'Ship it' }, narrow));
  assert.deepEqual([out.code, out.at], ['FORBIDDEN', 'session']);
  assert.equal(refusal(await api.attach({ source: 'resume', client_id: 'c-1' }, narrow)).code, 'FORBIDDEN');
  assert.equal(refusal(await api.handoff({ next: 'Ship it' }, as('tok_3', 'p_1', 'propose', { spoken: 'S1' }))).code, 'FORBIDDEN');
  assert.equal((await run(api, 'S1')).fields.next, undefined);
  assert.deepEqual(runs(sql), [1]);

  /* The briefing does not tell the narrower key that S1 is its own run. */
  const ctx = value<{ session: { spoken: string } | null }>(await api.context({}, as('tok_3', 'p_1', 'propose', { spoken: 'S1' })));
  assert.equal(ctx.session, null);
  sql.close();
});

test('A NAMED RUN THAT IS FINISHED is still dropped, and the caller opens its own', async () => {
  const { api, sql } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent({ ...HERE, client_id: 'c-1' })));
  value(await api.handoff({ session: 'S1', state: 'done' }, owner));
  const out = value<Entry>(await api.handoff({ next: 'Pick up the sweep' }, as('tok_2', 'p_2', 'propose', { spoken: 'S1' })));
  assert.equal(out.seq, 2);
  assert.equal(out.fields.token_id, 'tok_2');
  sql.close();
});

test('A MACHINE AND REPO COLLISION adopts no other token’s run: a propose key on the same checkout opens its own', async () => {
  const { api, sql } = await record();
  value(await api.create({ register: 'tasks', fields: { what: 'Mine' } }, agent(HERE)));
  const s1 = await run(api, 'S1');

  const narrow = as('tok_3', 'p_1', 'propose', HERE);
  const handed = value<Entry>(await api.handoff({ next: 'Review the diff' }, narrow));
  assert.equal(handed.seq, 2, 'the propose key’s handoff landed in the write key’s run');
  assert.equal(handed.fields.token_id, 'tok_3');
  value(await api.create({ register: 'tasks', fields: { what: 'Theirs' } }, as('tok_2', 'p_2', 'write', HERE)));
  assert.deepEqual(runs(sql), [1, 2, 3]);
  assert.equal((await run(api, 'S1')).version, s1.version);

  /* And its own key still finds S1. */
  value(await api.create({ register: 'tasks', fields: { what: 'Mine again' } }, agent(HERE)));
  assert.deepEqual(runs(sql), [1, 2, 3]);
  sql.close();
});

/* ── reading runs ────────────────────────────────────────────────────────── */

test('sessionsLive DERIVES stale, quiet, age_s, ran_s AND same_repo, leaves finished runs out, and opens no run', async () => {
  const { api, sql, clock } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  clock.advance(50 * MIN);
  value(await api.attach({ source: 'startup', client_id: 'c-2' }, agent({ ...HERE, repo: 'site' })));
  value(await api.attach({ source: 'startup', client_id: 'c-3' }, agent(HERE)));
  value(await api.handoff({ state: 'done' }, agent({ ...HERE, client_id: 'c-3' })));

  const live = value<LiveRun[]>(await api.sessionsLive({}, agent({ repo: 'braindog' })));
  assert.deepEqual(
    live.map((r) => [r.spoken, r.stale, r.quiet, r.age_s, r.ran_s, r.same_repo]),
    [
      /* S1 has been silent fifty minutes: it is stale, and `live` leaves a stale run out (AGT-C02). */
      ['S2', false, false, 0, 0, false],
    ],
  );
  assert.deepEqual(runs(sql), [1, 2, 3], 'reading who is live opened a run');
  assert.equal(value<LiveRun[]>(await api.sessionsLive({}, owner)).every((r) => r.same_repo === false), true);

  /* Quiet is thirty minutes, before the ladder's forty-five: told first, guessed past later. */
  clock.advance(31 * MIN);
  const later = value<LiveRun[]>(await api.sessionsLive({}, owner)).find((r) => r.spoken === 'S2');
  assert.deepEqual([later?.state, later?.quiet, later?.stale, later?.ran_s], ['active', true, false, 0]);
  /* And the briefing leaves out S1, eighty-one minutes silent and so stale (AGT-C02): a dead run is not live. */
  const ctx = value<Context>(await api.context({}, agent({ ...HERE, client_id: 'c-9' })));
  assert.deepEqual(ctx.live.same_repo.map((r) => [r.spoken, r.quiet]), []);
  sql.close();
});

/* ── what a run is called ────────────────────────────────────────────────── */

test('ATTACH NAMES A RUN THE RECORD NAMED AGAIN, and what the agent says it is doing names it outright, cut to sixty', async () => {
  const { api, sql, clock } = await record();
  /* The start hook, with git too slow to answer: the session and its machine, and nothing of the repository. */
  const opened = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-1' }, agent({ host: 'dev-pc', agent: 'claude' })));
  assert.equal(opened.session.fields.doing, 'Claude run');

  /* A compaction comes back with where it is, and the record names the run for it. */
  clock.advance(5 * MIN);
  const back = value<Attached>(await api.attach({ source: 'compact', client_id: 'c-1' }, agent(HERE)));
  assert.equal(back.session.fields.doing, 'Claude in braindog');

  /* The agent says what it is doing, and that is the run's name from then on, at sixty characters at most. */
  const said = 'Rewrite the briefing so that it leads with the next step, and names each project once';
  const named = value<Entry>(await api.handoff({ doing: said }, agent({ ...HERE, client_id: 'c-1' })));
  assert.equal(named.fields.doing, 'Rewrite the briefing so that it leads with the next step…');
  clock.advance(5 * MIN);
  const again = value<Attached>(await api.attach({ source: 'resume', client_id: 'c-1' }, agent({ ...HERE, repo: 'site' })));
  assert.equal(again.session.fields.doing, named.fields.doing, 'a re-attach renamed a run its agent had named');
  sql.close();
});

test('A CLIENT THAT NAMES NO AGENT NEVER MAKES A CLAUDE RUN NAMELESS, and one that names its client gives the run its kind', async () => {
  const { api, sql, clock } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  clock.advance(MIN);
  const back = value<Attached>(await api.attach({ source: 'resume', client_id: 'c-1' }, agent({ ...HERE, agent: 'other' })));
  assert.equal(back.session.fields.agent, 'claude');

  /* A remote client that says only what it is: MCP's `clientInfo`, as the host hands it on. */
  const remote = value<Attached>(await api.attach({ source: 'startup', client_id: 'c-2' }, agent({ client: 'claude-ai', client_version: '1.0.0' })));
  assert.deepEqual([remote.session.fields.agent, remote.session.fields.doing], ['claude', 'Claude run']);
  sql.close();
});

test('A CALL THAT NAMES NO RUN IS TOLD THE RUN IT BELONGS TO: context finds the token’s open run, and a write lands in it', async () => {
  const { api, sql, clock } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  clock.advance(MIN);
  const ctx = value<Context>(await api.context({}, agent({})));
  assert.equal(ctx.session?.spoken, 'S1');
  value(await api.create({ register: 'tasks', fields: { what: 'From a scratch folder' } }, agent({ host: 'dev-pc', cwd: '/tmp/scratch' })));
  assert.deepEqual(runs(sql), [1]);
  sql.close();
});

/* ── what changed, and what is bookkeeping ───────────────────────────────── */

test('WHAT CHANGED LEAVES OUT THE RECORD’S BOOKKEEPING: the sweep and a tool’s seen stamp stay in the log, out of recentHistory and whatsNew', async () => {
  const { api, sql, clock } = await record();
  const said = agent({ ...HERE, client_id: 'c-1' });
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'Ship the brief' } }, said));
  /* The scan records a tool with the moment it saw it, and stamps it again a day later. */
  const tool = value<Entry>(await api.create({ register: 'tools', fields: { name: 'fly-prism', seen: iso(clock.now()) } }, said));
  clock.advance(25 * HOUR);
  value(await api.update({ register: 'tools', seq: tool.seq!, patch: { seen: iso(clock.now()) } }, said));
  /* Twelve hours of silence later the hourly row writes the run off. */
  clock.advance(13 * HOUR);
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01J00000000000000000000001', ?, 'purge', 'sweep', '{}', 'pending', 0)",
    iso(clock.now()),
  );
  assert.equal((await api.kernel.drain()).done, 1);
  assert.equal((await run(api, 'S1')).state, 'abandoned');

  const quiet = (line: EventLine): boolean => (line.actor === 'system' && line.kind === 'state') || line.field === 'seen';
  const page = value<{ events: EventLine[] }>(await api.recentHistory({}, owner)).events;
  assert.deepEqual(page.filter(quiet), [], 'the record’s bookkeeping is a line of what changed');
  assert.ok(page.some((line) => line.target === `entry:${task.id}`), 'what changed went with it');
  assert.deepEqual(value<WhatsNew>(await api.whatsNew({}, owner)).events.filter(quiet), []);

  /* Everything is still there for whoever asks, and in the run's own history. */
  const all = value<{ events: EventLine[] }>(await api.recentHistory({ everything: true }, owner)).events;
  assert.deepEqual(all.filter(quiet).map((line) => [line.actor, line.kind, line.field]), [['system', 'state', 'state'], ['S1', 'edit', 'seen']]);
  assert.equal(value<{ events: EventLine[] }>(await api.recentHistory({ everything: 'true' } as never, owner)).events.filter(quiet).length, 2);
  assert.ok(value<{ note: string | null }[]>(await api.history({ register: 'session', seq: 1 }, owner)).some((e) => e.note === 'Nothing heard from this run in twelve hours.'));
  assert.equal(refusal(await api.recentHistory({ everything: 'yes' } as never, owner)).at, 'everything');
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
  /* WITH ITS QUESTION, which is the `suggest` event's and not a column: an id alone is nothing a
     person can answer. */
  assert.deepEqual(boot.waiting.map((w) => [w.id, w.body_kind, w.question]), [[asked.id, 'rowset', 'Add these?']]);

  const scoped = value<Boot>(await api.boot(agent(HERE, { registers: ['tasks'] })));
  assert.deepEqual(scoped.sessions, [], 'a token held to tasks read the runs');
  assert.equal(scoped.waiting.length, 1);
  sql.close();
});

test('GET ANSWERS S1, and a prefix the caller reads no register of is one no register has', async () => {
  const { api, sql } = await record();
  value(await api.attach({ source: 'startup', client_id: 'c-1' }, agent(HERE)));
  const task = value<Entry>(await api.create({ register: 'tasks', fields: { what: 'A task' } }, owner));

  assert.equal((await run(api, 'S1')).fields.client_id, 'c-1');
  assert.equal(value<Entry | null>(await api.get({ spoken: 'S9' }, owner)), null);
  assert.equal(value<Entry | null>(await api.get({ spoken: `tasks#${task.seq}` }, owner))?.id, task.id);

  /* THE SAME REFUSAL FOR A PREFIX NOBODY HAS AND FOR ONE THE CALLER CANNOT READ, so the answer says
     nothing about which registers exist. SG and D are sent to governance. */
  const held = refusal(await api.get({ spoken: 'S1' }, agent(HERE, { registers: ['tasks'] })));
  const none = refusal(await api.get({ spoken: 'LN7' }, owner));
  assert.deepEqual([held.code, held.at, none.code], ['REGISTER_UNKNOWN', 'spoken', 'REGISTER_UNKNOWN']);
  assert.match(refusal(await api.get({ spoken: 'SG12' }, owner)).fix, /governance/);
  sql.close();
});
