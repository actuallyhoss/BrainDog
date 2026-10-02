/**
 * The hub's sentence and the inputs of its tiles: each is worked out from the reads the tabs
 * already make, and the tests hold them to the rules that matter to a reader. A failure is the red part and nothing
 * else is; a share with a failure in it never reads as the whole; a chart is not drawn from nothing.
 *
 * DAYS ARE THIS MACHINE'S, as the screen's are the browser's, so every moment below is made with the local-time
 * constructor and the tests hold on any time zone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AutomationRow, RunRow } from '../../lib/flow/source.ts';
import type { ActionRow } from '../../lib/record/actions.ts';
import {
  canvasWords,
  dayKey,
  dayTitle,
  endedReading,
  failedAt,
  lastRunReading,
  pageSentence,
  runDurations,
  runMark,
  runLines,
  runParts,
  endedSplit,
  heatReading,
  hubSentence,
  intervalOf,
  lastLine,
  monthBars,
  monthReading,
  nextOf,
  nextReading,
  nextWeek,
  runDays,
  runHeat,
  spell,
  triggerIcon,
  type RunLine,
} from './hub.ts';

const at = (y: number, m: number, d: number, h = 9, min = 0): number => new Date(y, m - 1, d, h, min).getTime();
const iso = (t: number): string => new Date(t).toISOString();
const NOW = at(2026, 9, 29, 12);

function auto(name: string, over: Partial<AutomationRow> = {}): AutomationRow {
  return {
    id: name.toLowerCase().replace(/\s+/gu, '-'),
    name,
    version: 1,
    trigger: 'every',
    path: 'run',
    register: null,
    enabled: true,
    next: null,
    last: null,
    month: null,
    body: null,
    runs: [],
    older: null,
    ...over,
  };
}

function action(ingest: string, over: Partial<ActionRow> = {}): ActionRow {
  return {
    ingest,
    channel: 'pull',
    project: null,
    host: 'api.example.com',
    every: '1d',
    key: null,
    state: 'pending',
    next: null,
    last: null,
    month: { runs: 0, requests: 0, bytes: 0, failures: 0, held: 0 },
    days: [],
    ...over,
  };
}

function run(name: string, when: number, bad = false, kind: RunLine['kind'] = 'automation'): RunLine {
  return { key: `${name}:${when}`, kind, name, at: iso(when), said: bad ? 'Failed.' : 'Ran.', bad, path: null };
}

test('THE SENTENCE NAMES THE ONE THAT IS FAILING, AND ONLY THAT PHRASE NEEDS HIM', () => {
  const s = hubSentence([
    auto('Standup', { month: { runs: 30, failures: 0 } }),
    auto('Chase invoices', { last: { at: iso(NOW - 3_600_000), state: 'failed', say: null }, month: { runs: 12, failures: 3 } }),
    auto('Old one', { enabled: false }),
  ]);
  assert.deepEqual(s, { text: 'Two automations run by themselves, and Chase invoices is failing.', needs: 'Chase invoices is failing' });
  assert.ok(s && s.text.includes(s.needs));
});

test('WITH NOTHING FAILING NOW, THE MONTH IS COUNTED, AND A MONTH WITH NO FAILURE IS NOT RED', () => {
  assert.deepEqual(hubSentence([auto('A', { month: { runs: 4, failures: 2 } })]), {
    text: 'One automation runs by itself, and two runs failed this month.',
    needs: 'two runs failed this month',
  });
  assert.deepEqual(hubSentence([auto('A', { month: { runs: 4, failures: 0 } })]), { text: 'One automation runs by itself, and none failed this month.', needs: '' });
  /* A HOST THAT SENDS NO MONTH IS NOT TOLD "NONE FAILED". */
  assert.deepEqual(hubSentence([auto('A')]), { text: 'One automation runs by itself.', needs: '' });
  assert.equal(hubSentence([]), null);
  assert.equal(hubSentence([auto('A', { enabled: false }), auto('B', { enabled: false })])?.text, 'Every automation here is turned off.');
});

test('A ROW SAYS ITS LAST RUN ON ITS SECOND LINE AND ITS NEXT IN THE COLUMN, NEVER BOTH IN ONE', () => {
  const row = auto('A', { next: iso(NOW + 2 * 3_600_000), last: { at: iso(NOW - 3_600_000), state: 'failed', say: 'The key is missing.' } });
  assert.match(lastLine(row, NOW), /^Last run .*failed\. The key is missing\.$/u);
  assert.doesNotMatch(lastLine(row, NOW), /Next/u);
  assert.equal(nextOf(row, NOW), 'Next in 2h');
  assert.equal(nextOf({ ...row, enabled: false }, NOW), undefined);
  assert.equal(lastLine({ ...row, enabled: false }, NOW), 'Turned off.');
  assert.equal(triggerIcon('arrival'), 'bell');
  assert.equal(triggerIcon('something new'), 'refresh');
});

