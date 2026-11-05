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
import { answeredLine, cardWords } from '../../lib/decide/card.ts';
import { settledBy, settlingOf, type Suggested } from '../../lib/record/history-live.ts';
import { actor } from '../../lib/record/names.ts';
import { byLine } from '../slash/lines.ts';
import {
  historyWords,
  awaySaid,
  newestFirst,
  below,
  burstsOf,
  busyOf,
  busySaid,
  changesOf,
  clockOf,
  dayOf,
  dayWord,
  fold,
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
  partOf,
  ranSaid,
  rolledRuns,
  whoPartsOf,
  whoSaid,
  settledOf,
  settledWords,
  tallyOf,
  tallySaid,
  thingOf,
  type Told,
} from './lines.ts';
import { readMarkOf, seenAfter } from '../../lib/page/read-mark.ts';

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

test("what changed counts BrainDog's own rules as BrainDog, never as rules", () => {
  const log = [ev(iso(29, 9), 'rule:handled', 'state'), ev(iso(29, 8), 'rule:update', 'edit'), ev(iso(29, 7), 'rule:salary', 'create'), ev(iso(29, 6), 'system', 'edit')];
  assert.deepEqual(tallyOf(log, null, NO_NAMES).groups, [
    { group: 'rule', count: 1 },
    { group: 'record', count: 3 },
  ]);
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
  assert.deepEqual(t.parts[0], { part: 'Other changes', count: 5, agents: 2 }, 'a line on no list is another change');
  const said = t.parts.map((k) => ({ word: k.part, count: k.count, agents: k.agents }));
  assert.equal(tallySaid(said, t.total), 'Other changes is all of it: 5, and agents made 2 of them.');
  assert.equal(tallySaid([{ word: 'Created', count: 3, agents: 2 }, { word: 'Changed', count: 2, agents: 0 }], 5), 'Created is the biggest share: 3 of 5, and agents made 2 of them.');
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
  assert.equal(awaySaid([...agents, ...yours], null, NO_NAMES, false), '26 changes since you were last here. Agents made 22.');
  assert.equal(awaySaid(['agent:codex'], null, NO_NAMES, false), 'One change since you were last here, by an agent.');
  assert.equal(awaySaid(['you', 'agent:codex'], null, NO_NAMES, false), '2 changes since you were last here. Agents made one.');
  assert.equal(awaySaid(['you', 'you'], null, NO_NAMES, false), '2 changes since you were last here.');
  assert.equal(awaySaid(['S4', 'slash'], null, NO_NAMES, false), '2 changes since you were last here. Agents made all of them.');
  assert.equal(awaySaid([...agents, 'you'], null, NO_NAMES, true), 'More than 23 changes since you were last here. Agents made 22 of the newest 23.');
  assert.equal(awaySaid([], null, NO_NAMES, false), '');
  /* A READ THAT STOPPED SHORT SAYS THE PAGE'S OWN COUNT, the one its tile says, where it has counted more (P29). */
  assert.equal(awaySaid([...agents, 'you'], null, NO_NAMES, true, null, { total: 195, agents: 5 }), '195 changes since you were last here. Agents made 5.');
  assert.equal(awaySaid([...agents, 'you'], null, NO_NAMES, true, null, { total: 10, agents: 5 }), 'More than 23 changes since you were last here. Agents made 22 of the newest 23.', 'a count under the read is not used');
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

/* THE LOG SAYS AN ENTRY IN THE PERSON'S OWN LIST, named beside it, and never a row or a list. */
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
  assert.equal(historyWords.hidden(14), '14 bookkeeping entries hidden.');
  assert.equal(historyWords.hidden(1), '1 bookkeeping entry hidden.');
  assert.equal(historyWords.showMore, 'Show more');
  for (const line of [historyWords.hidden(1), historyWords.hidden(14), historyWords.onlyBooks, historyWords.showMore, historyWords.showThem(2), historyWords.hiddenWhere]) {
    assert.doesNotMatch(line, /\u2014|—/u, `an em dash in "${line}"`);
    assert.doesNotMatch(line, /\b(rows?|lists?|registers?|sessions?|events?)\b/iu, `a system word in "${line}"`);
  }
});

/* ── a rule's runs, one line a day ──────── */

