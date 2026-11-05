/**
 * What he tells an agent (`src/instruction.ts`, migration 42): who it reaches, taken by one run, answered by that run,
 * stopped and resumed, redirected, withdrawn, expired, and the stamp that says something moved. And the pulse that
 * says a session is open (`presence.ts`).
 *
 * On the real kernel and `node:sqlite`, through the kernel's own methods, as the record's will call them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CALL_MS, GONE_MS, THINKING_MS, liveStateOf, openRecord, type Declaration, type Instr, type SessionHints, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 21, 12);
const MIN = 60_000;
const DAY = 86_400_000;

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

const OWNER: WriteContext = { actor: 'p_1', principal: { kind: 'person' } };
const as = (client_id: string, more: SessionHints = {}): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', repo: 'braindog', ...more },
});

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.refusal ? `${x.refusal.code}: ${x.refusal.fix}` : JSON.stringify(r));
  return x.value;
};
const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};
const ids = (list: Instr[]): string[] => list.map((i) => i.id);

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  value(await k.install([TASKS]));
  /** A session that works here and is still at it: its spoken name. */
  const work = (client: string, more: SessionHints = {}): string => {
    value(k.create('tasks', { what: `Work of ${client}` }, as(client, more)));
    const run = k.findRun({ client_id: client }, 't_1')!;
    return `S${String(run.seq)}`;
  };
  return { sql, clock, k, work };
}

/** The hourly sweep, due now, as `session.test.ts` arms it. */
async function sweep(sql: NodeSql, k: Awaited<ReturnType<typeof record>>['k'], at: number): Promise<void> {
  sql.exec(
    "INSERT OR IGNORE INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('01J00000000000000000000001', ?, 'purge', 'sweep', '{}', 'pending', 0)",
    new Date(at).toISOString(),
  );
  sql.exec("UPDATE schedule SET state = 'pending', attempts = 0, due_at = ? WHERE kind = 'purge' AND key = 'sweep'", new Date(at).toISOString());
  assert.ok((await k.drain()).done >= 1);
}

/* ── only a person tells ─────────────────────────────────────────────────── */

