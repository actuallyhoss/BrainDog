/**
 * The jobs panel on a project's page: the last three runs that name the project, newest first, each in words; Start
 * only while a machine listens; and a press that names the project. Invented projects and kinds throughout.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { words as jobWords, type JobKind, type JobRow, type Step } from '../../record/jobs.ts';
import { argsOf, jobPanel, lineKinds, newestLine, panelWords, ready, startForProject, stateOf } from './job-panel.ts';

const LANTERN = { spoken: 'projects#7', title: 'Lantern Bay' };

let seq = 0;
function run(over: Partial<JobRow> = {}): JobRow {
  seq += 1;
  return {
    id: `j_${seq}`,
    kind: 'job.tidy',
    title: 'Tidy the docs',
    repo: null,
    args: {},
    about: LANTERN.spoken,
    status: 'ok',
    lost: false,
    cancel: false,
    runner: null,
    seq: 0,
    created_at: `2026-10-${String(10 + seq).padStart(2, '0')}T09:00:00.000Z`,
    claimed_at: null,
    lease_until: null,
    expires: '2026-12-01T00:00:00.000Z',
    result: null,
    error: null,
    claude_session: null,
    cost_minor: null,
    cost_currency: null,
    turns: null,
    ms: null,
    ...over,
  };
}

const kind = (id: string, args: JobKind['args'] = []): JobKind => ({ id, title: id.replace('job.', ''), repo: null, args, writes: false });
const CODE = kind('job.code', [{ id: 'task', label: 'What to do', max: 20 }]);

test('three of five kept, newest first, and only the project’s own', () => {
  /* The record answers newest first. */
  const rows = [
    run({ id: 'j_e', title: 'Fifth' }),
    run({ id: 'j_other', title: 'Elsewhere', about: 'projects#9' }),
    run({ id: 'j_d', title: 'Fourth' }),
    run({ id: 'j_c', title: 'Third' }),
    run({ id: 'j_b', title: 'Second' }),
    run({ id: 'j_a', title: 'First' }),
  ];
  const got = jobPanel(rows, [CODE], true, LANTERN);
  assert.deepEqual(got.jobs.map((j) => j.title), ['Fifth', 'Fourth', 'Third']);
  assert.equal(got.none, null);
});

test('a live run goes on top, as Jobs puts it', () => {
  const rows = [run({ id: 'j_new', title: 'Newest' }), run({ id: 'j_live', title: 'Waiting one', status: 'queued' })];
  assert.deepEqual(jobPanel(rows, [], true, LANTERN).jobs.map((j) => [j.title, j.live]), [['Waiting one', true], ['Newest', false]]);
});

test('the words for each state', () => {
  assert.equal(stateOf(run({ status: 'queued' })).word, 'Waiting for a machine');
  assert.equal(stateOf(run({ status: 'claimed' })).word, 'Working');
  assert.equal(stateOf(run({ status: 'ok' })).word, 'Done');
  assert.equal(stateOf(run({ status: 'cancelled' })).word, 'Stopped');
  /* The rest are Jobs' own words. */
  assert.equal(stateOf(run({ status: 'claimed', cancel: true })).word, jobWords.stopping);
  assert.equal(stateOf(run({ status: 'claimed', lost: true })).word, jobWords.lost);
  assert.equal(stateOf(run({ status: 'error' })).word, jobWords.error);
});

test('a retired kind is named in its own words', () => {
  assert.equal(jobPanel([run({ title: null, kind: 'job.weekly_tidy' })], [], true, LANTERN).jobs[0]?.title, 'weekly tidy');
});

test('a project with no runs says so by its title', () => {
  const got = jobPanel([run({ about: 'projects#9' })], [CODE], true, LANTERN);
  assert.deepEqual(got.jobs, []);
  assert.equal(got.none, panelWords.none('Lantern Bay'));
});

test('no Start with nobody listening, and Jobs’ line in its place', () => {
  const got = jobPanel([], [CODE], false, LANTERN);
  assert.equal(got.canStart, false);
  assert.equal(got.line, jobWords.nobodyListening);
});

test('Start while a machine listens, or while that is not known', () => {
  for (const listening of [true, null]) {
    const got = jobPanel([], [CODE], listening, LANTERN);
    assert.equal(got.canStart, true);
    assert.equal(got.line, null);
  }
});

test('no kind approved says Jobs’ line for it and draws no Start', () => {
  const got = jobPanel([], [], true, LANTERN);
  assert.equal(got.canStart, false);
  assert.equal(got.line, jobWords.noKinds);
});

test('the kinds one line can start: none or one argument, never a page’s', () => {
  const page = kind('job.compose', [{ id: 'page', label: 'Page', max: 64 }]);
  const two = kind('job.pair', [{ id: 'a', label: 'A', max: 9 }, { id: 'b', label: 'B', max: 9 }]);
  const bare = kind('job.check');
  assert.deepEqual(lineKinds([CODE, page, two, bare]).map((k) => k.id), ['job.code', 'job.check']);
});

test('the typed line fills the kind’s one argument, trimmed and cut to its most', () => {
  assert.deepEqual(argsOf(CODE, '  add a line to the readme  '), { task: 'add a line to the re' });
  assert.deepEqual(argsOf(kind('job.check'), 'ignored'), {});
  assert.equal(ready(CODE, '   '), false);
  assert.equal(ready(CODE, 'go'), true);
  assert.equal(ready(kind('job.check'), ''), true);
  assert.equal(ready(null, 'go'), false);
});

test('a running job’s newest line: the last thing said, or the tool last called', () => {
  const step = (over: Partial<Step>): Step => ({ seq: 1, kind: 'say', text: '', cut: null, tool: null, status: null, ...over });
  assert.equal(newestLine([]), null);
  assert.equal(newestLine([step({ text: 'Reading the readme' }), step({ text: '  ' })]), 'Reading the readme');
  assert.equal(newestLine([step({ text: 'x' }), step({ kind: 'tool', tool: { name: 'Edit', out: null } })]), 'Edit');
  const long = newestLine([step({ text: 'word '.repeat(60) })]) ?? '';
  assert.ok(long.length <= 140 && long.endsWith('…'));
});

test('Start names the project, and a refusal is said in the record’s words', async () => {
  const sent: unknown[] = [];
  const yes = { createJob: async (a: unknown) => (sent.push(a), { ok: true as const, value: { id: 'j_9' } }) };
  assert.deepEqual(await startForProject(yes, CODE, 'add a line', LANTERN), { ok: true, id: 'j_9' });
  assert.deepEqual(sent, [{ kind: 'job.code', args: { task: 'add a line' }, about: 'projects#7' }]);

  const no = { createJob: async () => ({ ok: false as const, refusal: { code: 'FORBIDDEN', fix: 'Only the owner starts a job.' } }) };
  assert.deepEqual(await startForProject(no, CODE, 'x', LANTERN), { ok: false, fix: 'Only the owner starts a job.' });

  const down = { createJob: async () => { throw new Error('offline'); } };
  assert.deepEqual(await startForProject(down, CODE, 'x', LANTERN), { ok: false, fix: panelWords.unreached });
});