test('THE BARS ARE THE BUSIEST SIX, THE TOP ONE INK, AND ONE WITH A FAILURE RED WITH ITS COUNT', () => {
  const rows = [
    auto('Quiet', { month: { runs: 0, failures: 0 } }),
    auto('Chase invoices', { month: { runs: 12, failures: 3 } }),
    auto('Standup', { month: { runs: 30, failures: 0 } }),
    ...['C', 'D', 'E', 'F', 'G'].map((n, i) => auto(n, { month: { runs: 5 - i, failures: 0 } })),
  ];
  const bars = monthBars(rows);
  assert.equal(bars.length, 6);
  assert.deepEqual(bars[0], { label: 'Standup', value: 30, tone: 'ink', note: undefined });
  assert.deepEqual(bars[1], { label: 'Chase invoices', value: 12, tone: 'danger', note: '3 failed' });
  assert.equal(bars.some((b) => b.label === 'Quiet'), false, 'an automation that did not run is not a bar');
  assert.equal(monthReading(rows), 'Standup ran 30 times, the most this month; Chase invoices failed three of 12.');
});

test('HOW RUNS ENDED NEVER READS AS THE WHOLE WHILE ANYTHING FAILED', () => {
  const rows = [auto('A', { month: { runs: 299, failures: 0 } }), auto('B', { month: { runs: 1, failures: 1 } })];
  assert.deepEqual(endedSplit(rows), { runs: 300, failed: 1, ok: 299 });
  assert.equal(endedReading(rows), '99% finished; the failures are on B.');
  assert.equal(endedReading([auto('A', { month: { runs: 8, failures: 0 } })]), 'Every one of the 8 runs this month finished.');
  assert.equal(endedSplit([auto('A')]), null, 'no month, no chart');
});

test('RUNS ARE GROUPED BY THE DAY THEY STARTED, AND THE DAYS ARE SAID AS A PERSON SAYS THEM', () => {
  const lines = [run('A', at(2026, 9, 29, 10)), run('B', at(2026, 9, 29, 8)), run('A', at(2026, 9, 28, 22)), run('A', at(2026, 9, 24, 9))];
  const days = runDays(lines, NOW);
  assert.deepEqual(
    days.map((d) => [d.title, d.lines.length]),
    [
      ['Today', 2],
      ['Yesterday', 1],
      ['Thu 24 Sep', 1],
    ],
  );
  assert.equal(dayTitle(dayKey(NOW), NOW), 'Today');
});

test('THE HEAT GRID IS FOURTEEN DAYS, OLDEST FIRST, AND THE SIX THAT RAN MOST', () => {
  const lines = [
    run('Standup', at(2026, 9, 29, 8)),
    run('Standup', at(2026, 9, 28, 8)),
    run('Chase', at(2026, 9, 28, 9), true),
    run('Too old', at(2026, 9, 1, 9)),
  ];
  const heat = runHeat(lines, NOW);
  assert.ok(heat);
  assert.equal(heat.cols.length, 14);
  assert.equal(heat.cols.at(-1), '29');
  assert.equal(heat.cols[0], '16');
  assert.deepEqual(heat.rows, ['Standup', 'Chase']);
  assert.equal(heat.values[0]?.at(-1), 1);
  assert.equal(heat.values[0]?.at(-2), 1);
  assert.equal(heat.values[1]?.at(-2), 1);
  assert.equal(heatReading(lines, heat), 'Standup ran most, twice in the last 14 days; one failed, on Chase.');
  assert.equal(runHeat([run('Too old', at(2026, 9, 1))], NOW), null, 'nothing in the window, no chart');
});

test('NEXT UP PUTS A DOT ON EACH DAY AN ACTION IS DUE, ON ITS OWN CLOCK, AND NONE FOR A PAUSED ONE', () => {
  const rows = [
    action('gold_rate', { every: '1d', next: iso(at(2026, 9, 29, 18)) }),
    action('weekly', { every: '1w', next: iso(at(2026, 10, 1, 8)) }),
    action('often', { every: '15m', next: iso(at(2026, 9, 29, 12, 15)) }),
    action('stuck', { state: 'paused', next: iso(at(2026, 9, 30, 8)) }),
  ];
  const week = nextWeek(rows, NOW);
  assert.equal(week.days.length, 14);
  assert.equal(week.today, dayKey(NOW));
  const per = week.days.map((d) => d.items.length);
  /* Today: gold rate and the frequent one; the weekly one on 1 October and again on the 8th. */
  assert.equal(per[0], 2);
  assert.equal(per[2], 3);
  assert.equal(per[9], 3);
  assert.equal(per[3], 2);
  assert.equal(week.due.some((a) => a.ingest === 'stuck'), false);
  assert.equal(week.due[0]?.ingest, 'often');
  assert.equal(nextReading(week.due, NOW), 'Three scheduled actions run in the next 14 days; Often is next, in 15 min.');
  assert.equal(intervalOf('6h'), 6 * 3_600_000);
  assert.equal(intervalOf('monthly'), null);
});