test('ONLY A PERSON TELLS: a token is refused, and how one was delivered or answered is the kernel’s alone', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one');
  assert.equal(refusal(k.instruct(as('one'), { said: 'Merge it', to_run: s1 })).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(refusal(k.create('instructions', { said: 'Merge it' }, as('one'))).code, 'NEEDS_BROWSER_SESSION');
  const told = value<Instr>(k.instruct(OWNER, { said: 'Merge it', to_run: s1 }));
  assert.equal(told.id, 'IN1');
  assert.equal(told.by, 'p_1');
  for (const key of ['state', 'seen_by', 'taken_by', 'reply'])
    assert.equal(refusal(k.update('instructions', 'IN1', { [key]: 'done' }, OWNER)).code, 'IMMUTABLE_FIELD', `${key} was written`);
  assert.equal(refusal(k.update('instructions', 'IN1', { said: 'Merged?' }, as('one'))).code, 'NEEDS_BROWSER_SESSION');
  /* HIS OWN WORDS, fixed before a run has seen them; after, only a withdraw. */
  value(k.update('instructions', 'IN1', { said: 'Merge it now' }, OWNER));
  value(k.seenInstruction('IN1', s1, 'prompt'));
  assert.equal(refusal(k.update('instructions', 'IN1', { said: 'Something else' }, OWNER)).code, 'FORBIDDEN');
  assert.equal(refusal(k.instruct(OWNER, { said: '  ' })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(k.instruct(OWNER, { said: 'x', to: 'run' })).code, 'REQUIRED_MISSING');
  assert.equal(refusal(k.instruct(OWNER, { said: 'x', to_run: 'S99' })).code, 'ROW_UNKNOWN');
  /* AND THE APP'S UNDO, a person deleting what he just sent, still goes through. */
  value(k.update('instructions', 'IN1', { deleted_at: '2026-10-21' }, OWNER));
  assert.equal(k.instruction('IN1'), null);
  sql.close();
});

/* ── who it reaches ──────────────────────────────────────────────────────── */

test('TO A RUN: that run alone, taken as it first sees it, answered by it, and its hand emptied', async () => {
  const { k, sql, clock, work } = await record();
  const s1 = work('one');
  const s2 = work('two');
  value(k.instruct(OWNER, { said: 'Merge wave 1, then stop', to_run: s1 }));
  assert.deepEqual(ids(k.instructionFor({}, s1)), ['IN1']);
  assert.deepEqual(ids(k.instructionFor({}, s2)), []);
  assert.equal(refusal(k.seenInstruction('IN1', s2, 'prompt')).code, 'ROW_UNKNOWN', 'another run saw it');

  clock.advance(MIN);
  const seen = value<Instr>(k.seenInstruction('IN1', s1, 'prompt'));
  assert.deepEqual([seen.state, seen.seen_by, seen.seen_how, seen.taken_by], ['working', s1, 'prompt', s1]);
  assert.equal(k.get(s1)?.fields.instruction, 'IN1');
  assert.deepEqual(k.instructionSeen('IN1').map((r) => [r.run, r.how]), [[s1, 'prompt']]);

  assert.equal(refusal(k.replyInstruction('IN1', s2, { said: 'Done' })).code, 'FORBIDDEN');
  assert.equal(refusal(k.replyInstruction('IN1', s1, { said: '', state: 'needs_you' })).code, 'REQUIRED_MISSING');
  const done = value<Instr>(k.replyInstruction('IN1', s1, { said: 'Merged W1-A..E, 3 commits, check green.' }));
  assert.deepEqual([done.state, done.reply], ['done', 'Merged W1-A..E, 3 commits, check green.']);
  assert.equal(k.get(s1)?.fields.instruction, undefined);
  assert.deepEqual(ids(k.instructionFor({}, s1)), []);
  /* SIGNED BY THE RUN, never as his press. */
  const lines = sql.all<{ actor: string; kind: string }>(
    "SELECT actor, kind FROM event WHERE target = ? ORDER BY rowid",
    `entry:${done.row}`,
  );
  assert.deepEqual(lines.map((l) => l.actor), ['p_1', s1, s1]);
  sql.close();
});

test('TO AN AGENT KIND: "next start" reaches a run of that kind that starts there after, "now" every open one there', async () => {
  const { k, sql, clock, work } = await record();
  const before = work('before');
  const codex = work('codex', { agent: 'codex' });
  const elsewhere = work('elsewhere', { repo: 'lanternfish' });
  clock.advance(MIN);
  value(k.instruct(OWNER, { said: 'Read the plan first', to_agent: 'claude', repo: 'braindog' }));
  clock.advance(MIN);
  const after = work('after');
  assert.deepEqual(ids(k.instructionFor({}, before)), [], 'a run that started before "next start" was told it');
  assert.deepEqual(ids(k.instructionFor({}, after)), ['IN1']);
  assert.deepEqual(ids(k.instructionFor({}, codex)), []);
  assert.deepEqual(ids(k.instructionFor({}, elsewhere)), []);

  value(k.instruct(OWNER, { said: 'Stop pushing to master', to_agent: 'claude', repo: 'braindog', when: 'now' }));
  assert.deepEqual(ids(k.instructionFor({}, before)), ['IN2']);
  assert.deepEqual(ids(k.instructionFor({}, after)), ['IN1', 'IN2']);
  assert.deepEqual(ids(k.instructionFor({}, elsewhere)), []);

  /* AND A RUN ALREADY OPEN IS TOLD "NEXT START" AT ITS NEXT CALL, which moves its last_seen; a pulse is not one. */
  clock.advance(MIN);
  k.pulseRun(before);
  assert.deepEqual(ids(k.instructionFor({}, before)), ['IN2'], 'the bridge pulse alone told it');
  work('before');
  assert.deepEqual(ids(k.instructionFor({}, before)), ['IN1', 'IN2']);
  assert.deepEqual(ids(k.instructionFor({}, codex)), [], 'another kind of agent was told');
  sql.close();
});

test('TAKEN BY ONE, compare and set: the second run is told who has it, and no longer sees it', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one');
  const s2 = work('two');
  value(k.instruct(OWNER, { said: 'Someone run the gates', when: 'now', repo: 'braindog' }));
  value(k.seenInstruction('IN1', s1, 'tool'));
  value(k.seenInstruction('IN1', s2, 'start'));
  assert.deepEqual(k.instructionSeen('IN1').map((r) => r.run).sort(), [s1, s2].sort());
  assert.equal(k.instruction('IN1')?.state, 'seen');
  assert.equal(k.instruction('IN1')?.seen_by, s1, 'the first to see it is its seen_by');

  const took = value<Instr>(k.takeInstruction('IN1', s2));
  assert.deepEqual([took.state, took.taken_by], ['working', s2]);
  const second = refusal(k.takeInstruction('IN1', s1));
  assert.equal(second.code, 'TRANSITION_ILLEGAL');
  assert.match(second.fix, new RegExp(`^${s2} has it`));
  assert.equal(value<Instr>(k.takeInstruction('IN1', s2)).taken_by, s2, 'taking it again is answered as it stands');
  assert.deepEqual(ids(k.instructionFor({}, s1)), []);
  assert.deepEqual(ids(k.instructionFor({}, s2)), ['IN1']);
  sql.close();
});

