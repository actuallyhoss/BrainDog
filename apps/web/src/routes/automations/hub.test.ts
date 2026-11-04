/**
 * The hub's sentence and the inputs of its tiles: each is worked out from the reads the tabs
 * already make, and the tests hold them to the rules that matter to a reader. A failure is the red part and nothing
 * else is; a share with a failure in it never reads as the whole; a chart is not drawn from nothing.
 *
 * DAYS ARE THIS MACHINE'S, as the screen's are the browser's, so every moment below is made with the local-time
 * constructor and the tests hold on any time zone.
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { AutomationRow, RunRow } from '../../lib/flow/source.ts';
import type { ActionRow } from '../../lib/record/actions.ts';
import {
  canvasWords,
  countSaid,
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
  hubWords,
  intervalOf,
  lastLine,
  monthBars,
  monthReading,
  nextOf,
  nextReading,
  nextWeek,
  ranPeriod,
  runDays,
  runHeat,
  ruleSaid,
  rowSaid,
  rowWhat,
  spell,
  triggerIcon,
  type RunLine,
} from './hub.ts';
import { clearHead, emptyHead, headFor } from './hub-head.ts';

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

/* THE PASS OF 27 OCTOBER: "100 automations run by themselves" stood over 64 Ledger filing rules, 43 never run. */
test('WITH THE RECORD\'S COUNT, THE SENTENCE SAYS HOW MANY RAN, HOW MANY NEVER DID, AND THE LIST MOST ARE ON', () => {
  const ledger = Array.from({ length: 12 }, (_, i) => auto(`Payee ${i}`, { register: 'transactions', fired: i < 5 ? 3 : 0, month: { runs: 0, failures: 0 } }));
  const rows = [...ledger, auto('Standup', { register: 'tasks', fired: 9, month: { runs: 9, failures: 2 } }), auto('Old one', { enabled: false, fired: 0 })];
  const s = hubSentence(rows, (id) => (id === 'transactions' ? 'Ledger' : id));
  assert.deepEqual(s, {
    text: '2 runs failed this month, all on tasks. 7 rules have never been needed.',
    needs: '2 runs failed this month',
  });
  /* A HOST THAT SENDS NO COUNT IS SAID AS BEFORE. */
  assert.equal(hubSentence([auto('Standup', { month: { runs: 3, failures: 0 } })])?.text, 'Nothing failed this month.');
});

test('THE SENTENCE NAMES THE ONE THAT IS FAILING, AND ONLY THAT PHRASE NEEDS HIM', () => {
  const s = hubSentence([
    auto('Standup', { month: { runs: 30, failures: 0 } }),
    auto('Chase invoices', { last: { at: iso(NOW - 3_600_000), state: 'failed', say: null }, month: { runs: 12, failures: 3 } }),
    auto('Old one', { enabled: false }),
  ]);
  assert.deepEqual(s, { text: 'Chase invoices is failing.', needs: 'Chase invoices is failing' });
  assert.ok(s && s.text.includes(s.needs));
});

test('WITH NOTHING FAILING NOW, THE MONTH IS COUNTED, AND A MONTH WITH NO FAILURE IS NOT RED', () => {
  assert.deepEqual(hubSentence([auto('A', { month: { runs: 4, failures: 2 } })]), {
    text: '2 runs failed this month.',
    needs: '2 runs failed this month',
  });
  assert.deepEqual(hubSentence([auto('A', { month: { runs: 4, failures: 0 } })]), { text: 'Nothing failed this month.', needs: '' });
  /* A HOST THAT SENDS NO MONTH IS NOT TOLD "NONE FAILED". */
  assert.deepEqual(hubSentence([auto('A')]), { text: '1 on.', needs: '' });
  assert.equal(hubSentence([]), null);
  assert.equal(hubSentence([auto('A', { enabled: false }), auto('B', { enabled: false })])?.text, 'All off.');
});

