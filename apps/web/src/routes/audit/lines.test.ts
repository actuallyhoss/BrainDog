/**
 * Activity's pure half: the sentence under the title, the hour bands, the lanes, the tally and the busy hours.
 *
 * EVERY MOMENT HERE IS MADE ON THE READER'S CLOCK (`new Date(y, m, d, h)`), because that is the clock the screen says
 * them on, so the file holds in any zone the tests run in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AuditEvent, EventKind } from '../../lib/record/schema.ts';
import {
  historyWords,
  awaySaid,
  below,
  burstsOf,
  busyOf,
  busySaid,
  changesOf,
  clockOf,
  dayOf,
  dayWord,
  fold,
  foldKeys,
  foldOpen,
  dayGroups,
  hourGroups,
  HOURS,
  isBookkeeping,
  keepsBooks,
  keyOf,
  lanesOf,
  lanesSaid,
  LIVE_MS,
  reaches,
  RUN_FOLD_MIN,
  runFolds,
  tallyOf,
  tallySaid,
  thingOf,
  type Told,
} from './lines.ts';

const local = (d: number, h: number, m = 0): number => new Date(2026, 8, d, h, m).getTime();
const iso = (d: number, h: number, m = 0): string => new Date(local(d, h, m)).toISOString();
/** Tuesday 29 September 2026, 09:40 on the reader's wall. */
const NOW = local(29, 9, 40);
const NO_NAMES: ReadonlyMap<string, string> = new Map();

let seq = 1000;
const ev = (at: string, by = 'you', kind: EventKind = 'edit', target?: string, note = ''): AuditEvent => ({
  seq: seq--,
  at,
  by,
  kind,
  ...(target === undefined ? {} : { target }),
  note,
  version: seq + 1,
});
const one = (e: AuditEvent): Told => ({ key: keyOf(e), e, count: 1, many: null, note: e.note, from: e.at });

test('a moment is said on the reader’s own clock', () => {
  assert.equal(dayOf(iso(29, 9, 5)), '2026-09-29');
  assert.equal(clockOf(iso(29, 9, 5)), '09:05');
  assert.equal(dayOf(local(28, 23, 59)), '2026-09-28');
});

test('a day is said from today: Today, Yesterday, a weekday, then a date', () => {
  assert.equal(dayWord(local(29, 1), NOW), 'Today');
  assert.equal(dayWord(local(28, 23), NOW), 'Yesterday');
  assert.equal(dayWord(local(26, 12), NOW), 'Saturday');
  assert.equal(dayWord(local(12, 12), NOW), '12 Sep', 'September is Sep here as on every other screen, never Sept');
});

test('today is banded by the hour, the first band says the day, and an older day is one band', () => {
  const lines = [iso(29, 9, 39), iso(29, 9, 31), iso(29, 8, 31), iso(28, 23, 18), iso(28, 22, 5), iso(26, 10)].map((at) => one(ev(at)));
  const bands = hourGroups(lines, NOW);
  assert.deepEqual(
    bands.map((b) => [b.title, b.lines.length]),
    [
      ['Today 09:00', 2],
      ['08:00', 1],
      ['Yesterday', 2],
      ['Saturday', 1],
    ],
  );
  assert.equal(new Set(bands.map((b) => b.key)).size, bands.length, 'every band has its own key, which the page keys its sections on');
});

test('a day on its own, as the day filter leaves it, is banded by the hour too', () => {
  const bands = hourGroups([iso(28, 23, 18), iso(28, 23, 2), iso(28, 22, 5)].map((at) => one(ev(at))), NOW);
  assert.deepEqual(bands.map((b) => b.title), ['Yesterday 23:00', '22:00']);
});