test('TO A TASK: the run holding the task, and while one does, no other', async () => {
  const { k, sql, work } = await record();
  const holder = work('holder');
  const other = work('other');
  /* `task` is the record's to write (wave 2's handoff); planted here as the record would stamp it. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.task', 'tasks#1') WHERE register = 'session' AND seq = ?", Number(holder.slice(1)));
  value(k.instruct(OWNER, { said: 'Ship it behind the flag', task: 'tasks#1', to_agent: 'claude', when: 'now' }));
  assert.deepEqual(ids(k.instructionFor({}, holder)), ['IN1']);
  assert.deepEqual(ids(k.instructionFor({}, other)), [], 'a run that does not hold the task was told while another holds it');
  /* Once nobody holds it, the next run of the task's lane is. */
  sql.exec("UPDATE entry SET fields = json_remove(fields, '$.task') WHERE register = 'session'");
  assert.deepEqual(ids(k.instructionFor({}, other)), ['IN1']);
  sql.close();
});

/* ── stop, pause, resume, redirect, withdraw ─────────────────────────────── */

test('STOP: the run is marked stopped at once, its helpers obey it, a resume lifts it', async () => {
  const { k, sql, work } = await record();
  const s1 = work('lead');
  const helper = work('helper', { parent: s1 });
  value(k.instruct(OWNER, { said: 'Tell me before you merge', to_run: s1 }));
  assert.deepEqual(ids(k.instructionFor({}, helper)), [], 'a helper was told a tell');

  value(k.instruct(OWNER, { said: 'Stop: the plan changed', kind: 'stop', to_run: s1 }));
  assert.equal(k.get(s1)?.fields.stopped, 'stop');
  assert.deepEqual(k.stopOf(s1), { kind: 'stop', id: 'IN2', said: 'Stop: the plan changed' });
  assert.deepEqual(k.stopOf(helper), { kind: 'stop', id: 'IN2', said: 'Stop: the plan changed' }, 'a helper did not obey its parent’s stop');
  assert.deepEqual(ids(k.instructionFor({}, s1)), ['IN2', 'IN1'], 'a stop is not first');
  value(k.seenInstruction('IN2', s1, 'tool'));
  value(k.replyInstruction('IN2', s1, { said: 'Stopped, nothing pushed.' }));
  assert.equal(k.get(s1)?.fields.stopped, 'stop', 'answering a stop is not a resume');

  assert.equal(refusal(k.instruct(OWNER, { said: 'Go on', kind: 'resume', to_run: helper })).code, 'TRANSITION_ILLEGAL');
  value(k.instruct(OWNER, { said: 'Go on', kind: 'resume', to_run: s1 }));
  assert.equal(k.get(s1)?.fields.stopped, undefined);
  assert.equal(k.stopOf(s1), null);
  assert.equal(k.stopOf(helper), null);
  /* A resume asks nothing of the run: seen, it is done. */
  assert.equal(value<Instr>(k.seenInstruction('IN3', s1, 'prompt')).state, 'done');

  /* A PAUSE WITHDRAWN BEFORE IT IS SEEN lifts the run with it. */
  value(k.instruct(OWNER, { said: 'Hold on', kind: 'pause', to_run: s1 }));
  assert.equal(k.stopOf(s1)?.kind, 'pause');
  value(k.withdrawInstruction(OWNER, 'IN4'));
  assert.equal(k.stopOf(s1), null);
  sql.close();
});

