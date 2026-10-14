/**
 * THE TWO KEYS THAT CARRY THE ACTIVITY PAGE (PGS-C24 job 1). The hand-built Activity draws a heading a day and one line
 * a run; a declared feed could say neither, so `/audit` could not be a page.
 *
 * `group: day` answers every row with `day`, the day it was written in the record's own zone, and nothing is folded
 * across midnight. `fold: run` answers one row for each run's lines, its newest, with `run_more`: how many more lines
 * that run wrote. A feed that says neither answers what it always did.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';

import { KEY_KINDS } from '../src/block-keys.ts';
import { validate, type Declaration } from '../src/declare.ts';
import { feedRows, readPage, type ActivityEvent, type FeedRow, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { Entry } from '../src/index.ts';

const NOW = Date.parse('2026-10-13T09:00:00.000Z');
const CAIRO = 'Africa/Cairo';

const run = (seq: number, fields: Entry['fields']): Entry => ({
  id: `r${seq}`,
  register: 'session',
  seq,
  fields,
  state: 'active',
  version: 1,
  created_at: '2026-10-12T00:00:00.000Z',
  updated_at: '2026-10-12T00:00:00.000Z',
  deleted_at: null,
});

const RUNS: Readonly<Record<string, Entry>> = {
  S42: run(42, { agent: 'claude', client: 'claude-code' }),
  S43: run(43, { client: 'codex-cli' }),
};
const runOf = (name: string): Entry | null => RUNS[name] ?? null;
const CLAUDE = { run: 'S42', agent: 'claude', client: 'claude-code', parent: null };

const event = (ts: string, actor: string, target: string, kind = 'update'): ActivityEvent => ({ ts: `2026-10-${ts}:00.000Z`, actor, kind, target, note: null, thing: target });

/**
 * Newest first, as the record reads them. In Cairo (three hours ahead in October) the 13th starts at 21:00 UTC on the
 * 12th: the person's 23:30 write is the 13th's there, and S42's fourth line of the 13th is the 12th's in UTC.
 */
const EVENTS: ActivityEvent[] = [
  event('13T08:00', 'S42', 'tasks#1'),
  event('13T07:50', 'p_1', 'tasks#2'),
  event('13T07:40', 'S42', 'tasks#3'),
  event('13T07:30', 'S43', 'tasks#4'),
  event('13T07:20', 'S42', 'tasks#5', 'create'),
  event('13T07:10', 'rule:tidy', 'tasks#6'),
  event('12T23:45', 'S42', 'tasks#8'),
  event('12T23:30', 'p_1', 'tasks#7'),
  event('12T20:30', 'p_1', 'tasks#7'),
  event('12T19:00', 'S42', 'tasks#9'),
  event('12T18:00', 'agent:claude', 'tasks#10'),
  event('12T17:00', 'slash', 'tasks#11'),
];

const said = (r: FeedRow): string => `${r.who} ${r.target} x${r.count}${r.day === undefined ? '' : ` ${r.day}`}${r.run_more === undefined ? '' : ` +${r.run_more}`}`;

function depsOver(blocks: PageBlock[], more: Partial<PageDeps> = {}): PageDeps {
  return {
    pages: () => [{ page: 'log', title: 'Log', blocks }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: () => ok({ rows: [], matched: 0 }),
    schemaOf: () => null,
    titleOf: () => null,
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf: () => null },
    activity: () => ({ events: EVENTS, seen: null }),
    runOf,
    tz: CAIRO,
    ...more,
  };
}

/** The first block of the page `log`, read whole. */
function read(block: Record<string, unknown>, more: Partial<PageDeps> = {}) {
  const page = readPage(depsOver([{ kind: 'feed', source: 'activity', empty: 'Nothing yet.', ...block } as PageBlock], more), 'log');
  assert.ok(page.ok, JSON.stringify(page));
  return page.value.blocks[0]!;
}

