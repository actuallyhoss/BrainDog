/**
 * A feed that says its days and folds its runs: the record answers each row with `day` and `run_more`, and
 * this is where they become the dialect's `day` rows and a run's "and 39 more".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { feedTable, type FeedRow } from './api.ts';
import { blockOf, feedOf } from './page-live.ts';
import { toSegments } from './blocks.ts';

const NOW = Date.parse('2026-10-14T10:00:00.000Z');
const RUN = { run: 'S42', agent: 'claude', client: 'claude-code', parent: null };

/** Four lines over three days, as a feed with neither key answers them. */
const FLAT: FeedRow[] = [
  { by: 'agent', who: 'S42', count: 3, kind: 'edit', target: 'tasks#7', note: null, at: '2026-10-14T09:40:00.000Z', thing: 'Ship the feed', run_by: RUN },
  { by: 'you', who: 'p_me', count: 1, kind: 'create', target: 'goals#9', note: null, at: '2026-10-14T08:00:00.000Z', thing: 'Learn to swim' },
  { by: 'rule', who: 'rule:txn-categorise', count: 2, kind: 'edit', target: 'transactions#4', note: null, at: '2026-10-13T16:00:00.000Z', thing: 'TALLYARD', things: ['TALLYARD', 'HALDEN'] },
  { by: 'rule', who: 'system', count: 1, kind: 'setup', target: 'pack:usecase-personal', note: null, at: '2026-10-12T11:00:00.000Z', rows: 56 },
];

/** The same lines as a feed with `group: day` answers them. */
const DAYS: FeedRow[] = FLAT.map((r) => ({ ...r, day: r.at.slice(0, 10) }));

/* CAPTURED FROM `feedTable` BEFORE IT KNEW A DAY, over FLAT: with a read mark, with no marks, and with no mark yet. A
   burst of three says "and 2 more like this" after it, where a bare 3 stood in front. */
const BEFORE = {
  marked:
    '{"rows":[{"key":"2026-10-14T09:40:00.000Z-0","cells":["agent","Claude Code","1","changed Ship the feed","20 min ago","and 2 more like this"]},{"key":"2026-10-14T08:00:00.000Z-1","cells":["you","You","1","added Learn to swim","2h ago"]},{"key":"seen","cells":["seen","14h ago"]},{"key":"2026-10-13T16:00:00.000Z-2","cells":["rule","","1","Categorised 2 payments: TALLYARD and HALDEN","18h ago"]},{"key":"2026-10-12T11:00:00.000Z-3","cells":["rule","BrainDog","1","Set up Personal with 56 example items","2d ago"]}],"shown":4}',
  unmarked:
    '{"rows":[{"key":"2026-10-14T09:40:00.000Z-0","cells":["agent","Claude Code","1","changed Ship the feed","20 min ago","and 2 more like this"]},{"key":"2026-10-14T08:00:00.000Z-1","cells":["you","You","1","added Learn to swim","2h ago"]},{"key":"2026-10-13T16:00:00.000Z-2","cells":["rule","","1","Categorised 2 payments: TALLYARD and HALDEN","18h ago"]},{"key":"2026-10-12T11:00:00.000Z-3","cells":["rule","BrainDog","1","Set up Personal with 56 example items","2d ago"]}],"shown":4}',
  unread:
    '{"rows":[{"key":"2026-10-14T09:40:00.000Z-0","cells":["agent","Claude Code","1","changed Ship the feed","20 min ago","and 2 more like this"]},{"key":"2026-10-14T08:00:00.000Z-1","cells":["you","You","1","added Learn to swim","2h ago"]},{"key":"2026-10-13T16:00:00.000Z-2","cells":["rule","","1","Categorised 2 payments: TALLYARD and HALDEN","18h ago"]},{"key":"2026-10-12T11:00:00.000Z-3","cells":["rule","BrainDog","1","Set up Personal with 56 example items","2d ago"]},{"key":"seen","cells":["seen",""]}],"shown":4}',
};

/** The first word of each row, and a heading's words beside it. */
const shape = (rows: readonly { cells: readonly (string | null)[] }[]): string[] => rows.map((r) => (r.cells[0] === 'day' ? `day ${r.cells[1]}` : String(r.cells[0])));