test('REDIRECT: what it had ends Declined, and the new word goes to the same run', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one');
  value(k.instruct(OWNER, { said: 'Write the tests', to_run: s1 }));
  value(k.seenInstruction('IN1', s1, 'prompt'));
  const next = value<Instr>(k.instruct(OWNER, { said: 'Fix the gate first', kind: 'redirect', replaces: 'IN1' }));
  assert.deepEqual([next.to, next.to_run, next.replaces, next.when], ['run', s1, 'IN1', 'now']);
  assert.equal(k.instruction('IN1')?.state, 'declined');
  assert.equal(value<Instr>(k.seenInstruction('IN2', s1, 'tool')).taken_by, s1);
  assert.equal(refusal(k.instruct(OWNER, { said: 'Again', kind: 'redirect', replaces: 'IN1' })).code, 'TRANSITION_ILLEGAL');
  sql.close();
});

test('WITHDRAW: before a run takes it, and never after', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one');
  value(k.instruct(OWNER, { said: 'One', when: 'now', repo: 'braindog' }));
  value(k.instruct(OWNER, { said: 'Two', when: 'now', repo: 'braindog' }));
  assert.equal(value<Instr>(k.withdrawInstruction(OWNER, 'IN1')).state, 'withdrawn');
  assert.deepEqual(ids(k.instructionFor({}, s1)), ['IN2']);
  value(k.takeInstruction('IN2', s1));
  assert.equal(refusal(k.withdrawInstruction(OWNER, 'IN2')).code, 'TRANSITION_ILLEGAL');
  assert.equal(refusal(k.withdrawInstruction(as('one'), 'IN2')).code, 'NEEDS_BROWSER_SESSION');
  sql.close();
});

test('NEEDS YOU: a run asks, and answers again once he has replied', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one');
  value(k.instruct(OWNER, { said: 'Deploy when green', to_run: s1 }));
  const asked = value<Instr>(k.replyInstruction('IN1', s1, { said: 'Which region?', state: 'needs_you' }));
  assert.deepEqual([asked.state, asked.taken_by, asked.reply], ['needs_you', s1, 'Which region?']);
  assert.equal(k.get(s1)?.fields.instruction, 'IN1', 'a run waiting on him still holds it');
  const done = value<Instr>(k.replyInstruction('IN1', s1, { said: 'Deployed to eu.' }));
  assert.deepEqual([done.state, done.reply], ['done', 'Deployed to eu.']);
  assert.equal(refusal(k.replyInstruction('IN1', s1, { said: 'Again' })).code, 'TRANSITION_ILLEGAL');
  sql.close();
});

/* ── the stamp ───────────────────────────────────────────────────────────── */

test('THE STAMP moves with anything for the run, and changedSince says what', async () => {
  const { k, sql, clock, work } = await record();
  const s1 = work('one');
  const quiet = k.stampFor(s1);
  assert.deepEqual(k.changedSince(s1, quiet), { stamp: quiet, changed: false, pending: [], stop: null });
  clock.advance(MIN);
  value(k.instruct(OWNER, { said: 'Merge it', to_run: s1 }));
  const told = k.stampFor(s1);
  assert.notEqual(told, quiet);
  const delta = k.changedSince(s1, quiet);
  assert.deepEqual([delta.changed, ids(delta.pending), delta.stamp], [true, ['IN1'], told]);
  assert.equal(k.changedSince(s1, told).changed, false);
  assert.deepEqual(ids(k.changedSince(s1, 'not a stamp').pending), ['IN1'], 'a stamp this kernel did not make gets everything open');

  clock.advance(MIN);
  value(k.instruct(OWNER, { said: 'Wait', kind: 'pause', to_run: s1 }));
  const paused = k.changedSince(s1, told);
  assert.deepEqual([ids(paused.pending), paused.stop?.kind], [['IN2'], 'pause'], 'only what moved since the stamp is new');
  sql.close();
});