test('a rule’s quiet runs on one day are one line saying how many times, and a failed run stays its own', () => {
  const ran = (h: number, by: string, note = 'rule.meet-payees ran.') => one({ ...ev(iso(29, h), by, 'pull', 'declaration:rule.meet-payees'), note });
  const lines = rolledRuns([
    ran(9, 'rule:meet-payees'),
    ran(8, 'rule:meet-payees'),
    ran(7, 'rule:meet-payees', 'Meet payees did not finish.'),
    ran(6, 'rule:meet-payees'),
    ran(5, 'rule:entry-takes-book'),
    one(ev(iso(29, 4), 'you', 'edit', 'tasks#1')),
  ]);
  assert.deepEqual(
    lines.map((t) => [t.e.by, t.count, t.note]),
    [
      ['rule:meet-payees', 3, '3 times'],
      ['rule:meet-payees', 1, 'Meet payees did not finish.'],
      ['rule:entry-takes-book', 1, ''],
      ['you', 1, ''],
    ],
  );
  assert.equal(lines[0]!.from, iso(29, 6), 'the line spans from its first run');
});

test('a script’s runs on one day are one line, and what it wrote that day is said on it (audit 6f AF11)', () => {
  const by = 'script:plans_from_names@v1';
  const run = (h: number) => one({ ...ev(iso(29, h), by, 'pull', 'declaration:script.plans_from_names'), note: '“Give each plan a page” ran and wrote 4 lines.' });
  const lines = rolledRuns([
    run(9),
    { ...one(ev(iso(29, 9), by, 'edit', 'tasks#1')), count: 4 },
    run(8),
    one(ev(iso(29, 8), by, 'create', 'tasks#2')),
    one(ev(iso(29, 8), by, 'create', 'tasks#3')),
    one(ev(iso(29, 7), 'you', 'edit', 'tasks#4')),
  ]);
  assert.deepEqual(
    lines.map((t) => [t.e.by, t.count, t.note]),
    [
      [by, 2, '2 times · made 2 entries, changed 4'],
      ['you', 1, ''],
    ],
  );
});

test('a run’s note says no id and not its title again', () => {
  assert.equal(ranSaid('settle_matched_line did not finish, so it wrote nothing; its log says why.', 'Settle a matched line', 'settle_matched_line'), 'Did not finish, so it wrote nothing; its log says why.');
  assert.equal(ranSaid('“File what an account holds in the account’s book” ran and wrote one line.', 'File what an account holds in the account’s book', 'book_from_account'), 'Wrote one line.');
  assert.equal(ranSaid('rule.meet-payees ran.', 'Meet payees', 'meet-payees'), '');
});

test('what changed is counted in a person’s words: the list a row is in, questions, exports and runs', () => {
  const name = (l: string) => ({ ledger: 'Ledger', people: 'People' })[l as 'ledger'] ?? l;
  assert.equal(partOf(ev(iso(29, 9), 'you', 'edit', 'ledger#4'), name), 'Ledger');
  assert.equal(partOf(ev(iso(29, 9), 'S4', 'suggest', 'suggestion:SG1'), name), 'Questions asked');
  assert.equal(partOf(ev(iso(29, 9), 'you', 'decide', 'decision:D1'), name), 'Questions answered');
  assert.equal(partOf(ev(iso(29, 9), 'you', 'export'), name), 'Exports');
  assert.equal(partOf({ ...ev(iso(29, 9), 'rule:meet-payees', 'pull'), note: 'rule.meet-payees ran.' }, name), 'Rule and script runs');
  assert.equal(partOf({ ...ev(iso(29, 9), 'script:a_b@v1', 'pull'), note: 'a_b did not finish' }, name), 'Runs that failed');
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
  assert.match(markup, /<span class="note" title=\{note\} data-own>\{' · '\}\{note\}<\/span>/u);
  assert.match(markup, /<span class="where-chip">\{' · '\}\{thing\.list\}<\/span>/u, 'where it happened is said after a dot of its own');
});