test('feedOf KEEPS day AND run_more, and still answers null for a row that is not a feed row', () => {
  const sent = [{ ...DAYS[0]!, run_more: 39 }, DAYS[1]!];
  const feed = feedOf(sent);
  assert.ok(feed);
  assert.equal(feed[0]!.day, '2026-10-14');
  assert.equal(feed[0]!.run_more, 39);
  assert.equal(feed[1]!.run_more, undefined);
  /* What it took before is still taken, and what it refused is still refused. */
  assert.deepEqual(feedOf(FLAT), FLAT);
  assert.equal(feedOf([{ ...FLAT[0]!, by: 'robot' }]), null);
  assert.equal(feedOf([{ title: 'Not a line of a feed' }]), null);
  assert.equal(feedOf('nothing'), null);
  /* A day that is no day, and a count that is no count, are a feed this cannot draw. */
  assert.equal(feedOf([{ ...FLAT[0]!, day: 'Tuesday' }]), null);
  assert.equal(feedOf([{ ...FLAT[0]!, day: 20261014 }]), null);
  assert.equal(feedOf([{ ...FLAT[0]!, run_more: -1 }]), null);
  assert.equal(feedOf([{ ...FLAT[0]!, run_more: 1.5 }]), null);
  assert.equal(feedOf([{ ...FLAT[0]!, run_more: '39' }]), null);
});

test('ROWS WITH NO day MAKE EXACTLY THE TABLE THEY MADE BEFORE, with a mark, without marks and with no mark yet', () => {
  assert.equal(JSON.stringify(feedTable(FLAT, true, '2026-10-13T20:00:00.000Z', NOW, 'p_me')), BEFORE.marked);
  assert.equal(JSON.stringify(feedTable(FLAT, false, null, NOW, 'p_me')), BEFORE.unmarked);
  assert.equal(JSON.stringify(feedTable(FLAT, true, null, NOW, 'p_me')), BEFORE.unread);
});

test('ONE day ROW BEFORE EACH DAY\'S FIRST ROW: Today, Yesterday, then the weekday and the day of the month', () => {
  const { rows, shown } = feedTable(DAYS, false, null, NOW, 'p_me', new Map(), 'UTC');
  assert.deepEqual(shape(rows), ['day Today', 'agent', 'you', 'day Yesterday', 'rule', 'day Mon 12 Oct', 'rule']);
  /* A heading is two cells, as the `seen` row is, and it is not one of the lines the feed counts. */
  for (const r of rows.filter((r) => r.cells[0] === 'day')) assert.equal(r.cells.length, 2);
  assert.equal(shown, 4);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
  /* The lines under the headings are the lines they were. */
  assert.equal(JSON.stringify({ rows: rows.filter((r) => r.cells[0] !== 'day'), shown }), BEFORE.unmarked);
});

test('THE YEAR IS SAID ONLY FOR ANOTHER YEAR', () => {
  const old: FeedRow[] = [
    { ...FLAT[1]!, at: '2026-01-05T08:00:00.000Z', day: '2026-01-05' },
    { ...FLAT[1]!, at: '2025-12-31T08:00:00.000Z', day: '2025-12-31' },
  ];
  assert.deepEqual(shape(feedTable(old, false, null, NOW, 'p_me', new Map(), 'UTC').rows), ['day Mon 5 Jan', 'you', 'day Wed 31 Dec 2025', 'you']);
});

test("TODAY IS THE READER'S OWN, counted from now in the zone they are in", () => {
  /* Half past ten at night in UTC is already tomorrow in Cairo. */
  const late = Date.parse('2026-10-14T22:30:00.000Z');
  const two: FeedRow[] = [
    { ...FLAT[1]!, at: '2026-10-14T22:10:00.000Z', day: '2026-10-15' },
    { ...FLAT[1]!, at: '2026-10-14T12:00:00.000Z', day: '2026-10-14' },
  ];
  assert.deepEqual(shape(feedTable(two, false, null, late, 'p_me', new Map(), 'Africa/Cairo').rows), ['day Today', 'you', 'day Yesterday', 'you']);
  /* And the same two days read from UTC, where the first has not come yet, is a date and never a guess. */
  assert.deepEqual(shape(feedTable(two, false, null, late, 'p_me', new Map(), 'UTC').rows), ['day Thu 15 Oct', 'you', 'day Today', 'you']);
});