test('the stream is one band a day, each with its hours inside it, newest first', () => {
  const lines = [iso(29, 9, 39), iso(29, 9, 31), iso(29, 8, 31), iso(28, 23, 18), iso(28, 22, 5), iso(26, 10), iso(29, 9, 2)].map((at) => one(ev(at)));
  const days = dayGroups(lines, NOW);
  assert.deepEqual(
    days.map((d) => [d.title, d.count, d.hours.map((h) => [h.title, h.lines.length])]),
    [
      ['Today', 4, [['09:00', 3], ['08:00', 1]]],
      ['Yesterday', 2, [['23:00', 1], ['22:00', 1]]],
      ['Saturday', 1, [['10:00', 1]]],
    ],
  );
  assert.equal(new Set(days.flatMap((d) => d.hours.map((h) => h.key))).size, 5, 'every hour has its own key, across days too');
});

test('a band met again takes its line rather than drawing a second heading', () => {
  const bands = hourGroups([iso(29, 9, 30), iso(29, 8, 30), iso(29, 9, 10)].map((at) => one(ev(at))), NOW);
  assert.deepEqual(bands.map((b) => [b.title, b.lines.length]), [['Today 09:00', 2], ['08:00', 1]]);
});

test('an agent’s lines become stretches, split at a gap over half an hour, and the newest one runs to now', () => {
  const log = [
    ev(iso(29, 9, 35), 'agent:codex'),
    ev(iso(29, 9, 20), 'agent:codex'),
    ev(iso(29, 1, 50), 'agent:codex'),
    ev(iso(29, 6, 2), 'agent:claude'),
    ev(iso(29, 4, 40), 'agent:claude'),
    ev(iso(29, 4, 55), 'agent:claude'),
    ev(iso(29, 5, 30), 'you'),
    ev(iso(29, 5, 0), 'rule.reply'),
    ev(iso(27, 9, 0), 'agent:cursor'),
  ];
  const lanes = lanesOf(log, NOW, null, NO_NAMES);
  assert.deepEqual(lanes.map((l) => l.label), ['Codex', 'Claude'], 'the one that wrote last first, and nobody older than a day');
  const [codex, claude] = lanes;
  assert.equal(codex!.spans.length, 2);
  assert.deepEqual(codex!.spans.at(-1), { from: local(29, 9, 20), to: local(29, 9, 35), live: true });
  /* 04:40, 04:55 and 06:02: the hour and seven minutes before the last line splits it, and a line on its own is drawn
     five minutes long, so it is a mark. */
  assert.deepEqual(
    claude!.spans.map((s) => [s.from, s.to, s.live]),
    [
      [local(29, 4, 40), local(29, 4, 55), false],
      [local(29, 6, 2), local(29, 6, 7), false],
    ],
  );
  /* A LONE LINE IS DRAWN FIVE MINUTES LONG, so it is a mark. */
  assert.equal(codex!.spans[0]!.to - codex!.spans[0]!.from, 5 * 60_000);
  assert.equal(lanesSaid(lanes), 'Codex ran 2 stretches and Claude 2. Codex is working now.');
});

test('working now is ten minutes, and no longer', () => {
  const lanes = lanesOf([ev(new Date(NOW - LIVE_MS - 1).toISOString(), 'agent:claude')], NOW, null, NO_NAMES);
  assert.equal(lanes[0]!.spans[0]!.live, false);
  assert.equal(lanesSaid(lanes), 'Claude ran 1 stretch.');
  assert.equal(lanesSaid([]), '');
});

test('what changed counts who and what, and says the biggest share', () => {
  const log = [
    ev(iso(29, 9), 'agent:claude', 'create'),
    ev(iso(29, 8), 'agent:claude', 'create'),
    ev(iso(29, 7), 'you', 'create'),
    ev(iso(29, 6), 'you', 'edit'),
    ev(iso(29, 5), 'rule.reply', 'state'),
  ];
  const t = tallyOf(log, null, NO_NAMES);
  assert.equal(t.total, 5);
  assert.deepEqual(t.groups, [
    { group: 'agent', count: 2 },
    { group: 'rule', count: 1 },
    { group: 'you', count: 2 },
  ]);
  assert.deepEqual(t.kinds[0], { kind: 'create', count: 3, agents: 2 });
  const word = (k: EventKind) => ({ create: 'Created', edit: 'Changed', state: 'Moved' })[k as 'create'] ?? k;
  const said = t.kinds.map((k) => ({ word: word(k.kind), count: k.count, agents: k.agents }));
  assert.equal(tallySaid(said, t.total), 'Created is the biggest share: 3 of 5, and agents made 2 of them.');
  assert.equal(tallySaid([{ word: 'Created', count: 2, agents: 2 }], 2), 'Created is all of it: 2, all of them by agents.');
  assert.equal(
    tallySaid([{ word: 'Created', count: 2, agents: 0 }, { word: 'Changed', count: 2, agents: 0 }], 4),
    'Created and Changed tie for the biggest share, 2 each.',
  );
  assert.equal(tallySaid([], 0), '');
});

