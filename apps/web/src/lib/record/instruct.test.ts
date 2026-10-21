/**
 * THE CONTROL ROOM'S WORDS (`instruct.ts`, agents and MCP plan §2, §4.4, §7.1): who an instruction goes to and what
 * happens next said honestly for the run it reaches, each run row with what can stop it, and each thread's state, trail,
 * reply and receipts, names never ids. Read in UTC, so a time is the same wherever the test runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PICK_FIRST,
  agoSaid,
  composerOf,
  instructArgs,
  leadsOf,
  presenceOf,
  runsOf,
  sendingOf,
  spanSaid,
  threadOf,
  threadOrder,
  unknownRuns,
  type LiveRun,
  type Project,
  type Thread,
} from './instruct.ts';

const NOW = Date.parse('2026-09-03T15:00:00.000Z');
const UTC = 'UTC';

const run = (over: Partial<LiveRun>): LiveRun => ({
  run: 'S1',
  name: null,
  agent: 'claude',
  machine: 'kiln-mbp',
  project: 'things#1',
  repo: 'kiln-type',
  worktree: null,
  branch: 'axis-qa',
  doing: 'Variable axis QA, instances 3 of 9',
  state: 'working',
  instruction: null,
  task: null,
  stopped: null,
  helpers: [],
  parent: null,
  for_s: 12_600,
  heard_s: 180,
  reach: 'hooks',
  ...over,
});

const CLAUDE = run({});
const CODEX = run({ run: 'S2', agent: 'codex', branch: 'specimen-copy', doing: 'Drafting the specimen page copy', reach: 'next_call', heard_s: 720, state: 'thinking' });
const HELPER = run({ run: 'S9', parent: 'S1', branch: 'axis-qa-2', doing: 'Instance 4' });
const ROWS = [CLAUDE, CODEX, HELPER];
const PROJECTS = new Map<string, Project>([
  ['things#1', { key: 'things#1', name: 'Kiln', hue: 265 }],
  ['things#3', { key: 'things#3', name: 'Portage', hue: 185 }],
]);

const thread = (over: Partial<Thread>): Thread => ({
  id: 'IN4',
  said: 'Merge wave 1, then stop',
  kind: 'tell',
  when: 'now',
  to: 'agent',
  to_run: null,
  to_agent: 'claude',
  project: 'things#1',
  task: null,
  state: 'sent',
  seen_by: null,
  seen_how: null,
  seen_at: null,
  taken_by: null,
  taken_at: null,
  reply: null,
  replied_at: null,
  expires_at: null,
  at: '2026-09-03T14:02:00.000Z',
  updated_at: '2026-09-03T14:02:00.000Z',
  seen: [],
  receipts: null,
  ...over,
});

const ctx = { now: NOW, zone: UTC, runs: runsOf(ROWS), projects: PROJECTS };

/* ── the composer ─────────────────────────────────────────────────────── */

