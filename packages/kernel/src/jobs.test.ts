/**
 * The job queue (`jobs.ts`), driven on its own against a record migrated to 18.
 *
 * WHY ON ITS OWN. The kernel's `jobs` member (`api/jobs.ts`) and the record's job methods are wired by registry lines
 * other units write, so what is proven here is the queue those lines reach: a kind that installs and one that is
 * refused, a runner enrolled through the device flow claiming with a lease, lines posted in order, a stop read, an end,
 * a lost lease given back once and then stopped, and a job nobody took cancelled with a note.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { deviceApprove, devicePoll, deviceStart, type Exchanged } from './device.ts';
import { validate } from './declare.ts';
import {
  JOB_LEASE_MS,
  JOB_WAITS_MS,
  cancelJob,
  claimJob,
  createJob,
  fillPrompt,
  jobBody,
  jobEvents,
  listJobs,
  postJobEvent,
  readCancel,
  runnerGrant,
  sweepJobs,
  type Claimed,
  type JobRunner,
} from './jobs.ts';
import { applyMigrations } from './migrate.ts';
import { verifyToken, type TokenDeps } from './token.ts';
import { fixedClock, openSqlite } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);
const OWNER = 'p_owner';
/** Obviously not a real record id, and what every bearer here starts with. */
const RECORD = 'rec_fake';

const sha256 = async (text: string): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

const KIND = {
  job: 'release-notes',
  title: 'Release notes',
  prompt: 'Write the release notes for %tag% from git log, and propose them as a note.',
  args: [{ id: 'tag', label: 'The tag', max: 32 }],
  repo: 'braindog',
  tools: ['Read', 'Grep', 'Bash(git log:*)', 'mcp__braindog__propose'],
  turns: 12,
  permission: 'dontAsk',
};

const value = <T>(r: Result<T>): T => {
  assert.ok(r.ok, fixOf(r));
  return r.value;
};
const refusalOf = (r: Result<unknown>) => {
  assert.equal(r.ok, false, 'the call went through');
  return !r.ok && 'refusal' in r ? r.refusal : { code: 'conflict', fix: '', at: undefined };
};

async function setup() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  value((await applyMigrations(sql, clock)).result);
  /* ONLY AN OWNER APPROVES A GRANT, AND ONLY AN OWNER KEEPS ONE STANDING (`APPROVER_STANDING`). */
  sql.exec("INSERT INTO member (person_id, register, level) VALUES (?, '*', 'owner')", OWNER);
  let n = 0;
  /* BUILT PER CALL, so each call reads the clock as it now stands. Ids are twenty-six characters, as a ULID is, since a
     job's id is checked for that shape. */
  const deps = (): TokenDeps => ({
    sql,
    nowMs: clock.now(),
    mint: () => String(++n).padStart(26, '0'),
    recordId: () => RECORD,
    digest: sha256,
    random: (size: number) => crypto.getRandomValues(new Uint8Array(size)),
  });
  const transaction = <T>(fn: () => T): T => sql.transactionSync(fn);
  sql.exec(
    "INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, created_at) VALUES ('job.release-notes', 1, 'job', NULL, ?, 'test', 0, ?)",
    JSON.stringify(KIND),
    new Date(NOW).toISOString(),
  );
  /* A MACHINE ENROLLED AS THE CLI ENROLS ONE: asked for, approved by the owner, exchanged once for its bearer. */
  const enrol = async (label: string): Promise<{ bearer: string; runner: JobRunner }> => {
    const started = value(await deviceStart(deps(), { reach: 'runner', label }));
    value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
    const bearer = (value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).bearer;
    return { bearer, runner: value(await runnerGrant(deps(), bearer)) };
  };
  return { sql, clock, deps, transaction, enrol };
}

const claimed = (c: Claimed) => {
  assert.ok(c.job !== null, 'nothing was claimed');
  return c as Extract<Claimed, { job: object }>;
};