test('busy hours are the seven days to today by the hour, and the reading names the busy and the quiet stretch', () => {
  const log = [
    ev(iso(29, 9, 5)),
    ev(iso(29, 8, 50)),
    ev(iso(28, 8, 10)),
    ev(iso(28, 9, 10)),
    ev(iso(23, 21, 0)),
    ev(iso(22, 9, 0)),
  ];
  const b = busyOf(log, NOW);
  assert.equal(b.rows.length, 7);
  assert.equal(b.rows.at(-1), 'Tue', 'today is the last row');
  assert.equal(b.start, local(23, 0));
  assert.equal(b.total, 5, 'the 22nd is before the week');
  assert.equal(b.values[6]![9], 1);
  assert.equal(b.values[0]![21], 1);
  assert.equal(busySaid(b.values), 'Busiest from 08:00 to 10:00; the quietest hours are 10:00 to 21:00.');
  const lone = HOURS.map((_, h) => (h === 14 ? 3 : h === 13 || h === 15 ? 0 : 1));
  assert.equal(busySaid([lone]), 'Busiest from 14:00 to 15:00; the quietest hour is 13:00.', 'one hour stands alone when its neighbours add nothing');
  assert.equal(busySaid(busyOf([], NOW).values), 'Nothing changed in the last 7 days.');
});

test('the sentence under the title counts what changed while the reader was away, and how much the agents did', () => {
  const agents = Array.from({ length: 22 }, () => 'agent:claude');
  const yours = Array.from({ length: 4 }, () => 'you');
  assert.equal(awaySaid([...agents, ...yours], null, NO_NAMES, false), '26 things changed while you were away; 22 of them by agents.');
  assert.equal(awaySaid(['agent:codex'], null, NO_NAMES, false), 'One thing changed while you were away, by an agent.');
  assert.equal(awaySaid(['you', 'agent:codex'], null, NO_NAMES, false), '2 things changed while you were away; one of them by an agent.');
  assert.equal(awaySaid(['you', 'you'], null, NO_NAMES, false), '2 things changed while you were away.');
  assert.equal(awaySaid(['S4', 'slash'], null, NO_NAMES, false), '2 things changed while you were away; all of them by agents.');
  assert.equal(awaySaid([...agents, 'you'], null, NO_NAMES, true), 'More than 23 things changed while you were away; agents made 22 of the newest 23.');
  assert.equal(awaySaid([], null, NO_NAMES, false), 'Nothing changed since you last looked.');
});

test('the newest page read again adds what arrived on top, and a page that does not meet what is held stands alone', () => {
  const held = [ev(iso(29, 9)), ev(iso(29, 8))];
  const arrived = ev(iso(29, 9, 30));
  const again = fold(held, [arrived, held[0]!, held[1]!]);
  assert.equal(again.joined, true);
  assert.deepEqual(again.events, [arrived, ...held]);
  assert.deepEqual(again.added, [keyOf(arrived)]);
  const gap = fold(held, [ev(iso(29, 9, 39)), ev(iso(29, 9, 38))]);
  assert.equal(gap.joined, false);
  assert.equal(gap.events.length, 2);
  assert.deepEqual(gap.added, [], 'a screen redrawn from scratch is not a row arriving');
  assert.deepEqual(below(held, [held[1]!, arrived]), [...held, arrived]);
});