test('TO OFFERS WHOEVER IS NEXT, EACH KIND OF AGENT AND EACH LIVE RUN BY NAME, never a handle, and no helper', () => {
  const c = composerOf(PICK_FIRST, ROWS, PROJECTS);
  assert.equal(c.to[0]!.label, 'Whoever’s next');
  assert.ok(c.to.some((x) => x.key === 'agent:codex' && x.label === 'Codex'));
  const runs = c.to.filter((x) => x.key.startsWith('run:'));
  assert.deepEqual(
    runs.map((x) => x.label),
    ['Claude on Kiln (working now)', 'Codex on Kiln (working now)'],
  );
  for (const x of c.to) assert.doesNotMatch(x.label, /\bS\d+\b|things#/u, `${x.label} says an id`);
  assert.deepEqual(c.on.map((x) => x.label), ['Any project', 'Kiln', 'Portage']);
});

test('NOW IS OFFERED ONLY WHILE A RUN IT WOULD REACH IS LIVE, and is then the first choice', () => {
  const live = composerOf({ to: 'agent:claude', on: 'things#1', when: null }, ROWS, PROJECTS);
  assert.deepEqual([live.when, live.whenKey], [['now', 'next'], 'now']);
  assert.match(live.next, /^Goes to Claude on Kiln, working now: it sees this within about 15 seconds, at its next prompt or tool call\./u);
  const quiet = composerOf({ to: 'agent:claude', on: 'things#3', when: null }, ROWS, PROJECTS);
  assert.deepEqual([quiet.when, quiet.whenKey], [['next'], 'next']);
  assert.equal(quiet.next, 'The next Claude run on Portage gets this when it starts or next checks in. It waits up to 14 days.');
  const chosen = composerOf({ to: 'agent:claude', on: 'things#1', when: 'next' }, ROWS, PROJECTS);
  assert.equal(chosen.whenKey, 'next', 'his choice of next start is not kept');
});

test('WHAT HAPPENS NEXT IS SAID FOR HOW THE RUN IS REACHED: hooks within seconds, otherwise its next BrainDog call', () => {
  const claude = composerOf({ to: 'run:S1', on: '', when: null }, ROWS, PROJECTS);
  assert.deepEqual([claude.onKey, claude.onFixed, claude.when], ['things#1', true, ['now']]);
  assert.equal(claude.next, 'Claude on Kiln sees this within about 15 seconds, at its next prompt or tool call.');
  const codex = composerOf({ to: 'run:S2', on: '', when: null }, ROWS, PROJECTS);
  assert.equal(codex.next, 'Codex on Kiln sees this at its next BrainDog call, and not before.');
  const many = composerOf({ to: 'anyone', on: 'things#1', when: 'now' }, ROWS, PROJECTS);
  assert.equal(many.next, 'Goes to the 2 agent runs working on Kiln now. The first to take it does it, and the others are told it is taken.');
  const paused = composerOf({ to: 'run:S1', on: '', when: null }, [run({ stopped: 'pause' })], PROJECTS);
  assert.match(paused.next, /It is paused; it reads this, and works once you resume it\.$/u);
});

test('WHAT IS SENT: a run by handle and now, a kind on a project with its when, whoever is next', () => {
  const at = (pick: Parameters<typeof composerOf>[0]) => instructArgs(composerOf(pick, ROWS, PROJECTS), '  Merge wave 1  ');
  assert.deepEqual(at({ to: 'run:S2', on: '', when: null }), { said: 'Merge wave 1', to: 'run', to_run: 'S2', when: 'now' });
  assert.deepEqual(at({ to: 'agent:claude', on: 'things#1', when: 'next' }), { said: 'Merge wave 1', to: 'agent', to_agent: 'claude', project: 'things#1', when: 'next' });
  assert.deepEqual(at({ to: 'anyone', on: '', when: null }), { said: 'Merge wave 1', to: 'anyone', when: 'now' });
});

/* ── the runs open now ────────────────────────────────────────────────── */

test('A RUN ROW IS THE AGENT, WHAT IT SAID, WHERE AND WHEN, its helpers folded under it with their branches', () => {
  assert.deepEqual(leadsOf(ROWS).map((r) => r.run), ['S1', 'S2']);
  const row = presenceOf(CLAUDE, ROWS, PROJECTS);
  assert.deepEqual([row.name, row.doing, row.project], ['Claude', 'Variable axis QA, instances 3 of 9', { name: 'Kiln', slot: 'blue' }]);
  assert.equal(row.meta, 'axis-qa · running 3 h 30 min · heard 3 min ago');
  assert.equal(row.helpers, '+1 helper, on axis-qa-2');
  assert.equal(row.href, '/r/session/1');
});

test('EVERY ROW SAYS HONESTLY WHAT CAN STOP IT: hooks at its next tool call, or only its next BrainDog call', () => {
  const claude = presenceOf(CLAUDE, ROWS, PROJECTS);
  assert.equal(claude.reach, 'Pause and Stop reach Claude at its next tool call, through its hooks.');
  assert.match(claude.confirm.stop, /^Stop Claude on Kiln\? Its next tool call is refused/u);
  const codex = presenceOf(CODEX, ROWS, PROJECTS);
  assert.equal(codex.reach, 'Codex has no hooks here, so it keeps working until its next BrainDog call. Pause and Stop reach it there.');
  assert.match(codex.confirm.stop, /keeps editing until its next BrainDog call/u);
});

test('WHAT A RUN HOLDS FROM HIM IS SAID IN HIS WORDS', () => {
  const held = presenceOf(run({ instruction: 'IN4' }), ROWS, PROJECTS, [thread({ state: 'working' })]);
  assert.equal(held.holds, 'On your word: “Merge wave 1, then stop”');
});

/* ── what he told agents ──────────────────────────────────────────────── */

test('A THREAD SAYS WHO IT WENT TO, HOW FAR IT GOT AND THE TRAIL, names and times and never a handle', () => {
  const sent = threadOf(thread({}), ctx);
  assert.deepEqual([sent.to, sent.word, sent.tone, sent.steps, sent.takeBack], ['Claude · Kiln · now', 'Sent', 'open', ['done', 'ahead', 'ahead', 'ahead'], true]);
  assert.equal(sent.trail, 'Sent 14:02');

  const working = threadOf(
    thread({ state: 'working', seen: [{ run: 'S1', how: 'prompt', at: '2026-09-03T14:02:30.000Z' }], taken_by: 'S1', taken_at: '2026-09-03T14:02:30.000Z' }),
    ctx,
  );
  assert.deepEqual([working.word, working.agent, working.takeBack], ['Working 57 min', 'claude', false]);
  assert.equal(working.trail, 'Sent 14:02 · Seen by Claude at 14:02, on its next prompt');
  for (const said of [working.to, working.trail, working.word]) assert.doesNotMatch(said, /\bS\d+\b|IN\d+|things#/u);
});

test('THE REPLY IS IN THE AGENT\'S WORDS, NEEDS YOU IS RED, AND WHAT IT CHANGED IS SAID BY NAME WITH UNDO ALL', () => {
  const done = threadOf(
    thread({
      state: 'needs_you',
      taken_by: 'S1',
      taken_at: '2026-09-03T14:03:00.000Z',
      reply: 'Merged W1-A to E. Wave 2 waits on the migration.',
      replied_at: '2026-09-03T14:14:00.000Z',
      receipts: {
        run: 'S1',
        batches: [
          { batch: 'b2', at: '2026-09-03T14:10:00.000Z', changes: 3, rows: ['T4', 'T5'], names: ['Ship the specimen', 'Kern pass'] },
          { batch: 'b1', at: '2026-09-03T14:05:00.000Z', changes: 1, rows: ['T4'], names: ['Ship the specimen'] },
        ],
        changes: 4,
        head_before: 'aaa',
        head_after: 'bbb',
      },
    }),
    ctx,
  );
  assert.deepEqual([done.word, done.tone], ['Needs you', 'needs']);
  assert.deepEqual(done.reply, { by: 'Claude at 14:14', text: 'Merged W1-A to E. Wave 2 waits on the migration.' });
  assert.deepEqual(done.receipts, { said: '4 changes', names: ['Ship the specimen', 'Kern pass'], more: null, undo: true, undone: null, commits: 'New commits on axis-qa' });
  const undone = threadOf(thread({ state: 'done', taken_by: 'S1', receipts: done.receipts && { run: 'S1', batches: [], changes: 4, head_before: null, head_after: null } }), { ...ctx, undone: new Map([['IN4', 'Put back 4 changes.']]) });
  assert.deepEqual([undone.receipts?.undo, undone.receipts?.undone], [false, 'Put back 4 changes.']);
});

test('A THREAD THAT WENT NOWHERE IS QUIET: taken back, declined or expired', () => {
  const back = threadOf(thread({ state: 'withdrawn', updated_at: '2026-09-03T14:03:00.000Z' }), ctx);
  assert.deepEqual([back.word, back.tone, back.trail], ['Taken back', 'ended', 'Sent 14:02 · Taken back 14:03']);
  const late = threadOf(thread({ state: 'expired', when: 'next' }), ctx);
  assert.deepEqual([late.word, late.tone, late.to], ['Expired', 'ended', 'Claude · Kiln · next start']);
  assert.match(late.trail, /No run took it in 14 days$/u);
  const stop = threadOf(thread({ kind: 'stop', to: 'run', to_run: 'S2', to_agent: null, said: 'Stop where you are.' }), ctx);
  assert.equal(stop.to, 'Stop · Codex · Kiln');
});

test('NEEDS YOU COMES FIRST, THEN WHAT IS OPEN, THEN THE REST, each newest first', () => {
  const order = threadOrder([
    thread({ id: 'IN1', state: 'done', at: '2026-09-03T10:00:00.000Z' }),
    thread({ id: 'IN2', state: 'sent', at: '2026-09-03T11:00:00.000Z' }),
    thread({ id: 'IN3', state: 'needs_you', at: '2026-09-03T09:00:00.000Z' }),
    thread({ id: 'IN4', state: 'working', at: '2026-09-03T12:00:00.000Z' }),
  ]);
  assert.deepEqual(order.map((t) => t.id), ['IN3', 'IN4', 'IN2', 'IN1']);
});

test('THE ROW APPEARS AT ONCE, as Sending, said as the composer said it', () => {
  const c = composerOf({ to: 'agent:claude', on: 'things#1', when: null }, ROWS, PROJECTS);
  const s = sendingOf('sending:1', ' Merge wave 1 ', c);
  assert.deepEqual([s.said, s.to, s.word, s.sending, s.takeBack], ['Merge wave 1', 'Claude · Kiln · now', 'Sending', true, false]);
});

test('A RUN A THREAD NAMES THAT IS NOT OPEN NOW IS READ ONCE, by handle', () => {
  assert.deepEqual(unknownRuns([thread({ taken_by: 'S40', seen: [{ run: 'S1', how: 'start', at: NOW.toString() }] })], runsOf(ROWS)), ['S40']);
});

test('TIME IN WORDS', () => {
  assert.deepEqual([spanSaid(20_000), spanSaid(9 * 60_000), spanSaid(200 * 60_000), spanSaid(3 * 86_400_000)], ['under a minute', '9 min', '3 h 20 min', '3 days']);
  assert.deepEqual([agoSaid(10), agoSaid(180), agoSaid(7200)], ['just now', '3 min ago', '2 h ago']);
});
