/**
 * `/jobs`'s sentence, day groups, lanes, outcome split and one run's tool tally: every figure is a count of the runs
 * read, a window with nothing in it draws nothing, red is said only for a failure, and a run with no machine or no end
 * is never given one.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { transcriptOf, type JobEvent, type JobRow } from '../../lib/record/jobs.ts';
import {
  dayTitle,
  detailOf,
  enrolAddress,
  enrolledOf,
  enrolledSaid,
  isLoopback,
  words as chartWords,
  groupsOf,
  iconOf,
  lanesOf,
  lanesSaid,
  lanesSummary,
  machineOf,
  laneTime,
  outcomeOf,
  plain,
  runTail,
  sentenceOf,
  splitOf,
  splitSaid,
  tookOf,
  toolsOf,
  toolsSaid,
} from './charts.ts';

/* Local times, so the days are the test machine's own whatever its zone. */
const at = (day: number, h: number, m = 0): number => new Date(2026, 8, day, h, m).getTime();
const iso = (t: number): string => new Date(t).toISOString();
const NOW = at(29, 10, 0);

let n = 0;
function run(over: Partial<JobRow> & { at?: number }): JobRow {
  n += 1;
  const t = over.at ?? NOW - 60 * 60_000;
  const { at: _at, ...rest } = over;
  return {
    id: `j_${n}`,
    kind: 'job.weekly_review',
    title: 'Weekly review',
    repo: null,
    args: {},
    about: null,
    status: 'ok',
    lost: false,
    cancel: false,
    runner: 'claude-mac',
    seq: 0,
    created_at: iso(t - 30_000),
    claimed_at: iso(t),
    lease_until: null,
    expires: iso(t + 86_400_000),
    result: null,
    error: null,
    claude_session: null,
    cost_minor: null,
    cost_currency: null,
    turns: 6,
    ms: 5 * 60_000,
    ...rest,
  };
}

test('a run comes to one outcome and one glyph', () => {
  assert.equal(outcomeOf(run({ status: 'claimed' })), 'running');
  assert.equal(outcomeOf(run({ status: 'queued' })), 'waiting');
  assert.equal(outcomeOf(run({ status: 'ok' })), 'done');
  assert.equal(outcomeOf(run({ status: 'error' })), 'failed');
  assert.equal(outcomeOf(run({ status: 'refused' })), 'failed');
  assert.equal(outcomeOf(run({ status: 'limit' })), 'look');
  assert.equal(outcomeOf(run({ status: 'needs_decision' })), 'look');
  assert.equal(outcomeOf(run({ status: 'cancelled' })), 'stopped');
  assert.equal(iconOf(run({ status: 'claimed' })), 'play');
  assert.equal(iconOf(run({ status: 'claimed', cancel: true })), 'stop');
  assert.equal(iconOf(run({ status: 'needs_decision' })), 'decide');
  assert.equal(iconOf(run({ status: 'error' })), 'alert');
});

test('how long a run took is its machine’s time, or the time so far while it is live, and never made up', () => {
  assert.equal(tookOf(run({ ms: 192_000 }), NOW), '3m 12s');
  assert.equal(tookOf(run({ status: 'claimed', ms: null, at: NOW - 12 * 60_000 }), NOW), '12m');
  assert.equal(tookOf(run({ status: 'error', ms: null }), NOW), null);
});

test('the live runs lead, then each day newest first, named as a person names it', () => {
  const rows = [run({ status: 'claimed', at: NOW - 5 * 60_000 }), run({ at: at(29, 8) }), run({ at: at(28, 22) }), run({ at: at(26, 9) }), run({ status: 'queued', claimed_at: null, runner: null, at: NOW })];
  const g = groupsOf(rows, NOW);
  assert.deepEqual(
    g.map((x) => [x.title, x.rows.length]),
    [
      ['Live', 2],
      ['Today', 1],
      ['Yesterday', 1],
      ['Saturday 26 September', 1],
    ],
  );
  assert.equal(dayTitle(new Date(2025, 11, 31, 9).getTime(), NOW), 'Wednesday 31 December 2025');
});