/* WHO A RUN IS (history-run-by-web-68): a line a run signed carries run_by, and the screen says the app it ran in. */
const runAgo = (min: number): string => new Date(NOW - min * 60_000).toISOString();
const CODE = { run: 'S42', agent: 'claude', client: 'claude-code 2.1.4', parent: null };
const CODEX = { run: 'S43', agent: 'codex', client: 'codex-mcp-client', parent: null };
let runSeq = 100;
const runEv = (at: string, by: string, run_by?: AuditEvent['run_by']): AuditEvent => ({
  seq: runSeq--, at, by, kind: 'edit', note: '', version: runSeq + 1, ...(run_by === undefined ? {} : { run_by }),
});

test('TWO NAMED RUNS ARE TWO LANES, and the runs the record cannot name share one', () => {
  const log = [runEv(runAgo(2), 'S43', CODEX), runEv(runAgo(20), 'S42', CODE), runEv(runAgo(25), 'S42', CODE), runEv(runAgo(50), 'S7'), runEv(runAgo(55), 'S8', null)];
  const lanes = lanesOf(log, NOW, null, NO_NAMES);
  assert.deepEqual(lanes.map((l) => l.label), ['Codex', 'Claude Code', 'An agent']);
  assert.equal(lanes[2]!.spans.length, 1, 'S7 and S8 are one lane');
  assert.equal(lanesSaid(lanes), 'Codex ran 1 stretch, Claude Code 1 and An agent 1. Codex is working now.');
  /* TWO RUNS OF ONE APP ARE ONE LANE, never two lanes under one name. */
  const twice = lanesOf([runEv(runAgo(2), 'S43', { ...CODE, run: 'S43' }), runEv(runAgo(5), 'S42', CODE)], NOW, null, NO_NAMES);
  assert.deepEqual(twice.map((l) => l.label), ['Claude Code']);
});

test('A NAMED RUN IS STILL COUNTED AS AN AGENT', () => {
  const t = tallyOf([runEv(runAgo(2), 'S42', CODE), runEv(runAgo(3), 'you')], null, NO_NAMES);
  assert.deepEqual(t.groups, [{ group: 'agent', count: 1 }, { group: 'you', count: 1 }]);
});

/* THE READER'S MARK: once Activity's stamp lands, what the away read holds is `seenAfter()`, and the sentence
   under the title says so. The stamp's own rule is tested where it lives (`lib/page/read-mark.test.ts`). */
test('THE AWAY LINE IS NOT DRAWN AFTER A STAMP: what was read is said as nothing new', () => {
  const before = { actors: ['p_1', 'run_2', 'run_2'], capped: true, byWho: null };
  assert.match(awaySaid(before.actors, 'p_1', NO_NAMES, before.capped, before.byWho), /since you were last here/u);
  const after = seenAfter();
  assert.equal(awaySaid(after.actors, 'p_1', NO_NAMES, after.capped, after.byWho), '');
  assert.equal(readMarkOf(9, after.actors.length), null, 'a page already stamped stamped again');
});

/* ── who suggested and who settled ───────────────────────────── */

test('A SUGGESTION OF SLASH’S THAT SOMEBODY SETTLED SAYS BOTH NAMES, in the answered card’s own words', () => {
  const mara = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
  const names = new Map([[mara, 'Mara']]);
  const line = (kind: string, to: unknown, more: Suggested = { suggested_by: 'slash' }) => ({
    settling: settlingOf({ actor: mara, kind, to, ...more }),
  });
  const yes = line('decide', JSON.stringify({ question: 'Mark the four paid invoices done?', answer: 'accept' }));
  assert.equal(settledOf(yes, null, names), 'Slash suggested · Mara accepted');
  /* THE SENTENCE THE ANSWERED CARD SAYS, and the one a row's history says of the same line. */
  assert.equal(settledOf(yes, null, names), answeredLine({ slash: true }, { key: 'accept', label: 'Accept', recommended: true }, 'Mara', 'now'));
  assert.equal(settledOf(yes, null, names), settledBy({ actor: mara, kind: 'decide', to: { answer: 'accept' }, suggested_by: 'slash' }, { me: null, names, words: cardWords }));
  assert.equal(settledOf(line('resolve', 'wont-fix'), null, names), 'Slash suggested · Mara declined');
  assert.equal(settledOf(line('decide', { answer: 'keep-both' }, { suggested_by: 'slash', answer_label: 'Keep both' }), null, names), 'Slash suggested · Mara chose Keep both');
  assert.equal(settledOf(line('resolve', 'undone'), null, names), 'Slash suggested · Mara undid');
  /* THE READER IS YOU, as every line of this screen says them. */
  assert.equal(settledOf(yes, mara, names), `Slash suggested · ${actor(mara, mara).name} accepted`);
  /* WHO DRAFTED IT, in the Slash page's words, and nobody where the record names nobody. */
  const drafted = (by: string) => line('decide', { answer: 'accept' }, { suggested_by: 'slash', drafted_by: by });
  assert.equal(settledOf(drafted('rules'), null, names), `Slash suggested · Mara accepted · ${byLine('rules')}`);
  assert.equal(settledOf(drafted('Haiku'), null, names), `Slash suggested · Mara accepted · ${byLine('Haiku')}`);
  for (const s of [settledOf(yes, null, names), settledOf(drafted('rules'), null, names)]) assert.doesNotMatch(s!, /—/u);
});