test('A COUNT IS SPELLED AS A SENTENCE STARTS WITH IT', () => {
  assert.equal(spell(3, true), 'Three');
  assert.equal(spell(12), '12');
  assert.equal(spell(0), 'no');
});

function ran(state: RunRow['state'], started: number, over: Partial<RunRow> = {}): RunRow {
  return { id: `r${started}`, state, started: iso(started), finished: state === 'running' ? null : iso(started + 4000), say: null, steps: [], version: 1, trigger: 'every', ...over };
}

test("AN AUTOMATION'S RUNS: THE PARTS THEY ENDED IN, HOW LONG EACH TOOK, AND THE STEP THE LAST ONE FAILED AT", () => {
  const runs = [
    ran('failed', NOW - 3_600_000 * 2, {
      steps: [
        { n: 0, kind: 'if', state: 'done', answer: 'then', at: '' },
        { n: 1, kind: 'tag', state: 'done', answer: null, at: '' },
        { n: 3, kind: 'call', state: 'failed', answer: null, at: '' },
      ],
    }),
    ran('done', NOW - 3_600_000 * 26),
    ran('done', NOW - 3_600_000 * 50),
    ran('cancelled', NOW - 3_600_000 * 74),
  ];
  assert.deepEqual(
    runParts(runs).map((p) => [p.label, p.value, p.tone]),
    [
      ['Done', 2, 'earn'],
      ['Failed', 1, 'danger'],
      ['Stopped', 1, 'g3'],
    ],
  );
  assert.deepEqual(runDurations(runs), [4, 4, 4, 4]);
  /* THE JUMP BETWEEN A BRANCH'S ARMS IS THE RUNNER'S, NOT A STEP: plan index 3 is the third step a person counts. */
  const places = ['steps[0]', 'steps[0].then[0]', '', 'steps[0].else[0]'];
  assert.deepEqual(failedAt(runs[0]!, places), { n: 3, label: 'Call a service' });
  assert.equal(lastRunReading(runs, places, NOW), 'The last run failed 2h ago, at step 3: Call a service.');
  assert.equal(lastRunReading(runs.slice(1), null, NOW), 'The last run finished 1d ago, in 4s.');
  assert.equal(lastRunReading([ran('done', NOW - 60_000 * 5), ...runs], null, NOW), 'The last run finished 5 min ago, in 4s. One of the last 5 failed.');
  assert.equal(runMark('failed').tone, 'danger');
  assert.equal(runMark('done').tone, undefined, 'a finished run is the ordinary case and takes no colour');
});

test("THE PAGE'S SENTENCE MAKES THE FAILED CLAUSE THE RED ONE, AND SAYS NOTHING FOR A DRAFT", () => {
  const row = auto('A', { next: iso(NOW + 3_600_000), last: { at: iso(NOW - 7_200_000), state: 'failed', say: 'No key.' } });
  const s = pageSentence(row, NOW);
  assert.ok(s);
  assert.equal(s.text, 'Last run 2h ago, failed. No key. Next run in 1h.');
  assert.equal(s.needs, 'Last run 2h ago, failed.');
  assert.equal(pageSentence(null, NOW), null);
  assert.equal(pageSentence({ ...row, enabled: false }, NOW)?.needs, '');
});

test('EVERY RUN ON THE RUNS TAB SAYS HOW IT ENDED IN ITS OWN SENTENCE, newest first', () => {
  const a = auto('Standup', { last: { at: iso(NOW - 60_000 * 30), state: 'done', say: null } });
  const lines = runLines([a], new Map([[a.id, [ran('failed', NOW - 3_600_000, { say: 'No key.' }), ran('done', NOW - 7_200_000)]]]), [], [], NOW);
  assert.deepEqual(
    lines.map((l) => [l.said, l.bad]),
    [
      ['Failed 1h ago. No key.', true],
      ['Ran 2h ago.', false],
    ],
  );
});

/* WHAT ONE AUTOMATION'S PAGE SAYS NAMES THE PERSON'S THINGS, never the system's (DIRECTION §35). */
test("an automation's page says what it would act on, and never rows", () => {
  assert.equal(canvasWords.matchParts, 'What it would act on now');
  for (const w of Object.values(canvasWords))
    if (typeof w === 'string') assert.doesNotMatch(w, /\b(rows?|lists?|registers?|blocks?)\b/iu, w);
});