test('the meta line names the machine, the start and the turns, and a waiting run says when it was asked for', () => {
  assert.deepEqual(detailOf(run({ at: at(29, 9, 12) })), ['claude-mac', '09:12', '6 turns']);
  const waiting = run({ status: 'queued', claimed_at: null, runner: null, turns: null, created_at: iso(at(29, 9, 50)) });
  assert.deepEqual(detailOf(waiting), ['No machine yet', 'asked for at 09:50']);
});

test('the sentence says what is running and what failed today, with the red on the failure only', () => {
  const said = sentenceOf([run({ status: 'claimed' }), run({ status: 'claimed' }), run({ status: 'error', at: at(29, 9) }), run({ status: 'error', at: at(27, 9) })], NOW);
  assert.ok(said);
  assert.equal(plain(said), '2 running now, and 1 failed today.');
  assert.deepEqual(
    said.filter((p) => p.tone).map((p) => [p.text, p.tone]),
    [
      ['2 running now', 'live'],
      ['1 failed today', 'needs'],
    ],
  );
  const calm = sentenceOf([run({ at: at(29, 8) }), run({ at: at(29, 9) })], NOW);
  assert.ok(calm);
  assert.equal(plain(calm), 'Nothing is running now, and 2 finished today.');
  assert.equal(calm.some((p) => p.tone === 'needs'), false);
  const queued = sentenceOf([run({ status: 'claimed' }), run({ status: 'queued', claimed_at: null })], NOW);
  assert.ok(queued);
  assert.equal(plain(queued), '1 running now and 1 waiting for a machine.');
  assert.equal(sentenceOf([], NOW), null);
});

test('the lanes are the last day when anything ran in it, one lane a machine, waiting last, and the spans are the runs', () => {
  const rows = [
    run({ status: 'claimed', ms: null, at: NOW - 20 * 60_000 }),
    run({ at: at(29, 7) }),
    run({ status: 'error', at: at(29, 9, 12), runner: 'build-box' }),
    run({ status: 'queued', claimed_at: null, runner: null, created_at: iso(NOW - 2 * 60_000) }),
    run({ at: at(20, 9) }),
  ];
  const v = lanesOf(rows, NOW);
  assert.ok(v);
  assert.equal(v.span, 'day');
  assert.equal(v.partial, false);
  assert.deepEqual(
    v.lanes.map((l) => [l.label, l.spans.length]),
    [
      ['claude-mac', 2],
      ['build-box', 1],
      ['Waiting for a machine', 1],
    ],
  );
  const live = v.lanes[0]?.spans.find((s) => s.live);
  assert.ok(live);
  assert.equal(live.to, NOW);
  const done = v.lanes[0]?.spans.find((s) => !s.live);
  assert.equal(done && done.to - done.from, 5 * 60_000);
  assert.equal(lanesSaid(v), 'claude-mac ran 2 jobs and build-box 1 in the last 24 hours; 1 is still going, 1 waits for a machine and Weekly review failed at 09:12.');
  assert.match(lanesSummary(v), /^Runs by machine in the last 24 hours\. claude-mac: 2 runs, 1 is still going\./u);
});

test('with nothing in the last day the lanes widen to the week, and with nothing in the week there are none', () => {
  const v = lanesOf([run({ at: at(26, 9) })], NOW);
  assert.ok(v);
  assert.equal(v.span, 'week');
  assert.equal(lanesSaid(v), 'claude-mac ran 1 job in the last 7 days.');
  assert.equal(lanesOf([run({ at: at(10, 9) })], NOW), null);
  /* A run no machine ever took ran nowhere, so it is on no lane. */
  assert.equal(lanesOf([run({ status: 'cancelled', claimed_at: null, at: at(29, 9) })], NOW), null);
});

test('a window reaching past the oldest run read says it has only partly seen it', () => {
  const v = lanesOf([run({ at: at(29, 9) })], NOW, at(29, 8));
  assert.equal(v?.partial, true);
  assert.equal(lanesOf([run({ at: at(29, 9) })], NOW, at(27, 8))?.partial, false);
});