test("A RUN'S LINES FOLDED INTO ITS NEWEST END WITH 'and 39 more' AND LINK TO THE RUN", () => {
  const folded: FeedRow[] = [{ ...DAYS[0]!, run_more: 39 }, { ...DAYS[1]!, run_more: 0 }, DAYS[2]!];
  const { rows } = feedTable(folded, false, null, NOW, 'p_me', new Map(), 'UTC');
  const lines = rows.filter((r) => r.cells[0] !== 'day');
  /* The words are the link, since the cell is all of the row that reaches the renderer. */
  assert.equal(lines[0]!.cells.at(-1), '[and 39 more](/r/session/42)');
  assert.equal(lines[0]!.cells.length, 6);
  assert.deepEqual(lines[0]!.cells.slice(0, 5), ['agent', 'Claude Code', '3', 'changed Ship the feed', '20 min ago']);
  assert.equal(lines[0]!.href, '/r/session/42');
  /* A run that wrote nothing more, and a line no run was folded into, are the five cells they were, with no link. */
  for (const r of lines.slice(1)) {
    assert.equal(r.cells.length, 5);
    assert.equal(r.href, undefined);
  }
  /* ONE MORE IS STILL COUNTED IN WORDS, and a run the record did not name beside the line is found by who signed it. */
  const one = feedTable([{ ...FLAT[0]!, run_by: null, run_more: 1 }], false, null, NOW).rows[0]!;
  assert.equal(one.cells.at(-1), '[and 1 more](/r/session/42)');
  assert.equal(one.href, '/r/session/42');
  /* A fold with no run to open says its words and links nowhere, and never prints a handle. */
  const lost = feedTable([{ ...FLAT[0]!, who: 'agent:claude', run_by: null, run_more: 4 }], false, null, NOW).rows[0]!;
  assert.equal(lost.cells.at(-1), 'and 4 more');
  assert.equal(lost.href, undefined);
  for (const r of rows) assert.doesNotMatch(r.cells.join(' '), /\bS42\b/u);
  /* A THOUSAND IS WRITTEN AS EVERY OTHER COUNT ON THE PAGE IS. */
  assert.equal(feedTable([{ ...FLAT[0]!, who: 'agent:claude', run_by: null, run_more: 1200 }], false, null, NOW).rows[0]!.cells.at(-1), 'and 1,200 more');
});

test('THE seen ROW STILL LANDS BETWEEN THE LAST NEW ROW AND THE FIRST READ ONE', () => {
  /* Inside a day: one of today's two lines is new. */
  const inside = feedTable(DAYS, true, '2026-10-14T09:00:00.000Z', NOW, 'p_me', new Map(), 'UTC').rows;
  assert.deepEqual(shape(inside), ['day Today', 'agent', 'seen', 'you', 'day Yesterday', 'rule', 'day Mon 12 Oct', 'rule']);
  assert.equal(inside[2]!.cells[1], '1h ago');
  /* Between two days: it sits under the last new line, above the heading of the day already read. */
  const between = feedTable(DAYS, true, '2026-10-13T20:00:00.000Z', NOW, 'p_me', new Map(), 'UTC').rows;
  assert.deepEqual(shape(between), ['day Today', 'agent', 'you', 'seen', 'day Yesterday', 'rule', 'day Mon 12 Oct', 'rule']);
  /* Nothing new: it is the first row. Everything new: the last. No mark yet: the last, with no time. */
  assert.equal(feedTable(DAYS, true, '2026-10-14T09:50:00.000Z', NOW, 'p_me', new Map(), 'UTC').rows[0]!.cells[0], 'seen');
  assert.deepEqual(feedTable(DAYS, true, '2026-10-01T00:00:00.000Z', NOW, 'p_me', new Map(), 'UTC').rows.at(-1)!.cells.slice(0, 1), ['seen']);
  assert.deepEqual(feedTable(DAYS, true, null, NOW, 'p_me', new Map(), 'UTC').rows.at(-1)!.cells, ['seen', '']);
});

test('A LIVE FEED THE RECORD ANSWERED BY DAY IS DRAWN, its headings among its rows and nothing degraded', () => {
  const live = blockOf({ kind: 'feed', source: 'activity', since: 'seen', rows: [], matched: 4, refusals: [], seen: '2026-10-13T20:00:00.000Z', feed: DAYS }, new Map(), NOW);
  assert.equal(live.cannot, undefined);
  assert.equal(live.rows.filter((r) => r.cells[0] === 'day').length, 3);
  assert.deepEqual(live.rows.map((r) => r.cells[0]).slice(0, 5), ['day', 'agent', 'you', 'seen', 'day']);
  assert.deepEqual([live.shown, live.total], [4, 4]);
  const drawn = toSegments(live);
  assert.deepEqual(drawn.map((s) => s.type), ['block']);
  /* A LINE A RUN WAS FOLDED INTO IS DRAWN TOO: its sixth cell is in the dialect, so the feed is not degraded whole. */
  const folded = toSegments(blockOf({ kind: 'feed', source: 'activity', rows: [], matched: 1, refusals: [], feed: [{ ...DAYS[0]!, run_more: 39 }] }, new Map(), NOW));
  assert.deepEqual(folded.map((s) => s.type), ['block']);
  /* And a feed whose day is no day is one this cannot draw, said so and never drawn by half. */
  assert.equal(blockOf({ kind: 'feed', source: 'activity', rows: [], matched: 1, refusals: [], feed: [{ ...FLAT[0]!, day: 'soon' }] }, new Map(), NOW).cannot !== undefined, true);
});