test('group: day ANSWERS EVERY ROW WITH ITS DAY IN THE RECORD’S OWN ZONE, newest first', () => {
  const out = read({ group: 'day' });
  assert.deepEqual(out.refusals, []);
  const feed = out.feed ?? [];
  assert.ok(feed.length > 0);
  for (const r of feed) assert.match(String(r.day), /^\d{4}-\d{2}-\d{2}$/u, said(r));
  /* A WRITE AT 23:30 UTC IS THE NEXT DAY IN CAIRO, and the one at 20:30 UTC is still the day before. */
  const late = feed.filter((r) => r.who === 'p_1' && r.target === 'tasks#7');
  assert.deepEqual(late.map(said), ['p_1 tasks#7 x1 2026-10-13', 'p_1 tasks#7 x1 2026-10-12'], 'one target, two days, never one row');
  assert.deepEqual([...new Set(feed.map((r) => r.day))], ['2026-10-13', '2026-10-12'], 'each day’s rows sit together, the newest day first');
  assert.deepEqual(feed.map((r) => r.at), [...feed.map((r) => r.at)].sort().reverse(), 'newest first');
  assert.equal(feed.reduce((n, r) => n + r.count, 0), EVENTS.length, 'no line is lost');
  assert.ok(feed.every((r) => r.run_more === undefined), 'nothing is folded by a key the block did not say');
});

test('THE DAY IS THE ZONE’S: the same lines in UTC fall on other days', () => {
  const feed = read({ group: 'day' }, { tz: 'UTC' }).feed ?? [];
  assert.deepEqual(feed.filter((r) => r.who === 'p_1' && r.target === 'tasks#7').map(said), ['p_1 tasks#7 x2 2026-10-12'], 'one day in UTC, so one row of two');
});

test('fold: run ANSWERS ONE ROW A RUN, ITS NEWEST, with how many more it wrote and still who the run is', () => {
  const out = read({ fold: 'run' });
  assert.deepEqual(out.refusals, []);
  const feed = out.feed ?? [];
  const claude = feed.filter((r) => r.who === 'S42');
  assert.equal(claude.length, 1, JSON.stringify(feed.map(said)));
  assert.equal(claude[0]?.target, 'tasks#1');
  assert.equal(claude[0]?.at, '2026-10-13T08:00:00.000Z');
  assert.equal(claude[0]?.run_more, 4);
  assert.deepEqual(claude[0]?.run_by, CLAUDE);
  const codex = feed.filter((r) => r.who === 'S43');
  assert.equal(codex.length, 1);
  assert.equal(codex[0]?.run_more, 0, 'a run of one line has no more');
  assert.equal(codex[0]?.run_by?.agent, 'codex');
  assert.equal(feed[0]?.who, 'S42', 'the run sits where its newest line is');
  assert.ok(feed.every((r) => r.day === undefined), 'no day by a key the block did not say');
  assert.equal(feed.reduce((n, r) => n + r.count + (r.run_more ?? 0), 0), EVENTS.length, 'no line is lost');
});

test('A PERSON’S, A RULE’S AND A TOKEN’S LINES ARE UNTOUCHED BY fold', () => {
  const plain = read({}).feed ?? [];
  const folded = read({ fold: 'run' }).feed ?? [];
  const others = (rows: readonly FeedRow[]) => rows.filter((r) => !/^S\d+$/u.test(String(r.who)));
  assert.deepEqual(others(folded), others(plain));
  assert.ok(others(folded).every((r) => !('run_more' in r)));
  assert.equal(others(folded).length, 5);
  /* A RUN'S LINE BETWEEN TWO OF A PERSON'S STILL PARTS THEM, as it does unfolded: the fold takes no line of theirs in. */
  const lines = [event('13T08:00', 'S42', 'tasks#1'), event('13T07:59', 'p_1', 'tasks#2'), event('13T07:58', 'S42', 'tasks#3'), event('13T07:57', 'p_1', 'tasks#2')];
  assert.deepEqual(feedRows(lines, undefined, runOf, { fold: 'run' }).map(said), ['S42 tasks#1 x1 +1', 'p_1 tasks#2 x1', 'p_1 tasks#2 x1']);
});

test('WITH BOTH KEYS A RUN THAT WORKED ACROSS TWO DAYS IS ONE ROW A DAY', () => {
  const feed = read({ group: 'day', fold: 'run' }).feed ?? [];
  assert.deepEqual(
    feed.filter((r) => r.who === 'S42').map(said),
    ['S42 tasks#1 x1 2026-10-13 +3', 'S42 tasks#9 x1 2026-10-12 +0'],
  );
  assert.deepEqual(feed.filter((r) => r.who === 'S42').map((r) => r.run_by), [CLAUDE, CLAUDE]);
  /* IN UTC THE SAME RUN'S DAYS SPLIT ELSEWHERE: three lines on the 13th, two on the 12th. */
  assert.equal(feed.reduce((n, r) => n + r.count + (r.run_more ?? 0), 0), EVENTS.length, 'no line is lost');
  const utc = read({ group: 'day', fold: 'run' }, { tz: 'UTC' }).feed ?? [];
  assert.deepEqual(utc.filter((r) => r.who === 'S42').map(said), ['S42 tasks#1 x1 2026-10-13 +2', 'S42 tasks#8 x1 2026-10-12 +1']);
});