test('past five machines the quietest share one lane', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f'].flatMap((m, i) => Array.from({ length: 6 - i }, () => run({ runner: m, at: at(29, 8) })));
  const v = lanesOf(rows, NOW);
  assert.deepEqual(
    v?.lanes.map((l) => [l.label, l.spans.length]),
    [
      ['a', 6],
      ['b', 5],
      ['c', 4],
      ['d', 3],
      ['Other machines', 3],
    ],
  );
});

test('an axis tick names the day at midnight and the hour otherwise', () => {
  assert.equal(laneTime(at(29, 0)), 'Tue');
  assert.equal(laneTime(at(29, 9, 40)), '09:40');
});

test('the split counts each outcome, red only for the failed, and its line names what failed', () => {
  const rows = [run({}), run({}), run({ status: 'error' }), run({ status: 'error' }), run({ status: 'claimed' })];
  const parts = splitOf(rows);
  assert.deepEqual(
    parts.filter((p) => p.value > 0).map((p) => [p.label, p.value, p.tone]),
    [
      ['Done', 2, 'ink'],
      ['Failed', 2, 'danger'],
      ['Running', 1, 'live'],
    ],
  );
  assert.equal(splitSaid(rows), '2 of 5 finished; 2 failed, both Weekly review and 1 is still going.');
  assert.equal(splitSaid([run({}), run({})]), 'All 2 finished.');
  assert.equal(splitSaid([]), '');
});

test('one run’s tools are tallied from its transcript, the busiest in ink, and its line says what it called', () => {
  const ev = (seq: number, kind: JobEvent['kind'], body: unknown): JobEvent => ({ seq, kind, body, ts: iso(NOW) });
  const steps = transcriptOf([
    ev(1, 'start', { model: 'sonnet', tools: 3 }),
    ev(2, 'tool', { name: 'Read', input: 'a.ts', call: 1 }),
    ev(3, 'out', { text: 'ok', call: 1 }),
    ev(4, 'tool', { name: 'Read', input: 'b.ts', call: 2 }),
    ev(5, 'out', { text: 'nope', call: 2, error: true }),
    ev(6, 'tool', { name: 'Grep', input: 'x', call: 3 }),
    ev(7, 'end', { status: 'ok', turns: 4, ms: 360_000 }),
  ]);
  const t = toolsOf(steps);
  assert.equal(t.calls, 3);
  assert.equal(t.failed, 1);
  assert.deepEqual(t.items, [
    { label: 'Read', value: 2, tone: 'ink', note: '1 call failed' },
    { label: 'Grep', value: 1 },
  ]);
  assert.equal(toolsSaid(t), 'It called tools 3 times, Read most (2); 1 call failed.');
  assert.equal(toolsSaid(toolsOf([])), '');
});

test('the title row says where a run is and since when, and how it ended, and never a time it was not sent', () => {
  const row = run({ turns: 14, ms: 372_000, at: at(29, 9, 12) });
  assert.equal(runTail('ok', false, row), ' in 6m 12s on claude-mac, 14 turns.');
  assert.equal(runTail('claimed', false, row), ' on claude-mac since 09:12.');
  assert.equal(runTail('claimed', true, row), '. It was running on claude-mac since 09:12.');
  assert.equal(runTail('queued', false, run({ status: 'queued', claimed_at: null, runner: null, created_at: iso(at(29, 9, 50)) })), ', asked for at 09:50.');
  assert.equal(runTail('error', false, null), '.');
});