/* ── the sweep ───────────────────────────────────────────────────────────── */

test('THE SWEEP: one no run took expires, and one to a run that ended unseen goes to the next run there', async () => {
  const { k, sql, clock, work } = await record();
  const s1 = work('one');
  value(k.instruct(OWNER, { said: 'Somebody tidy the docs', repo: 'braindog' }));
  value(k.instruct(OWNER, { said: 'Rebase onto master', to_run: s1 }));
  value(k.endRun(as('one'), {}));
  await sweep(sql, k, clock.now());
  const moved = k.instruction('IN2')!;
  assert.deepEqual([moved.state, moved.to, moved.when, moved.to_agent], ['sent', 'agent', 'next', 'claude']);
  const note = sql.one<{ note: string; actor: string }>(
    "SELECT note, actor FROM event WHERE target = ? AND note IS NOT NULL ORDER BY rowid DESC LIMIT 1",
    `entry:${moved.row}`,
  );
  assert.deepEqual({ ...note }, { note: `${s1} ended before it saw this; it goes to the next run.`, actor: 'system' });
  clock.advance(MIN);
  const s2 = work('two');
  assert.deepEqual(ids(k.instructionFor({}, s2)), ['IN1', 'IN2']);

  clock.advance(15 * DAY);
  await sweep(sql, k, clock.now());
  assert.deepEqual([k.instruction('IN1')?.state, k.instruction('IN2')?.state], ['expired', 'expired']);
  sql.close();
});

/* ── the pulse, and live presence ────────────────────────────────────────── */

test('THE PULSE moves pulse_at in place, at most once in ten seconds, and never revives a run', async () => {
  const { k, sql, clock, work } = await record();
  const s1 = work('one');
  const row = () => sql.one<{ version: number; updated_at: string; fields: string }>("SELECT version, updated_at, fields FROM entry WHERE register = 'session' AND seq = 1")!;
  const was = row();
  const lines = sql.all('SELECT id FROM event').length;
  clock.advance(15_000);
  assert.equal(k.pulseRun(s1), true);
  assert.equal(JSON.parse(row().fields).pulse_at, new Date(clock.now()).toISOString());
  assert.deepEqual([row().version, row().updated_at], [was.version, was.updated_at], 'a pulse is not a write');
  assert.equal(sql.all('SELECT id FROM event').length, lines, 'a pulse wrote a line');
  clock.advance(5_000);
  assert.equal(k.pulseRun(s1), false, 'a pulse inside ten seconds moved');
  assert.equal(k.pulseRun('S99'), false);
  value(k.endRun(as('one'), {}));
  clock.advance(15_000);
  assert.equal(k.pulseRun(s1), false, 'a pulse revived an ended run');
  sql.close();
});

test('LIVE PRESENCE: working, thinking, waiting on you, gone, ended', () => {
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  const open = (call: number, pulse?: number) => ({ state: 'active', fields: { last_seen: at(call), ...(pulse === undefined ? {} : { pulse_at: at(pulse) }) } });
  assert.equal(liveStateOf(open(CALL_MS - 1, 0), NOW), 'working');
  assert.equal(liveStateOf(open(CALL_MS + 1, 0), NOW), 'thinking');
  assert.equal(liveStateOf(open(THINKING_MS + 1, 0), NOW), 'waiting');
  assert.equal(liveStateOf(open(THINKING_MS + 1, GONE_MS + 1), NOW), 'gone');
  assert.equal(liveStateOf({ state: 'done', fields: { last_seen: at(0) } }, NOW), 'ended');
  /* A BRIDGE FROM BEFORE THE PULSE is read by its calls alone, open while the ladder would still adopt it. */
  assert.equal(liveStateOf(open(20 * 60_000), NOW), 'waiting');
  assert.equal(liveStateOf(open(50 * 60_000), NOW), 'gone');
  /* AN IDLE RUN WAITS ON HIM however lately it called, and a stale pulse is gone even beside a fresh call, so the live
     read and the rail's count (`presenceOf`) agree on who is at work. */
  assert.equal(liveStateOf({ state: 'idle', fields: { last_seen: at(0), pulse_at: at(0) } }, NOW), 'waiting');
  assert.equal(liveStateOf(open(0, GONE_MS + 1), NOW), 'gone');
});