test('a line with no place in the log is still one line: it is known by what it says', () => {
  const a = { ...ev(iso(29, 9)), seq: 0, version: 0 };
  const b = { ...a };
  assert.equal(keyOf(a), keyOf(b));
  assert.notEqual(keyOf(a), keyOf({ ...a, note: 'else' }));
  const told = burstsOf([a, b]);
  assert.equal(new Set(told.map((t) => t.key)).size, 2, 'two lines that say the same are still two keys to draw');
});

test('a window is whole when the read reaches back past its start', () => {
  const log = [ev(iso(29, 9)), ev(iso(28, 9))];
  assert.equal(reaches(log, false, local(20, 0)), true, 'the whole log was read');
  assert.equal(reaches(log, true, local(28, 9, 40)), true);
  assert.equal(reaches(log, true, local(28, 8)), false);
});

test('a row is its title, and its list is said apart from it', () => {
  assert.deepEqual(thingOf('services#6', 'Object storage'), { text: 'Object storage', href: '/r/services/6', list: 'Services' });
  assert.equal(thingOf('services#6', null)?.text, 'an entry');
  assert.equal(thingOf('suggestion:SG3', null)?.text, 'a question');
});

test('a burst over many rows is said as how many rows, with their list', () => {
  const run = [1, 2, 3, 4].map((n) => ev(iso(29, 9, 10 - n), 'rule.bank', 'create', `payments#${n}`, 'From the statement'));
  const [told] = burstsOf(run);
  assert.equal(told!.count, 4);
  assert.deepEqual(told!.many, { text: '4 entries', href: '/r/payments', list: 'Payments' });
  assert.equal(told!.note, 'From the statement');
});

/* THE LOG SAYS AN ENTRY IN THE PERSON'S OWN LIST, named beside it, and never a row or a list (DIRECTION §35). */
test('the log names no row and no list in its own words', () => {
  for (const line of [historyWords.aRow, historyWords.rows(1), historyWords.rows(4), historyWords.everyList('Payments'), historyWords.onlyList('Payments')])
    assert.doesNotMatch(line, /\b(rows?|lists?|registers?|blocks?)\b/iu, line);
  assert.equal(historyWords.rows(1), 'one entry');
});

/* ── changes, and the record keeping its books ─────────────────────────── */

/**
 * WHAT THE OWNER'S RECORD HELD ON 2 OCTOBER, in the shapes `readLog` hands the page: the hourly sweep marking a quiet run
 * abandoned, a run's working folder moving, the daily stamp of when a tool was last seen, and between them the changes.
 */
test('the record keeping its books is told from a change to somebody’s things', () => {
  const sweep = ev(iso(29, 9), 'system', 'state', 'session#712', 'Nothing heard from this run in twelve hours.');
  const folder = ev(iso(29, 9), 'S729', 'edit', 'session#729', 'cwd set to /Users/mara/Developer/braindog');
  const runNote = ev(iso(29, 9), 'S729', 'edit', 'session#729', 'next set to Ship the payout retry');
  const stamp = { ...ev(iso(29, 9), 'S729', 'edit', 'tools#3', 'last seen set to 2 Oct 2026'), field: 'seen' };
  const stampSaid = ev(iso(29, 9), 'S729', 'edit', 'tools#3', 'last seen from 1 Oct 2026 to 2 Oct 2026');
  for (const e of [sweep, folder, runNote, stamp, stampSaid]) assert.equal(isBookkeeping(e), true, `${e.target} ${e.note} is drawn as a change`);

  const changes = [
    ev(iso(29, 9), 'S729', 'edit', 'payouts#4', 'state from failed to retrying'),
    ev(iso(29, 9), 'you', 'create', 'tasks#9'),
    /* A FIELD CALLED SOMETHING ELSE IS A CHANGE, even with a stamp's words in its note. */
    { ...ev(iso(29, 9), 'you', 'edit', 'people#2', 'seen set to Tuesday'), field: 'met' },
    /* A STATE MOVE ON ANY OTHER LIST, BY ANYBODY, IS A CHANGE: only the runs' own list is the record's books. */
    ev(iso(29, 9), 'system', 'state', 'obligations#3', 'Renewed for a year'),
    ev(iso(29, 9), 'you', 'decide', 'suggestion:SG70', 'Kept the setup'),
    /* A PERSON'S OWN "LAST SEEN" OR "SEEN" IS THEIR CHANGE, in a stamp's words or not: only a run stamps. */
    ev(iso(29, 9), 'you', 'edit', 'people#2', 'Last seen set to 2 Oct 2026'),
    ev(iso(29, 9), 'p_ana', 'edit', 'films#4', 'Seen set to Yes'),
  ];
  for (const e of changes) assert.equal(isBookkeeping(e), false, `${e.target} ${e.note} is hidden as bookkeeping`);

  const log = [sweep, ...changes, folder, stamp];
  assert.deepEqual(changesOf(log, false), changes, 'the stream by default is not the changes alone');
  assert.deepEqual(changesOf(log, true), log, 'Everything leaves something out');
});