test('a machine is said by its name and never by its network address', () => {
  assert.equal(machineOf('claude-mac'), 'claude-mac');
  assert.equal(machineOf('Sam-MacBook-Pro.local'), 'Sam-MacBook-Pro');
  assert.equal(machineOf('build-box.lan'), 'build-box');
  assert.equal(machineOf('192.168.1.20'), 'Unnamed machine');
  assert.equal(machineOf('fe80::1'), 'Unnamed machine');
  assert.equal(machineOf(null), null);
  assert.equal(machineOf('  '), null);
  assert.deepEqual(detailOf(run({ at: at(29, 9, 12), runner: 'studio.local' })), ['studio', '09:12', '6 turns']);
  assert.equal(runTail('claimed', false, run({ runner: '10.0.0.4', at: at(29, 9, 12) })), ' on an unnamed machine since 09:12.');
});

test('the machines enrolled as runners, by the name a person gave them, the one seen last first', () => {
  const devices = [
    { handle: 'h1', reach: 'runner', status: 'active', label: 'Sam-MacBook-Pro.local · braindog-cli · runner', last_used: '2026-10-06T09:00:00Z', approved_at: '2026-10-01T09:00:00Z' },
    { handle: 'h2', reach: 'runner', status: 'revoked', label: 'old-box · braindog-cli · runner', last_used: '2026-10-07T09:00:00Z', approved_at: null },
    { handle: 'h3', reach: 'login', status: 'active', label: 'laptop · braindog-cli', last_used: null, approved_at: null },
    { handle: 'h4', reach: 'runner', status: 'approved', label: 'build-box.lan · braindog-cli · runner', last_used: '2026-10-07T08:00:00Z', approved_at: '2026-10-07T07:00:00Z' },
    { handle: 'h5', reach: 'runner', status: 'approved', label: null, last_used: null, approved_at: '2026-10-07T07:00:00Z' },
  ];
  const out = enrolledOf(devices);
  assert.deepEqual(out.map((m) => [m.key, m.name]), [['h4', 'build-box'], ['h1', 'Sam-MacBook-Pro'], ['h5', 'Unnamed machine']]);
  assert.equal(enrolledSaid(out[0]!, () => '1h ago'), 'Asked for work 1h ago');
  assert.equal(enrolledSaid(out[2]!, () => 'today'), 'Enrolled today, not seen since');
});

test('the enrol command never prints a localhost address on a hosted record', () => {
  for (const here of ['http://localhost:5190', 'http://localhost:5190/app/studio', 'http://127.0.0.1:8787', 'http://[::1]:3000', 'http://app.localhost:5173', 'http://0.0.0.0:4173', 'not an address']) {
    assert.equal(isLoopback(here), true, here);
    const said = enrolAddress(here, true, 'studio');
    assert.equal(said, 'https://brain.dog/app/studio', here);
    assert.doesNotMatch(chartWords.enrolCommand(said!), /localhost|127\.|\[::1\]|0\.0\.0\.0/u);
    /* WITH NO NAME TO PUT IN IT, no address is printed at all, and the sentence stands in for the command. */
    assert.equal(enrolAddress(here, true, null), null);
    assert.equal(enrolAddress(here, true, ''), null);
  }
  assert.doesNotMatch(chartWords.enrolNoAddress, /localhost|https?:|—/u);
  /* A HOSTED RECORD OPENED AT ITS OWN ADDRESS KEEPS IT, whatever that is. */
  assert.equal(enrolAddress('https://brain.dog/app/studio', true, 'studio'), 'https://brain.dog/app/studio');
  assert.equal(enrolAddress('https://records.example.com/app/studio', true, 'studio'), 'https://records.example.com/app/studio');
  /* A SELF-HOST IS WHEREVER ITS OWNER RUNS IT, a localhost included: that is the address its own runner enrols at. */
  assert.equal(enrolAddress('http://localhost:8787', false, null), 'http://localhost:8787');
  assert.equal(isLoopback('https://brain.dog'), false);
  assert.equal(isLoopback('http://192.168.1.20:8787'), false, 'a machine on the network is reachable from another one');
  assert.equal(isLoopback('https://localhost.example.com'), false);

  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /enrolCommand\(recordBase\)/u, 'the page prints its own address without asking whether it is hosted');
  assert.match(page, /enrolAddress\(\s*recordBase,\s*hostedHere\(page\.data as unknown as Shell\),/u);
});