test('AND THE RECORD STAMPS THE WORKTREE a run opened in, which no caller writes', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one', { worktree: '/home/ada/code/braindog/.claude/worktrees/agent-a' });
  assert.equal(k.get(s1)?.fields.worktree, '/home/ada/code/braindog/.claude/worktrees/agent-a');
  assert.equal(refusal(k.update('session', s1, { worktree: '/elsewhere' }, as('one'))).code, 'IMMUTABLE_FIELD');
  assert.deepEqual(k.presentRuns().map((r) => `S${String(r.seq)}`), [s1]);
  sql.close();
});

test('ON A MACHINE, AS A PROFILE: an instruction naming either reaches only the runs that are both, and one to a run keeps neither', async () => {
  const { k, sql, work } = await record();
  const harbour = work('harbour', { host: 'kiln-mbp', seat: 'harbour' });
  const studio = work('studio', { host: 'kiln-studio', seat: 'harbour' });
  const plain = work('plain', { host: 'kiln-mbp', seat: 'default' });
  const ids = (run: string) => k.instructionFor({}, run).map((i) => i.id);

  const both = value<Instr>(k.instruct(OWNER, { said: 'Ship the invoice page', to: 'anyone', when: 'now', machine: 'kiln-mbp', seat: 'harbour' }));
  assert.deepEqual([both.machine, both.seat], ['kiln-mbp', 'harbour']);
  assert.deepEqual(ids(harbour), [both.id]);
  assert.deepEqual(ids(studio), []);
  assert.deepEqual(ids(plain), []);

  const anyMachine = value<Instr>(k.instruct(OWNER, { said: 'Read the notes', to: 'agent', to_agent: 'claude', when: 'now', seat: 'harbour' }));
  assert.deepEqual(ids(studio), [anyMachine.id]);
  assert.deepEqual(ids(plain), []);

  /* A RUN THAT SAYS NO PROFILE IS UNDER NONE THE INSTRUCTION NAMES, until it learns one. */
  const unsaid = work('unsaid', { host: 'kiln-mbp' });
  assert.deepEqual(ids(unsaid), []);

  /* ONE TO A NAMED RUN IS ALREADY ON ONE MACHINE, so it keeps neither, and reaches that run. */
  const toRun = value<Instr>(k.instruct(OWNER, { said: 'Stop after this', to_run: plain, machine: 'kiln-studio', seat: 'harbour' }));
  assert.deepEqual([toRun.machine, toRun.seat], [null, null]);
  assert.ok(ids(plain).includes(toRun.id));

  /* A FOLDER IS NEVER A PROFILE, and a machine is a name. */
  assert.equal(refusal(k.instruct(OWNER, { said: 'x', seat: '/Users/ada/.claude-harbour' })).at, 'seat');
  assert.equal(refusal(k.instruct(OWNER, { said: 'x', machine: 'two words' })).at, 'machine');
  sql.close();
});

test('CLOSE: one that is over leaves his list, and one still going stays', async () => {
  const { k, sql, work } = await record();
  const s1 = work('one');
  value(k.instruct(OWNER, { said: 'One', when: 'now', repo: 'braindog' }));
  assert.equal(refusal(k.closeInstruction(OWNER, 'IN1')).code, 'TRANSITION_ILLEGAL');
  value(k.takeInstruction('IN1', s1));
  assert.equal(refusal(k.closeInstruction(OWNER, 'IN1')).code, 'TRANSITION_ILLEGAL');
  value(k.instruct(OWNER, { said: 'Two', when: 'now', repo: 'braindog' }));
  value(k.withdrawInstruction(OWNER, 'IN2'));
  assert.equal(refusal(k.closeInstruction(as('one'), 'IN2')).code, 'NEEDS_BROWSER_SESSION');
  assert.equal(value<Instr>(k.closeInstruction(OWNER, 'IN2')).state, 'withdrawn');
  assert.equal(refusal(k.closeInstruction(OWNER, 'IN99')).code, 'ROW_UNKNOWN');
  sql.close();
});