test('A DECISION ON A PERSON’S OWN OR AN AGENT’S SUGGESTION READS AS IT DID, and so does every line that settled nothing', () => {
  const mara = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
  const yes = (more: Suggested) => ({ settling: settlingOf({ actor: mara, kind: 'decide', to: { answer: 'accept' }, ...more }) });
  assert.equal(settledOf(yes({ suggested_by: mara })), null);
  assert.equal(settledOf(yes({ suggested_by: 'agent:claude' })), null);
  assert.equal(settledOf(yes({})), null, 'the log does not say who suggested yet, so nothing is claimed');
  assert.equal(settledOf({}), null, 'a line the log sent as it does today');
  assert.equal(settledOf({ settling: settlingOf({ actor: mara, kind: 'resolve', to: 'addressed', suggested_by: 'slash' }) }), null, 'the close beside a yes is not said twice');
  /* THE WORDS ARE THE CARD'S OWN, held here by reference and typed nowhere in this file. */
  assert.equal(settledWords.slash, cardWords.slash);
  assert.equal(settledWords.accepted, cardWords.accepted);
  assert.equal(settledWords.declined, cardWords.declined);
  assert.equal(settledWords.chose, cardWords.chose);
  const src = readFileSync(fileURLToPath(new URL('./lines.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /`Slash suggested|'accepted'|'declined'/u);
});

test('THE LOG IS NEWEST FIRST BY WHEN, then by version, whatever order the record sent it in', () => {
  const at = (h: number) => `2026-09-03T${String(h).padStart(2, '0')}:00:00.000Z`;
  const log = [
    { seq: 9, at: at(10) },
    { seq: 8, at: at(12) },
    { seq: 7, at: at(12) },
    { seq: 6, at: at(6) },
    { seq: 5, at: 'not a time' },
  ];
  assert.deepEqual(newestFirst(log).map((e) => e.seq), [8, 7, 9, 6, 5]);
});

test('who worked over the month is the record’s figure, BrainDog’s own work a part of it (audit 6f AF12)', () => {
  const groups = [
    { key: 'agent', label: 'Agents', value: 5 },
    { key: 'rule', label: 'Rules', value: 221 },
    { key: 'you', label: 'You', value: 0 },
    { key: 'braindog', label: 'BrainDog', value: 333 },
  ];
  const parts = whoPartsOf({ ok: true, value: { value: 559, groups } });
  assert.deepEqual(parts, [{ label: 'BrainDog', value: 333 }, { label: 'Rules', value: 221 }, { label: 'Agents', value: 5 }]);
  assert.equal(whoSaid(parts!), 'Over the last 30 days BrainDog made 333 changes, rules 221 and agents 5.');
  assert.equal(whoPartsOf({ ok: false }), null);
  assert.equal(whoPartsOf({ ok: true, value: { groups: groups.map((g) => ({ ...g, value: 0 })) } }), null);
});

test('a key being read waits under Everything; storing, rotating or revoking one stays in the stream', () => {
  const at = { by: 'p1', target: 'grant:g1', note: '' };
  assert.equal(isBookkeeping({ ...at, kind: 'grant.read' }), true);
  for (const kind of ['grant.add', 'grant.rotate', 'grant.revoke', 'grant.bind'] as const) assert.equal(isBookkeeping({ ...at, kind }), false);
});