test('A ROW SAYS ITS LAST RUN ON ITS SECOND LINE AND ITS NEXT IN THE COLUMN, NEVER BOTH IN ONE', () => {
  const row = auto('A', { next: iso(NOW + 2 * 3_600_000), last: { at: iso(NOW - 3_600_000), state: 'failed', say: 'The key is missing.' } });
  assert.match(lastLine(row, NOW), /^Last run .*failed\. The key is missing\.$/u);
  assert.doesNotMatch(lastLine(row, NOW), /Next/u);
  assert.equal(nextOf(row, NOW), 'Next in 2h');
  assert.equal(nextOf({ ...row, enabled: false }, NOW), undefined);
  assert.equal(lastLine({ ...row, enabled: false }, NOW), 'Turned off.');
  assert.equal(triggerIcon('something new'), 'refresh');
});

test('A ROW WEARS THE ICON OF WHAT STARTS IT, and a change to a list wears that list\'s own', () => {
  assert.equal(triggerIcon('every'), 'clock');
  assert.equal(triggerIcon('arrival'), 'inbox');
  assert.equal(triggerIcon('decided'), 'decide');
  assert.equal(triggerIcon('manual'), 'play');
  assert.equal(triggerIcon('metric'), 'observe');
  assert.equal(triggerIcon('written', 'money'), 'money', 'a change to a list wears the glyph the rail draws that list with');
  assert.equal(triggerIcon('written'), 'rows', 'a list the shell does not draw is the glyph of any list');
  assert.equal(triggerIcon('every', 'money'), 'clock', 'only a change to a list takes the list\'s glyph');
  /* EIGHTEEN ROWS WORE THREE ICONS BETWEEN THEM: every kind that can start one has its own now. */
  const kinds = ['every', 'arrival', 'decided', 'manual', 'metric', 'written'];
  assert.equal(new Set(kinds.map((k) => triggerIcon(k))).size, kinds.length);
});

test('ONE THE RECORD KEEPS NO RUNS OF SAYS WHEN THE LOG LAST HAS IT, never "Not run yet"', () => {
  /* The record answers `last: null` for an automation that runs inside the change that starts it, however often it ran. */
  const inline = auto('Keep balances current', { trigger: 'written', path: 'inline', register: 'accounts' });
  assert.equal(lastLine({ ...inline, acted: iso(NOW - 2 * 3_600_000) }, NOW), 'Last ran 2h ago.');
  assert.equal(lastLine({ ...inline, acted: null }, NOW), 'Has done nothing lately.', 'the newest page of the log holds nothing from it');
  assert.equal(lastLine(inline, NOW), '', 'with the log unread it says nothing rather than guess');
  for (const row of [inline, { ...inline, acted: null }, { ...inline, acted: iso(NOW) }]) assert.doesNotMatch(lastLine(row, NOW), /Not run yet/u);
  /* ONE THAT WOULD HAVE LEFT A RUN AND HAS NONE HAS NOT RUN YET, and that is still said. */
  assert.equal(lastLine(auto('Standup'), NOW), 'Not run yet.');
  assert.equal(lastLine({ ...inline, enabled: false, acted: iso(NOW) }, NOW), 'Turned off.');
  /* THE PAGE'S SENTENCE SAYS THE SAME, and a draft with nothing true to say has none. */
  assert.deepEqual(pageSentence({ ...inline, acted: iso(NOW - 2 * 3_600_000) }, NOW), { text: 'Last ran 2h ago.', needs: '' });
  assert.equal(pageSentence(inline, NOW), null);
});

test('A RULE THE RECORD COUNTED SAYS HOW OFTEN IT RAN AND THE DAY IT LAST DID, never "nothing lately"', () => {
  const inline = auto('File parcels by courier', { trigger: 'written', path: 'inline', register: 'parcels' });
  const counted = { ...inline, acted: null, fired: 12, last_at: new Date(2026, 9, 3, 9).toISOString() };
  assert.equal(lastLine(counted, NOW), 'Ran 12 times in all, last on 3 Oct.');
  assert.equal(lastLine({ ...counted, fired: 1 }, NOW), 'Ran once in all, on 3 Oct.');
  assert.equal(lastLine({ ...counted, last_at: iso(NOW - 3_600_000) }, NOW), 'Ran 12 times in all, last today.');
  assert.equal(lastLine({ ...counted, last_at: new Date(2025, 11, 30, 9).toISOString() }, NOW), 'Ran 12 times in all, last on 30 Dec 2025.');
  assert.doesNotMatch(lastLine(counted, NOW), /lately/u, 'the count is the whole of it, not a page of the log');
  assert.deepEqual(pageSentence(counted, NOW), { text: 'Ran 12 times in all, last on 3 Oct.', needs: '' });
  assert.equal(countSaid(inline, NOW), '', 'a host that sends no count says nothing from one');
});