test('A RUN’S BURST ON ONE TARGET IS ITS COUNT, and only other lines are its more', () => {
  const lines = [event('13T08:00', 'S42', 'tasks#1'), event('13T07:59', 'S42', 'tasks#1'), event('13T07:58', 'S42', 'tasks#2'), event('13T07:57', 'S42', 'tasks#1')];
  const rows = feedRows(lines, undefined, runOf, { fold: 'run' });
  assert.deepEqual(rows.map(said), ['S42 tasks#1 x2 +2']);
});

test('PAST first: A DAY’S REMAINDER STAYS IN ITS DAY and counts a folded run’s lines', () => {
  const rows = feedRows(EVENTS, 1, runOf, { group: 'day', fold: 'run', zone: CAIRO });
  assert.equal(rows.reduce((n, r) => n + r.count + (r.run_more ?? 0), 0), EVENTS.length, JSON.stringify(rows.map(said)));
  const days = rows.map((r) => r.day);
  assert.deepEqual(days, [...days].sort().reverse(), 'each day’s remainder is at the end of that day');
  const rest = rows.filter((r) => r.who === null);
  assert.ok(rest.length > 0 && rest.every((r) => typeof r.day === 'string'));
  assert.deepEqual(rest.filter((r) => r.by === 'agent').map(said), ['null null x1 2026-10-13', 'null null x3 2026-10-12']);
});

test('WITHOUT THE KEYS THE ANSWER IS BYTE FOR BYTE WHAT IT WAS', () => {
  const was = [
    '{"by":"agent","who":"S42","count":1,"kind":"update","target":"tasks#1","note":null,"at":"2026-10-13T08:00:00.000Z","thing":"tasks#1","run_by":{"run":"S42","agent":"claude","client":"claude-code","parent":null},"list":"tasks"}',
    '{"by":"you","who":"p_1","count":1,"kind":"update","target":"tasks#2","note":null,"at":"2026-10-13T07:50:00.000Z","thing":"tasks#2","list":"tasks"}',
  ];
  const feed = read({}).feed ?? [];
  assert.deepEqual(feed.slice(0, 2).map((r) => JSON.stringify(r)), was);
  assert.equal(feed.length, 11, 'only the person’s two writes to one target are one row');
  assert.equal(JSON.stringify(feedRows(EVENTS, 3, runOf)), JSON.stringify(feedRows(EVENTS, 3, runOf, {})));
  assert.equal(JSON.stringify(feedRows(EVENTS, undefined, runOf, { zone: CAIRO })), JSON.stringify(feedRows(EVENTS, undefined, runOf)), 'a zone alone changes nothing');
  assert.ok(feedRows(EVENTS, 3, runOf).every((r) => !('day' in r) && !('run_more' in r)));
});

/* ── what installs ───────────────────────────────────────────────────────── */

const page = (block: Record<string, unknown>): Declaration => ({
  id: 'page.log',
  kind: 'page',
  body: { page: 'log', title: 'Log', blocks: [{ kind: 'feed', source: 'activity', empty: 'Nothing yet.', ...block }] } as never,
});
const at = (d: Declaration) => {
  const r = validate(d);
  return r && [r.code, r.at];
};
const FEED_SAYS = /a feed may say group: day.*fold: run/u;

test('A FEED THAT SAYS group: day, fold: run OR BOTH INSTALLS', () => {
  assert.ok(KEY_KINDS.group?.includes('feed') && KEY_KINDS.fold?.includes('feed'));
  assert.equal(validate(page({ group: 'day' })), null);
  assert.equal(validate(page({ fold: 'run' })), null);
  assert.equal(validate(page({ group: 'day', fold: 'run', first: 20, since: 'seen' })), null);
});