test('the switch is offered on a record that holds agent runs, even with nothing hidden by this page', () => {
  /* THE RECORD LEAVES ITS SWEEP AND ITS STAMPS OUT OF THE LOG UNLESS ASKED, so the page may hold back nothing of its own
     and still have something to show: a record with runs keeps books about them. */
  assert.equal(keepsBooks([{ id: 'tasks', count: 4 }, { id: 'session', count: 732 }]), true);
  assert.equal(keepsBooks([{ id: 'tasks', count: 4 }, { id: 'session', count: 0 }]), false);
  assert.equal(keepsBooks([{ id: 'tasks', count: 4 }]), false);
  assert.equal(keepsBooks(undefined), false);
});

/**
 * EVERYTHING IS ASKED OF THE RECORD, NOT ONLY UNHIDDEN HERE: the record leaves its own books out of the log it sends
 * unless asked, so every read of the log carries the switch, and turning it on or off reads the log again. A source
 * read, because there is no DOM harness in this app.
 */
test('every read of the log carries the switch, and turning it on or off reads the log again', () => {
  const page = readFileSync(fileURLToPath(new URL('./+page.svelte', import.meta.url)), 'utf8');
  assert.match(page, /return read\(apiBase\(\), me, undefined, before, all\);/u, 'the log is read without asking for everything');
  assert.doesNotMatch(page, /\.readLog\(apiBase\(\), me/u, 'a read of the log goes round the switch');
  assert.match(page, /const all = everything;\n\s+const n = \+\+asked;/u, 'turning the switch does not read the log again');
  assert.equal(page.match(/logOf\(/gu)?.length, 4, 'the first read, the page below and the read on a new version do not all carry the switch');
  /* AND THE FOCUS RING IS NEVER TAKEN OFF a line a fold opened. */
  assert.doesNotMatch(page, /outline: none/u, 'a focused line has its ring taken off');
});

test('the words about what is hidden name the person’s own things, in plain words', () => {
  assert.equal(historyWords.everything, 'Everything');
  assert.match(historyWords.hidden(14), /^14 entries are BrainDog's own bookkeeping: /u);
  assert.match(historyWords.hidden(1), /^One entry is /u);
  assert.equal(historyWords.more(9), '+9 more');
  for (const line of [historyWords.hidden(1), historyWords.hidden(14), historyWords.onlyBooks, historyWords.more(9), historyWords.showThem(2)]) {
    assert.doesNotMatch(line, /\u2014|—/u, `an em dash in "${line}"`);
    assert.doesNotMatch(line, /\b(rows?|lists?|registers?|sessions?|events?)\b/iu, `a system word in "${line}"`);
  }
});

/* ── a run's work, folded ───────────────────────────────────────────────── */

test('one run’s lines next to each other fold under its newest as "+N more", and nobody else’s do', () => {
  const run = [1, 2, 3, 4, 5].map((n) => one(ev(iso(29, 9, 30 - n), 'S42', 'edit', `payouts#${n}`)));
  const you = one(ev(iso(29, 9, 20), 'you', 'edit', 'tasks#1'));
  const other = [1, 2, 3].map((n) => one(ev(iso(29, 9, 10 - n), 'S43', 'edit', `tasks#${n}`)));
  const again = [1, 2].map((n) => one(ev(iso(29, 8, 50 - n), 'S42', 'edit', `payouts#${n}`)));
  const folds = runFolds([...run, you, ...other, ...again]);

  assert.deepEqual(
    folds.map((f) => [f.head.e.by, f.rest.length]),
    [
      ['S42', 4],
      ['you', 0],
      ['S43', 2],
      /* TWO LINES OF A RUN ARE DRAWN AS THEY ARE: folding them saves nothing. */
      ['S42', 0],
      ['S42', 0],
    ],
  );
  assert.equal(RUN_FOLD_MIN, 3);
  assert.equal(folds[0]!.head, run[0], 'the fold is not headed by the run’s newest line');
  assert.deepEqual(folds[0]!.rest, run.slice(1), 'the folded lines are not the rest, in their order');
  assert.equal(new Set(folds.map((f) => f.key)).size, folds.length, 'two folds share a key');

  /* A PERSON'S LINES NEXT TO EACH OTHER ARE NEVER FOLDED: only a run's work is one thing. */
  const yours = [1, 2, 3, 4].map((n) => one(ev(iso(29, 9, 10 - n), 'you', 'edit', `tasks#${n}`)));
  assert.ok(runFolds(yours).every((f) => f.rest.length === 0));
  assert.deepEqual(runFolds([]), []);
});

test('a fold somebody opened stays open when the run writes its next line on top of it', () => {
  const run = [1, 2, 3, 4].map((n) => one(ev(iso(29, 9, 30 - n), 'S42', 'edit', `payouts#${n}`)));
  const [opened] = runFolds(run);
  assert.ok(opened && opened.rest.length === 3);
  const kept = new Set(foldKeys(opened));
  assert.equal(foldOpen(opened, kept), true);

  /* THE RUN WRITES AGAIN: the fold's newest line, and so its key, is the new one. */
  const [after] = runFolds([one(ev(iso(29, 9, 30), 'S42', 'edit', 'payouts#9')), ...run]);
  assert.ok(after && after.key !== opened.key, 'this test no longer moves the fold’s key');
  assert.equal(foldOpen(after, kept), true, 'the fold shut under the reader when the run wrote again');
  assert.equal(foldOpen(after, new Set()), false, 'a fold nobody opened is open');
});

test('a list is said by the name the page hands over, so Activity and the rail call it one thing', () => {
  const rail = (id: string): string => ({ installments: 'Instalments' })[id] ?? id;
  assert.equal(thingOf('installments#4', 'Halden licence, 3 of 4', rail)?.list, 'Instalments');
  /* A BURST OVER SEVERAL ENTRIES NAMES ITS LIST THE SAME WAY. */
  const run = [0, 1, 2].map((i) => ev(iso(29, 9, 30 - i), 'rule:categorise', 'edit', `installments#${i + 1}`, 'category set'));
  const [told] = burstsOf(run, rail);
  assert.equal(told?.many?.list, 'Instalments');
});

test('September is Sep down the whole screen, and the dot between two parts of a line keeps its spaces', () => {
  const lines = readFileSync(new URL('./lines.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(lines, /month: 'short'/u, 'a month is spelled by Intl again, which writes Sept in British English');
  assert.equal(dayWord(new Date(2025, 8, 12, 12).getTime(), NOW), '12 Sep 2025', 'another year is said with it');
  for (let m = 0; m < 12; m++) assert.match(dayWord(new Date(2025, m, 12, 12).getTime(), NOW), /^12 [A-Z][a-z]{2} 2025$/u);
  /* SVELTE DROPS THE WHITE SPACE AN ELEMENT OPENS WITH, so `<span> · {note}</span>` drew "falls due· Proofing press".
     The dot and its two spaces are one expression now. */
  const page = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
  const markup = page.slice(page.indexOf('{#snippet entry('), page.indexOf('<PageHead'));
  assert.doesNotMatch(markup, />\s+·/u, 'an element opens on white space and a dot');
  assert.match(markup, /<span class="note" title=\{note\}>\{' · '\}\{note\}<\/span>/u);
  assert.match(markup, /<span class="where-inline"\s*>\{' · '\}\{thing\.list\}<\/span/u);
});