test('THE WEEK FOLLOWS THE WHOLE COUNT WHEN THE RECORD SENT IT, and a quiet week is said as none', () => {
  const inline = auto('Remind me of bills', { trigger: 'written', path: 'inline', register: 'parcels' });
  const counted = { ...inline, acted: null, fired: 12, last_at: iso(NOW - 3_600_000) };
  assert.equal(lastLine({ ...counted, week: 3 }, NOW), 'Ran 12 times in all, last today. 3 this week.');
  assert.equal(lastLine({ ...counted, week: 0 }, NOW), 'Ran 12 times in all, last today. None this week.');
  assert.equal(lastLine(counted, NOW), 'Ran 12 times in all, last today.', 'a host that sends no week says none');
  /* AND THE MONTH IN ITS PLACE WHERE THE RECORD KEEPS IT (DR2), as the tiles above and Usage say. */
  assert.equal(lastLine({ ...counted, week: 3, month_fired: 5 }, NOW), 'Ran 12 times in all, 5 this month, last today.');
  assert.equal(lastLine({ ...counted, week: 3, month_fired: 0 }, NOW), 'Ran 12 times in all, none this month, last today.');
});

test('A RULE THAT NEVER RAN SAYS "NEVER" AND THE RECORD\'S ONE SENTENCE ON WHY', () => {
  const idle = auto('Shelve big parcels', { trigger: 'written', path: 'inline', register: 'parcels', acted: null });
  const why = 'No entry has been added to Parcels since it was turned on.';
  assert.equal(lastLine({ ...idle, fired: 0, last_at: null, why_idle: why }, NOW), `Never ran. ${why}`);
  assert.equal(lastLine({ ...idle, fired: 0, why_idle: '34 were added to Parcels and none matched.' }, NOW), 'Never ran. 34 were added to Parcels and none matched.');
  assert.equal(lastLine({ ...idle, fired: 0, why_idle: null }, NOW), 'Never ran.', 'with no sentence it still says never');
  assert.equal(lastLine({ ...idle, fired: 0, why_idle: why, enabled: false }, NOW), 'Turned off.');
});

test('A COUNTED RULE WHOSE LAST RUN FAILED SAYS THE COUNT, THEN THE FAILURE', () => {
  const row = { ...auto('Weekly digest', { last: { at: iso(NOW - 3_600_000), state: 'failed' as const, say: 'The key is missing.' } }), fired: 8, last_at: iso(NOW - 3_600_000) };
  assert.match(lastLine(row, NOW), /^Ran 8 times in all, last today\. Last run .*failed\. The key is missing\.$/u);
  assert.equal(lastLine({ ...row, last: { ...row.last!, state: 'done' } }, NOW), 'Ran 8 times in all, last today.');
});

test('A RULE IN A FAMILY CARRIES THE LIST AND WHAT IT SETS, IN WORDS, beside the key', () => {
  const body = { on: { written: { register: 'parcels' } }, then: [{ set: { field: 'shelf_code', to: 'B2' } }, { tag: 'big' }] };
  const row = { ...auto('Shelve by courier', { register: 'parcels', body }), fired: 4, last_at: iso(NOW), family: 'parcels/inline/set:shelf_code+tag' };
  assert.deepEqual(ruleSaid(row, (id) => (id === 'parcels' ? 'Parcels' : id)), {
    family: { key: 'parcels/inline/set:shelf_code+tag', list: 'Parcels', did: ['Shelf code', 'Tags'] },
    fired: 4,
    /* THE MONTH'S COUNT WHERE THE RECORD KEEPS ONE (b29a04cc4); this row carries none, so it is no figure. */
    month: undefined,
    lastAt: iso(NOW),
  });
  assert.deepEqual(ruleSaid(auto('Loose'), String), { fired: undefined, month: undefined, lastAt: undefined });
  assert.equal(ruleSaid({ ...auto('Counted'), fired: 4, month_fired: 2 }, String).month, 2, 'the month the record keeps is the rule\'s');
});