test('ANY OTHER WORD ON A FEED IS REFUSED AT INSTALL, in a sentence that names what a feed may say', () => {
  for (const [block, where, allowed] of [
    [{ group: 'week' }, 'blocks[0].group', ['day']],
    [{ group: 'project' }, 'blocks[0].group', ['day']],
    [{ fold: 'agent' }, 'blocks[0].fold', ['run']],
    [{ fold: true }, 'blocks[0].fold', ['run']],
    [{ fold: 3 }, 'blocks[0].fold', ['run']],
    [{ group: 'day', fold: 'agent' }, 'blocks[0].fold', ['run']],
  ] as const) {
    const r = validate(page(block));
    assert.deepEqual(r && [r.code, r.at], ['DECLARATION_INVALID', where], JSON.stringify(block));
    assert.match(r!.fix, FEED_SAYS, r!.fix);
    assert.deepEqual(r!.allowed, allowed);
    assert.doesNotMatch(r!.fix, /\u2014/u);
  }
  assert.match(validate(page({ group: 'week' }))!.fix, /page\.log\.blocks\[0\]'s group is "week"/u);
});

test('EITHER KEY ON AN agents BLOCK IS REFUSED AT INSTALL, and the sentence says a feed may', () => {
  for (const [block, where] of [
    [{ group: 'day' }, 'blocks[0].group'],
    [{ fold: 'run' }, 'blocks[0].fold'],
  ] as const) {
    const r = validate(page({ kind: 'agents', ...block }));
    assert.deepEqual(r && [r.code, r.at], ['DECLARATION_INVALID', where]);
    assert.match(r!.fix, /agents block/u);
    assert.match(r!.fix, FEED_SAYS, r!.fix);
  }
  assert.equal(validate(page({ kind: 'agents' })), null);
});

test('THE READ REFUSES WHAT THE INSTALL REFUSES, so a block handed straight to the read draws no wrong fold', () => {
  for (const block of [{ group: 'week' }, { fold: 'agent' }]) {
    const out = read(block);
    assert.equal(out.refusals[0]?.code, 'DECLARATION_INVALID', JSON.stringify(out.refusals));
    assert.match(String(out.refusals[0]?.fix), FEED_SAYS);
    assert.equal(out.feed, undefined);
  }
  const agents = readPage(depsOver([{ kind: 'agents', source: 'activity', empty: 'None.', fold: 'run' } as PageBlock]), 'log');
  assert.ok(agents.ok);
  assert.match(String(agents.value.blocks[0]?.refusals[0]?.fix), FEED_SAYS);
});

test('A CARDS BLOCK’S group AND fold ARE CHECKED EXACTLY AS BEFORE, and a section’s fold too', () => {
  const cards = (block: Record<string, unknown>): Declaration => ({
    id: 'page.work',
    kind: 'page',
    body: { page: 'work', title: 'Work', blocks: [{ kind: 'cards', source: 'register.tasks', columns: [{ field: 'what' }], ...block }] } as never,
  });
  assert.equal(validate(cards({ group: 'project' })), null);
  assert.equal(validate(cards({ group: 'project', fold: 5 })), null);
  assert.equal(validate(cards({ group: 'day' })), null, 'on cards, day is a field’s name like any other');
  assert.deepEqual(at(cards({ group: 'project', fold: 'run' })), ['OUT_OF_BOUNDS', 'blocks[0].fold']);
  assert.deepEqual(at(cards({ group: 'project', fold: 0 })), ['OUT_OF_BOUNDS', 'blocks[0].fold']);
  assert.deepEqual(at(cards({ fold: 3 })), ['DECLARATION_INVALID', 'blocks[0].fold']);
  assert.deepEqual(at(cards({ group: 'Project' })), ['DECLARATION_INVALID', 'blocks[0].group']);
  assert.deepEqual(at(cards({ group: 'project', source: 'actions' })), ['DECLARATION_INVALID', 'blocks[0].group']);
  assert.match(validate(cards({ group: 'project', fold: 'run' }))!.fix, /how many cards each group shows/u);
  const section = (fold: unknown): Declaration => ({ id: 'page.work', kind: 'page', body: { page: 'work', title: 'Work', blocks: [{ kind: 'section', heading: 'Later', fold }] } as never });
  assert.equal(validate(section(true)), null);
  assert.match(validate(section('run'))!.fix, /fold is true or false/u);
});
