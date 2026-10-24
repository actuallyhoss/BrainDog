/**
 * THE CONTROL ROOM'S WORDS (`instruct.ts`, agents and MCP plan §2, §4.4, §7.1): who an instruction goes to and what
 * happens next said honestly for the run it reaches, each run row with what can stop it, and each thread's state, trail,
 * reply and receipts, names never ids. Read in UTC, so a time is the same wherever the test runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PICK_FIRST,
  ageSaid,
  answersSaid,
  agoSaid,
  composerOf,
  deskSplit,
  doingSaid,
  instructArgs,
  leadsOf,
  onDeskOf,
  presenceOf,
  runsOf,
  sendingOf,
  spanSaid,
  standsSaid,
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
  assert.equal(many.next, 'Goes to the 2 open agent runs on Kiln now. The first to take it does it, and the others are told it is taken.');
  const paused = composerOf({ to: 'run:S1', on: '', when: null }, [run({ stopped: 'pause' })], PROJECTS);
  assert.match(paused.next, /It is paused; it reads this, and works once you resume it\.$/u);
});

test('WHAT IS SENT: a run by handle and now, a kind on a project with its when, whoever is next', () => {
  const at = (pick: Parameters<typeof composerOf>[0]) => instructArgs(composerOf(pick, ROWS, PROJECTS), '  Merge wave 1  ');
  assert.deepEqual(at({ to: 'run:S2', on: '', when: null }), { said: 'Merge wave 1', to: 'run', to_run: 'S2', when: 'now' });
  assert.deepEqual(at({ to: 'agent:claude', on: 'things#1', when: 'next' }), { said: 'Merge wave 1', to: 'agent', to_agent: 'claude', project: 'things#1', when: 'next' });
  assert.deepEqual(at({ to: 'anyone', on: '', when: null }), { said: 'Merge wave 1', to: 'anyone', when: 'now' });
});

test('MACHINE AND PROFILE ARE OFFERED WHERE HIS RUNS ARE ON TWO OR MORE, narrow who is live, and are sent by name and said as a person says them', () => {
  const HARBOUR = run({ run: 'S3', seat: 'harbour', machine: 'kiln-studio', branch: 'harbour' });
  const rows = [CLAUDE, CODEX, HARBOUR];
  const places = { machines: ['kiln-mbp'], seats: ['default', 'harbour'] };
  const c = composerOf({ to: 'agent:claude', on: 'things#1', when: null, machine: 'kiln-studio', seat: 'harbour' }, rows, PROJECTS, null, places);
  assert.deepEqual(c.machine?.map((x) => x.label), ['Any machine', 'MacBook Pro', 'Kiln studio']);
  assert.deepEqual(c.seat?.map((x) => x.label), ['Any profile', 'default', 'harbour']);
  assert.deepEqual([c.machineKey, c.seatKey], ['kiln-studio', 'harbour']);
  /* ONLY THE RUN THERE IS LIVE FOR IT, and the sentence says where. */
  assert.match(c.next, /^Goes to Claude on Kiln, working now: /u);
  assert.match(c.next, /the next Claude on Kiln, on Kiln studio as harbour gets it\.$/u);
  assert.deepEqual(instructArgs(c, 'Ship it'), { said: 'Ship it', to: 'agent', to_agent: 'claude', project: 'things#1', machine: 'kiln-studio', seat: 'harbour', when: 'now' });
  assert.equal(sendingOf('outgoing:2', 'Ship it', c).to, 'Claude · Kiln · on Kiln studio · as harbour · now');

  /* ONE MACHINE AND NO PROFILE IS NOTHING TO CHOOSE, and a named run is one machine and one profile already. */
  const plain = composerOf(PICK_FIRST, ROWS, PROJECTS);
  assert.equal(plain.machine, undefined);
  assert.equal(plain.seat, undefined);
  const named = composerOf({ to: 'run:S3', on: '', when: null, machine: 'kiln-mbp', seat: 'default' }, rows, PROJECTS, null, places);
  assert.equal(named.machine, undefined);
  assert.deepEqual(instructArgs(named, 'Stop here'), { said: 'Stop here', to: 'run', to_run: 'S3', when: 'now' });

  /* AND A THREAD SAYS WHERE IT WAS AIMED. */
  assert.equal(threadOf(thread({ machine: 'kiln-studio', seat: 'harbour' }), ctx).to, 'Claude · Kiln · on Kiln studio · as harbour · now');
});

/* ── the runs open now ────────────────────────────────────────────────── */