test('AN OWNER\'S ROW ENDS IN A SWITCH, a row is a link only without one, and the switch is never inside a link', () => {
  const rows = readFileSync(new URL('./HubRows.svelte', import.meta.url), 'utf8');
  const markup = rows.slice(rows.indexOf('</script>'), rows.indexOf('<style>')).replace(/<!--[\s\S]*?-->/gu, '');
  assert.match(markup, /role="switch"/u);
  assert.match(markup, /aria-checked=\{t\.on\}/u);
  assert.match(markup, /aria-label=\{t\.label\}/u);
  /* The switched row is a `div`, and its name is the link stretched over it. */
  const switched = markup.slice(markup.indexOf('{#if t && ontoggle}'), markup.indexOf('{:else if r.path}'));
  assert.match(switched, /<div class="row line line-tall switched"/u);
  assert.doesNotMatch(switched, /<a class="row/u, 'a switch sits inside a link');
  assert.match(markup, /<a class="line-title name open tap"/u);
  /* 44 UNDER A THUMB comes from the house switch, so the row must use it and not a drawing of its own. */
  assert.match(switched, /class="switch"/u);
  const controls = readFileSync(new URL('../../lib/ui/controls.css', import.meta.url), 'utf8');
  assert.match(controls, /@media \(pointer: coarse\) \{\s*\.switch \{\s*min-inline-size: var\(--tap\);\s*min-block-size: var\(--tap\);/u);
  const tab = readFileSync(new URL('./AutomationsTab.svelte', import.meta.url), 'utf8');
  /* THE SWITCH'S LABEL SAYS THE RULE AS ITS ROW DOES (`ruleNameSaid`). */
  assert.match(tab, /toggle: owner \? \{ on: r\.enabled, label: w\.switchOf\(ruleNameSaid\(r\.name\)\) \} : undefined/u, 'the switch is drawn for somebody the record would refuse');
  assert.match(tab, /openAutomations\(\(url, init\) => fetch\(url, init\), apiBase\(\), \{ acted: true \}\)/u);
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
  assert.deepEqual(bars[0], { label: 'Standup', value: 30, part: undefined, said: undefined });
  /* THE FAILED RUNS ARE THEIR SHARE OF THE BAR, never the whole bar red. */
  assert.deepEqual(bars[1], { label: 'Chase invoices', value: 12, part: 3, said: '12 · 3 failed' });
  assert.equal(bars.some((b) => b.label === 'Quiet'), false, 'an automation that did not run is not a bar');
  assert.equal(monthReading(rows), 'Standup ran 30 times, the most this month; Chase invoices failed three of 12.');
});

test('HOW RUNS ENDED NEVER READS AS THE WHOLE WHILE ANYTHING FAILED', () => {
  const rows = [auto('A', { month: { runs: 299, failures: 0 } }), auto('B', { month: { runs: 1, failures: 1 } })];
  assert.deepEqual(endedSplit(rows), { runs: 300, failed: 1, ok: 299 });
  assert.equal(endedReading(rows), '99% finished; the failures are on B.');
  assert.equal(endedReading([auto('A', { month: { runs: 8, failures: 0 } })]), 'Every one of the 8 runs this month finished.');
  assert.equal(endedReading([auto('A', { month: { runs: 1, failures: 0 } })]), 'The one run this month finished.');
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
  assert.equal(heatReading(lines, heat), 'Standup ran most, 2 times in the last 14 days; one failed, on Chase.');
  assert.equal(runHeat([run('Too old', at(2026, 9, 1))], NOW), null, 'nothing in the window, no chart');
  /* A TIE NAMES NONE AS RUNNING MOST. */
  const tie = [run('Standup', at(2026, 9, 29, 8)), run('Chase', at(2026, 9, 29, 9))];
  assert.equal(heatReading(tie, runHeat(tie, NOW)!), 'Two automations ran today, and none failed.');
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

/* WHAT ONE AUTOMATION'S PAGE SAYS NAMES THE PERSON'S THINGS, never the system's. */
test("an automation's page says what it would act on, and never rows", () => {
  assert.equal(canvasWords.matchParts, 'What it would act on now');
  for (const w of Object.values(canvasWords))
    if (typeof w === 'string') assert.doesNotMatch(w, /\b(rows?|lists?|registers?|blocks?)\b/iu, w);
});

test("A HELD RUN THAT SAYS WHY ITSELF IS NOT BLAMED ON THE MONTH'S LIMIT, and one that says nothing still is", () => {
  const off = 'This server does not send requests. Its operator can switch that on.';
  const at = iso(NOW - 120_000);
  const [said] = runLines([], new Map(), [action('rates', { last: { at, outcome: 'held', status: null, note: off } })], [], NOW);
  assert.doesNotMatch(said!.said, /month's limit/);
  assert.match(said!.said, new RegExp(`^Held .+\\. ${off.replace(/\./g, '\\.')}$`));
  const [quiet] = runLines([], new Map(), [action('rates', { last: { at, outcome: 'held', status: null, note: '' } })], [], NOW);
  assert.match(quiet!.said, /by this month's limit\.$/);
});

/* THE HEAD OVER THE HUB (`hub-head.ts`, `+layout.svelte`). The head outlives the page under it, so a figure read on
   one visit to a tab was still there on the next, shown as today's while the page read again. */

test('AFTER A TAB CHANGE THE HEAD SHOWS NO COUNT UNTIL THE PAGE UNDER IT HAS READ ITS OWN', () => {
  const head = emptyHead();
  /* The Automations tab reads four, one failing. */
  head.automations = 4;
  head.said = { text: '4 run by themselves. Chase invoices is failing.', needs: 'Chase invoices is failing.' };
  /* He goes to Runs: nothing of the tab he left is kept, and Runs says nothing until it has read. */
  clearHead(head);
  assert.deepEqual(head, emptyHead());
  assert.deepEqual(headFor('runs', head), { count: undefined, sentence: undefined, needs: undefined });
  head.runs = 31;
  assert.equal(headFor('runs', head).count, 31);
  /* Back on Automations, where one was deleted meanwhile: the old four and the old sentence are not shown as
     today's, and the three it reads now are. */
  clearHead(head);
  assert.deepEqual(headFor('automations', head), { count: undefined, sentence: undefined, needs: undefined });
  head.automations = 3;
  head.said = { text: '3 run by themselves.', needs: '' };
  assert.deepEqual(headFor('automations', head), { count: 3, sentence: '3 run by themselves.', needs: undefined });
  /* The same object is cleared, never swapped: the pages hold it, and a new one would never hear them. */
  const held = head;
  assert.equal(clearHead(head), held);
});

test('THE LAYOUT CLEARS THE HEAD WHEN THE TAB CHANGES, BEFORE THE PAGE UNDER IT SAYS ANYTHING', () => {
  const layout = readFileSync(new URL('./+layout.svelte', import.meta.url), 'utf8').replaceAll(/<!--[\s\S]*?-->/gu, '');
  /* `$effect.pre`, not `$effect`: a page writes its count in a plain effect as it is drawn, and a clear that ran
     after it would wipe the fresh figure for good. */
  assert.match(layout, /\$effect\.pre\(\(\) => \{\s*void tab;\s*clearHead\(head\);\s*\}\);/u);
  /* It follows the tab alone. Read off the whole address, a sheet opening (`?new=`) would blank a count still true. */
  const clear = /\$effect\.pre\(\(\) => \{[\s\S]*?\}\);/u.exec(layout)?.[0] ?? '';
  assert.doesNotMatch(clear, /page\./u);
});

test('an automation row is short: what starts it in a few words, then what it did as a date', () => {
  assert.equal(rowWhat('When an item in Bills and invoices is added or changed'), 'When Bills and invoices change');
  assert.equal(rowWhat('When an item in Ledger is added or changed, only when amount is more than 500'), 'When Ledger changes');
  assert.equal(rowWhat('When an item in Plans is added'), 'When something is added to Plans');
  assert.equal(rowWhat('When anything arrives'), 'When anything arrives');
  const counted = (fired: number, last_at: string | null, over: Partial<AutomationRow> = {}) => ({ ...auto('Chase', over), fired, last_at, why_idle: 'No entry has been added since it was turned on.' });
  assert.equal(rowSaid(counted(0, null), NOW), 'Never ran', 'why it never ran is the automation page\'s to say');
  assert.equal(rowSaid(counted(17, iso(at(2026, 9, 3, 14))), NOW), 'Ran 17 times in all, last 3 Sep');
  assert.equal(rowSaid(counted(1, iso(at(2026, 9, 3, 14))), NOW), 'Ran once in all, on 3 Sep');
  assert.equal(rowSaid(counted(4, iso(at(2026, 9, 3, 14)), { enabled: false }), NOW), 'Off');
});

test('A RULE THE RECORD COUNTS AND KEEPS NO RUN OF STILL HAS ITS LAST FIRING ON THE RUNS TAB', () => {
  const counted = { ...auto('Categorise what cleared'), fired: 17, last_at: iso(at(2026, 9, 3, 14)) };
  const lines = runLines([counted, auto('Never')], new Map(), [], [], NOW);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.name, 'Categorise what cleared');
  assert.match(lines[0]?.said ?? '', /^Ran 17 times/u);
});

test('THE MONTH OF RUNS SAYS A RULE THAT ACTED ON CHANGES IS COUNTED ON ITS ROW (finish F53)', () => {
  const now = Date.parse('2026-09-03T15:00:00Z');
  const weekly = auto('Weekly review', { month: { runs: 1, failures: 0 } });
  const ledger = auto('Categorise what cleared', { path: 'inline', fired: 17, last_at: '2026-09-03T06:35:00.000Z' });
  assert.equal(monthReading([weekly], now), 'Weekly review ran once, the most this month, and nothing failed.');
  assert.equal(monthReading([weekly, ledger], now), `Weekly review ran once, the most this month, and nothing failed. ${hubWords.rulesApart}`);
  /* A RULE THAT LAST ACTED IN AN EARLIER MONTH SAYS NOTHING OF THIS ONE. */
  assert.equal(monthReading([weekly, { ...ledger, last_at: '2026-08-30T06:35:00.000Z' }], now), 'Weekly review ran once, the most this month, and nothing failed.');
});

test('WHERE THE RECORD KEEPS EVERY RULE\'S MONTH, EVERY RULE IS IN THE TILE AND NONE IS SAID APART (audit 6f AF9)', () => {
  const now = Date.parse('2026-09-03T15:00:00Z');
  const weekly = auto('Weekly review', { month: { runs: 1, failures: 0 }, fired: 1, month_fired: 1 });
  const ledger = auto('Categorise what cleared', { path: 'inline', fired: 17, last_at: '2026-09-03T06:35:00.000Z', month_fired: 4 });
  const quiet = auto('Tag the rent', { path: 'inline', fired: 2, last_at: '2026-08-01T06:35:00.000Z', month_fired: 0 });
  assert.equal(monthReading([weekly, ledger, quiet], now), 'Categorise what cleared ran 4 times, the most this month, and nothing failed.');
  assert.deepEqual(endedSplit([weekly, ledger, quiet]), { runs: 5, failed: 0, ok: 5 });
  assert.deepEqual(monthBars([weekly, ledger, quiet]).map((b) => [b.label, b.value]), [['Categorise what cleared', 4], ['Weekly review', 1]]);
  /* EACH COUNT SAYS ITS PERIOD. */
  assert.equal(ranPeriod(17, 4), '17 times in all, 4 this month');
  assert.equal(ranPeriod(17, 17), '17 times, all this month');
  assert.equal(ranPeriod(2, 0), '2 times in all, none this month');
  assert.equal(ranPeriod(12), '12 times in all');
});