test('A JOB KIND INSTALLS AS THE TENTH KIND, AND ITS LINT REFUSES WHAT NO RUN MAY DO', () => {
  assert.equal(validate({ id: 'job.release-notes', kind: 'job', body: KIND as never }), null);
  const at = (body: Record<string, unknown>) => jobBody({ id: 'job.release-notes', body: { ...KIND, ...body } })?.at;
  assert.equal(at({ permission: 'bypassPermissions' }), 'permission');
  assert.equal(at({ prompt: 'Write notes for %version%.' }), 'prompt');
  assert.equal(at({ prompt: 'Write notes.' }), 'args');
  assert.equal(at({ tools: ['Bash'] }), 'tools[0]');
  assert.equal(at({ tools: ['Bash(*)'] }), 'tools[0]');
  assert.equal(at({ tools: ['Write'] }), 'tools[0]');
  assert.equal(at({ turns: 41 }), 'turns');
  assert.equal(at({ permission: 'acceptEdits' }), 'writes');
  assert.equal(at({ permission: 'acceptEdits', writes: true }), undefined);
  assert.equal(at({ owner: 'me' }), 'owner');
  /* ONE PASS: a value that says a slot of its own stays those words. */
  assert.equal(fillPrompt('Notes for %tag%.', { tag: '%tag% again' }), 'Notes for %tag% again.');
});

test('A KIND MAY SAY CODEX RUNS IT, and then names no command, which Codex cannot hold a run to', () => {
  const at = (body: Record<string, unknown>) => jobBody({ id: 'job.release-notes', body: { ...KIND, ...body } })?.at;
  const codex = { agent: 'codex', tools: ['Read', 'Grep', 'mcp__braindog__propose'] };
  assert.equal(at(codex), undefined);
  assert.equal(at({ agent: 'claude' }), undefined);
  assert.equal(at({ agent: 'cursor' }), 'agent');
  /* KIND's own tools name git log, which Codex would not keep to. */
  assert.equal(at({ agent: 'codex' }), 'tools[2]');
  assert.match(jobBody({ id: 'job.release-notes', body: { ...KIND, agent: 'codex' } })?.fix ?? '', /^job\.release-notes runs on Codex, which cannot hold a run to named commands/u);
  assert.equal(at({ ...codex, permission: 'acceptEdits', writes: true }), undefined);
});