test('A RUN ROW IS THE AGENT, WHAT IT SAID, WHERE AND WHEN, its helpers folded under it with their branches', () => {
  assert.deepEqual(leadsOf(ROWS).map((r) => r.run), ['S1', 'S2']);
  const row = presenceOf(CLAUDE, ROWS, PROJECTS);
  assert.deepEqual([row.name, row.doing, row.project], ['Claude', 'Variable axis QA, instances 3 of 9', { name: 'Kiln', slot: 'blue' }]);
  assert.equal(row.meta, 'axis-qa · running 3 h 30 min · heard 3 min ago');
  assert.equal(presenceOf({ ...CLAUDE, seat: 'harbour' }, ROWS, PROJECTS).meta, 'as harbour · axis-qa · running 3 h 30 min · heard 3 min ago');
  assert.equal(presenceOf({ ...CLAUDE, seat: 'default' }, ROWS, PROJECTS).meta, row.meta, 'the default profile is not said');
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

test('THE ROW APPEARS AT ONCE, on its way, said as the composer said it', () => {
  const c = composerOf({ to: 'agent:claude', on: 'things#1', when: null }, ROWS, PROJECTS);
  const s = sendingOf('outgoing:1', ' Merge wave 1 ', c);
  assert.deepEqual([s.said, s.to, s.word, s.sending, s.takeBack], ['Merge wave 1', 'Claude · Kiln · now', 'On its way', true, false]);
});

test('A RUN A THREAD NAMES THAT IS NOT OPEN NOW IS READ ONCE, by handle', () => {
  assert.deepEqual(unknownRuns([thread({ taken_by: 'S40', seen: [{ run: 'S1', how: 'start', at: NOW.toString() }] })], runsOf(ROWS)), ['S40']);
});

test('TIME IN WORDS', () => {
  assert.deepEqual([spanSaid(20_000), spanSaid(9 * 60_000), spanSaid(200 * 60_000), spanSaid(3 * 86_400_000)], ['under a minute', '9 min', '3 h 20 min', '3 days']);
  assert.deepEqual([ageSaid(20), ageSaid(9 * 60), ageSaid(200 * 60), ageSaid(3 * 86_400)], ['just now', 'for 9 min', 'for 3 h', 'for 3 days']);
  assert.deepEqual([agoSaid(10), agoSaid(180), agoSaid(7200)], ['just now', '3 min ago', '2 h ago']);
});

/* THE AGENTS PAGE OF 23 OCTOBER: At work leads each row with what the run is doing in plain words, never the record's own
   name for it, and lists a run waiting on him only while it called inside three hours. */
test('WHAT A RUN IS DOING IS ITS OWN WORDS, else where it works, and never the name the record gave it', () => {
  assert.equal(doingSaid(CLAUDE), 'Variable axis QA, instances 3 of 9');
  for (const own of ['Claude run', 'Claude Code in BrainDog', 'Claude in kiln-type', 'kiln-type', 'kiln-type on axis-qa', ''])
    assert.equal(doingSaid(run({ doing: own })), 'In kiln-type, on axis-qa', own);
  assert.equal(doingSaid(run({ doing: 'Claude run', repo: null, branch: null })), 'Has not said what it is doing');
  /* WORDS AN AGENT WROTE THAT ONLY START LIKE A NAME ARE ITS OWN. */
  assert.equal(doingSaid(run({ doing: 'Claude in the loop again' })), 'Claude in the loop again');
});

test('HOW A RUN STANDS, AND WHICH RUNS ARE AT WORK: working now, then the ones quiet under three hours, never one quiet longer', () => {
  assert.equal(standsSaid(CLAUDE), 'Working now');
  assert.equal(standsSaid(CODEX), 'Working now');
  assert.equal(standsSaid(run({ state: 'waiting', quiet_s: 40 * 60 })), 'Quiet for 40 min');
  assert.equal(standsSaid(run({ state: 'waiting' })), 'Waiting on you');
  assert.equal(standsSaid(run({ stopped: 'pause' })), 'Paused by you');
  const quiet = run({ run: 'S4', state: 'waiting', quiet_s: 2 * 3600 });
  const silent = run({ run: 'S5', state: 'waiting', quiet_s: 42 * 3600 });
  const unsaid = run({ run: 'S6', state: 'waiting' });
  assert.deepEqual(onDeskOf([...ROWS, quiet, silent, unsaid]).map((r) => r.run), ['S1', 'S2', 'S4']);
});

/* THE AUDIT OF 25 OCTOBER, Z6 (`agents-390-light.png`): "Nobody working right now." over a list called At work holding
   three quiet runs. The quiet ones are their own part, so nothing quiet stands among the runs at work. */
test('THREE QUIET RUNS ARE OPEN AND QUIET, NONE AT WORK, and a working one is the only one at work', () => {
  const tidy = run({ run: 'S904', state: 'waiting', quiet_s: 19 * 60 });
  const bot = run({ run: 'S900', state: 'waiting', quiet_s: 75 * 60 });
  const unsaid = run({ run: 'S901', state: 'waiting', quiet_s: 80 * 60 });
  const quiet = deskSplit([tidy, bot, unsaid]);
  assert.deepEqual(quiet.working, []);
  assert.deepEqual(quiet.quiet.map((r) => r.run), ['S904', 'S900', 'S901']);
  const one = deskSplit([{ ...tidy, state: 'working' }, bot, unsaid]);
  assert.deepEqual(one.working.map((r) => r.run), ['S904']);
  assert.deepEqual(one.quiet.map((r) => r.run), ['S900', 'S901']);
});

/* ── an order that names questions (D8) ─────────────────────────────────── */

test('HIS WORDS NAME THE QUESTIONS THE RUN MAY ANSWER, each with his answer, and a "don\'t" names none', () => {
  assert.deepEqual(answersSaid('accept SG243'), [{ question: 'SG243', option: 'accept' }]);
  assert.deepEqual(answersSaid('Decline sg12, then answer SG7 with ship. Accept SG12 too'), [
    { question: 'SG12', option: 'decline' },
    { question: 'SG7', option: 'ship' },
  ]);
  assert.deepEqual(answersSaid("Don't accept SG243 yet, look at SG244"), []);
  assert.deepEqual(answersSaid('Tidy the ledger'), []);
  const c = composerOf(PICK_FIRST, ROWS, PROJECTS);
  assert.deepEqual(instructArgs(c, 'accept SG243').answers, [{ question: 'SG243', option: 'accept' }]);
  assert.equal('answers' in instructArgs(c, 'Ship it'), false, 'words that name no question send none');

  /* AND HIS THREAD SAYS WHAT IT LETS THE RUN ANSWER, then that it was. */
  assert.match(threadOf(thread({ answers: [{ question: 'SG243', option: 'accept' }], answered: [] }), ctx).trail, /Lets it answer SG243$/u);
  assert.match(threadOf(thread({ answers: [{ question: 'SG243', option: 'accept' }], answered: ['SG243'] }), ctx).trail, /Answered SG243 as you said$/u);
});