test('A CLAIM SAYS WHICH AGENT RUNS THE JOB: Claude Code for a kind that says none, Codex for one that says so', async () => {
  const { sql, deps, transaction, enrol } = await setup();
  const { runner } = await enrol('Studio laptop');
  value(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v1' } }, () => true));
  assert.equal(claimed(value(await claimJob(deps(), runner, transaction))).job.agent, 'claude');
  sql.exec(
    "INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, created_at) VALUES ('job.codex-notes', 1, 'job', NULL, ?, 'test', 0, ?)",
    JSON.stringify({ ...KIND, job: 'codex-notes', agent: 'codex', tools: ['Read', 'mcp__braindog__propose'] }),
    new Date(NOW).toISOString(),
  );
  value(createJob(deps(), { kind: 'job.codex-notes', args: { tag: 'v2' } }, () => true));
  const other = await enrol('Build box');
  assert.equal(claimed(value(await claimJob(deps(), other.runner, transaction))).job.agent, 'codex');
});

test('THE WHOLE WALK: started, claimed with a lease and a bearer, reported in order, stopped, ended', async () => {
  const { sql, deps, transaction, enrol } = await setup();
  const { runner } = await enrol('Studio laptop');

  const { id } = value(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v1.2.0' } }, () => true));
  assert.equal(refusalOf(createJob(deps(), { kind: 'job.nothing', args: {} }, () => true)).code, 'DECLARATION_UNKNOWN');
  assert.equal(refusalOf(createJob(deps(), { kind: 'job.release-notes', args: {} }, () => true)).code, 'REQUIRED_MISSING');

  const got = claimed(value(await claimJob(deps(), runner, transaction)));
  assert.equal(got.job.id, id);
  assert.equal(got.job.prompt, KIND.prompt, 'the prompt as approved, its slots for the runner to fill');
  assert.deepEqual(got.job.args, { tag: 'v1.2.0' });
  assert.equal(got.mcp.url, '/mcp');
  const verified = value(await verifyToken(deps(), got.bearer));
  assert.equal(verified.scope, 'propose');

  /* A SECOND MACHINE FINDS NOTHING, and an unknown machine reports on nothing. */
  const other = await enrol('Build box');
  assert.equal(value(await claimJob(deps(), other.runner, transaction)).job, null);
  assert.equal(refusalOf(postJobEvent(deps(), other.runner, { job_id: id, seq: got.job.seq + 1, kind: 'start' })).code, 'FORBIDDEN');

  const next = got.job.seq + 1;
  assert.equal(refusalOf(postJobEvent(deps(), runner, { job_id: id, seq: next + 1, kind: 'say' })).code, 'FORBIDDEN', 'a gap');
  assert.equal(value(postJobEvent(deps(), runner, { job_id: id, seq: next, kind: 'start', body: { model: 'claude' } })).seq, next);
  const lines = () => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM job_event WHERE job_id = ?', id)?.n;
  const before = lines();
  assert.equal(value(postJobEvent(deps(), runner, { job_id: id, seq: next, kind: 'start' })).seq, next, 'the last line again');
  assert.equal(lines(), before, 'and nothing written twice');

  assert.equal(value(cancelJob(deps(), { id })).cancel, true);
  assert.equal(value(readCancel(deps(), runner, { job_id: id })).cancel, true);
  /* A COST IS KEPT ONLY WITH THE CURRENCY THE RUNNER REPORTED IT IN. */
  const noCurrency = { job_id: id, seq: next + 1, kind: 'end', body: { status: 'cancelled', cost_minor: 12 } };
  assert.equal(refusalOf(postJobEvent(deps(), runner, noCurrency)).at, 'body.cost_currency');
  const body = { status: 'cancelled', turns: 2, cost_minor: 12, cost_currency: 'USD' };
  const ended = value(postJobEvent(deps(), runner, { job_id: id, seq: next + 1, kind: 'end', body }));
  assert.equal(ended.lease_until, null);
  const row = value(await listJobs(deps(), {})).jobs.find((j) => j.id === id);
  assert.deepEqual([row?.cost_minor, row?.cost_currency], [12, 'USD']);

  const read = value(jobEvents(deps(), { id, after: 0 }));
  assert.equal(read.status, 'cancelled');
  assert.deepEqual(read.events.map((e) => e.kind), ['note', 'start', 'end']);
  assert.equal((await verifyToken(deps(), got.bearer)).ok, false, 'the bearer ends with the job');
});

test('A LOST LEASE WAITS FOR A MACHINE ONCE, AND IS STOPPED THE SECOND TIME', async () => {
  const { clock, deps, transaction, enrol } = await setup();
  const { runner } = await enrol('Studio laptop');
  const { id } = value(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v1' } }, () => true));

  const first = claimed(value(await claimJob(deps(), runner, transaction)));
  clock.advance(JOB_LEASE_MS + 1);
  const again = claimed(value(await claimJob(deps(), runner, transaction)));
  assert.equal(again.job.id, id, 'given back once, and claimed again');
  assert.equal((await verifyToken(deps(), first.bearer)).ok, false, 'the first bearer went with the lease');

  clock.advance(JOB_LEASE_MS + 1);
  sweepJobs(deps());
  const read = value(jobEvents(deps(), { id, after: 0 }));
  assert.equal(read.status, 'interrupted');
  assert.equal(refusalOf(postJobEvent(deps(), runner, { job_id: id, seq: read.seq + 1, kind: 'say' })).code, 'FORBIDDEN');
});

test('A JOB NO MACHINE TAKES IN A DAY IS CANCELLED, WITH A NOTE SAYING SO', async () => {
  const { clock, deps } = await setup();
  const { id } = value(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v1' } }, () => true));
  clock.advance(JOB_WAITS_MS);
  assert.equal(sweepJobs(deps()), 1);
  const read = value(jobEvents(deps(), { id, after: 0 }));
  assert.equal(read.status, 'cancelled');
  assert.equal(read.events[read.events.length - 1]?.kind, 'note');
});

test("ONLY A RUNNER'S BEARER IS A RUNNER: a login grant's and a stranger's are refused alike", async () => {
  const { deps } = await setup();
  const started = value(await deviceStart(deps(), { reach: 'login', label: 'A laptop' }));
  value(await deviceApprove(deps(), OWNER, { user_code: started.user_code }));
  const login = (value(await devicePoll(deps(), { device_code: started.device_code })) as Exchanged).bearer;
  assert.equal(refusalOf(await runnerGrant(deps(), login)).code, 'FORBIDDEN');
  assert.equal(refusalOf(await runnerGrant(deps(), `${RECORD}.not-a-bearer`)).code, 'FORBIDDEN');
});

test('A JOB PLACED ON A MACHINE OR A PROFILE GOES ONLY TO A RUNNER THERE, and the machine that took each is kept', async () => {
  const { deps, transaction, enrol } = await setup();
  const { runner } = await enrol('Studio laptop');
  const placed = value(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v2' }, machine: 'kiln-mbp', seat: 'harbour' }, () => true));
  /* A NAME AND NEVER A FOLDER. */
  assert.equal(refusalOf(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v2' }, seat: '/Users/ada/.claude-harbour' }, () => true)).at, 'seat');
  assert.equal(refusalOf(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v2' }, machine: 'two words' }, () => true)).at, 'machine');

  /* A RUNNER THAT SAYS NOTHING, or says another machine or no such profile, takes nothing. */
  assert.equal(value(await claimJob(deps(), runner, transaction)).job, null);
  assert.equal(value(await claimJob(deps(), runner, transaction, { host: 'kiln-studio', seats: ['harbour'] })).job, null);
  assert.equal(value(await claimJob(deps(), runner, transaction, { host: 'kiln-mbp', seats: ['default'] })).job, null);

  /* THE RUNNER ON THAT MACHINE THAT CAN RUN THAT PROFILE takes it, and is told the profile by name. */
  const got = claimed(value(await claimJob(deps(), runner, transaction, { host: 'kiln-mbp', seats: ['default', 'harbour', '../etc'] })));
  assert.equal(got.job.id, placed.id);
  assert.equal(got.job.seat, 'harbour');
  const row = value(await listJobs(deps(), {})).jobs.find((j) => j.id === placed.id);
  assert.deepEqual([row?.machine, row?.seat, row?.ran_on], ['kiln-mbp', 'harbour', 'kiln-mbp']);

  /* A JOB THAT NAMES NEITHER GOES TO ANY RUNNER, as before, and keeps the machine it ran on when the runner said one. */
  const plain = value(createJob(deps(), { kind: 'job.release-notes', args: { tag: 'v3' } }, () => true));
  const other = await enrol('Build box');
  const took = claimed(value(await claimJob(deps(), other.runner, transaction, { host: 'build-box' })));
  assert.equal(took.job.id, plain.id);
  assert.equal(took.job.seat, null);
  const ran = value(await listJobs(deps(), {})).jobs.find((j) => j.id === plain.id);
  assert.deepEqual([ran?.machine, ran?.seat, ran?.ran_on], [null, null, 'build-box']);
});

test('A RUNNER STANDS ONLY WHILE ITS APPROVER IS AN OWNER: made less than one, or taken off, it is not a runner', async () => {
  const { sql, deps, enrol } = await setup();
  const { bearer } = await enrol('Studio laptop');
  assert.ok((await runnerGrant(deps(), bearer)).ok);
  sql.exec("UPDATE member SET level = 'decide' WHERE person_id = ?", OWNER);
  assert.equal((await runnerGrant(deps(), bearer)).ok, false);
  sql.exec('DELETE FROM member WHERE person_id = ?', OWNER);
  assert.equal((await runnerGrant(deps(), bearer)).ok, false);
});
