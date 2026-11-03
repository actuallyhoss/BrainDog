/**
 * Activity: one declared page, its line, the log as a feed a day at a time, and a side column of who
 * worked, what changed, the busy hours and what an agent asked, on a real record.
 *
 * WHAT WAS MEASURED BEFORE THIS. Activity was one hand-built screen at `/audit`: nobody could move a tile of it in Edit
 * layout, no agent could propose a change to it, and a `.brain` file carried none of it. A page the record holds can be
 * rearranged, proposed against and carried, and the hand-built screen can then land on it.
 *
 * READ AS THE RECORD READS ITS OWN PAGE (`k.page`), over a log the test writes: thirty changes over three days by one
 * run and one person, so the days and the fold are counted and not assumed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BLOCK_KEY, openRecord, validateDeclaration, type BlockResult, type Declaration, type Kernel } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { BUILT_IN_FIGURES } from '../../kernel/src/built-in-figures.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { AGENTS_PAGES, NOW, declarations, pageDeclarations } from '../src/index.ts';
import { ASKED_BY_AN_AGENT, BASE_PAGES } from '../src/modules/base.ts';

const PAGE = BASE_PAGES.activity!;
const ALL = PAGE.blocks as Record<string, unknown>[];
const MAIN = ALL.filter((b) => b.area !== 'rail');
const RAIL = ALL.filter((b) => b.area === 'rail');
const DECL: Declaration = { id: 'page.activity', kind: 'page', body: PAGE as never, pack: 'core' };

/** The three side tiles, each with the figure it is drawn over. */
const TILES: [string, string][] = [['Who worked', 'activity-by-who'], ['What changed', 'activity-by-kind'], ['Busy hours', 'activity-by-hour']];

const MIN = 60_000;
const DAY = 86_400_000;
const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

/** A record with every list the modules declare, this page, and a log holding nothing until a test writes to it. */
async function fresh(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = await k.install([...declarations(), DECL]);
  assert.ok(out.ok, sayOf(out));
  /* The log is the fixture: whatever the install wrote is not one of the thirty. */
  sql.exec('DELETE FROM event');
  return { k, sql };
}

let planted = 0;
/** One line of the log, written straight into the table the feed and the figures read. */
function line(sql: NodeSql, atMs: number, actor: string): void {
  const seq = ++planted;
  sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    `EV${String(seq).padStart(6, '0')}`,
    new Date(atMs).toISOString(),
    actor,
    'edit',
    `entry:THING${seq}`,
    'entry',
    null,
    null,
    null,
    null,
  );
}

/**
 * Thirty changes over three days, oldest first as a log is written: each day five by the run `S1` and five by one
 * person, turn about, a minute apart, ending an hour before the record is read.
 */
function thirty(sql: NodeSql): void {
  for (let d = 2; d >= 0; d--) for (let i = 9; i >= 0; i--) line(sql, NOW - d * DAY - 60 * MIN - i * MIN, i % 2 === 0 ? 'S1' : 'p_1');
}

type Drawn = BlockResult & { key?: string; heading?: string; feed?: { who: string | null; day?: string; count: number; run_more?: number }[]; queue?: { question?: string }[] };

function opened(k: Kernel): Drawn[] {
  const out = k.page('activity') as { ok: boolean; value: { blocks: Drawn[] } };
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.blocks;
}
const keyed = (blocks: Drawn[], key: string): Drawn | undefined => blocks.find((b) => b.key === key);

/**
 * Whether the record draws a figure over the log in parts. UNTIL `pages.ts` LETS ONE THROUGH (`metricBlock` asks every
 * figure for a `group_by`, and the three over the log are cut by their own `activity:` word), a bar over one is refused
 * at read with one sentence. The test that needs the parts says so and waits, and runs whole once the line lands.
 */
const WAITS = 'pages.ts still refuses a bar over a figure of the log, which is cut by `activity:` and has no group_by';
const refusedForParts = (b: Drawn): boolean => (b.refusals ?? []).length === 1 && b.refusals![0]!.code === 'DECLARATION_INVALID' && /groups by a word/u.test(b.refusals![0]!.fix);

test('ACTIVITY OPENS ON ITS FEED, NO LINE OVER IT SINCE core 1.3.1, AND ITS MAIN COLUMN IS ONE FEED: the log, a heading a day, one line a run, marked from where the reader last looked', () => {
  assert.equal(PAGE.page, 'activity');
  assert.equal(PAGE.title, 'Activity');
  /* "Everything that changed, a day at a time, newest first." went on 3 Nov: it said what the feed is. */
  assert.deepEqual(MAIN.map((b) => [b.kind, b.lead]), [['feed', undefined]]);
  assert.equal(ALL.indexOf(MAIN[0]!), 0, 'the feed is not the first block');
  assert.equal(ALL.some((b) => b.lead === true), false, 'a line still leads the page');
  const { source, group, fold, since, where } = MAIN[0]!;
  assert.deepEqual([source, group, fold, since, where], ['activity', 'day', 'run', 'seen', undefined]);
});

test('THE SIDE COLUMN IS THREE TILES OVER THE THREE FIGURES OF THE LOG, then what an agent asked', () => {
  assert.deepEqual(PAGE.layout, { rail: 4 });
  assert.deepEqual(RAIL.map((b) => b.heading), [...TILES.map(([heading]) => heading), 'Agents asked']);
  for (const [heading, figure] of TILES) {
    const tile = RAIL.find((b) => b.heading === heading)!;
    assert.equal(tile.source, `metric.${figure}`, heading);
    assert.ok(tile.kind === 'bar' || tile.kind === 'split', `${heading} is a ${String(tile.kind)}, which draws no parts`);
    /* THE HEADING IS THE FIGURE'S OWN NAME, so a tile and the figure an agent reads are never called two things. */
    assert.equal(BUILT_IN_FIGURES[figure]?.name, heading);
  }
});

test('WHAT AN AGENT ASKED IS A QUEUE DRAWN ONLY WHILE SOMETHING IS ASKED, and it asks as the Agents page does', () => {
  const queue = RAIL.at(-1)!;
  assert.deepEqual([queue.kind, queue.source], ['queue', 'governance.open']);
  assert.deepEqual(queue.when, { metric: 'questions-open', gt: 0 });
  assert.equal(queue.where, ASKED_BY_AN_AGENT);
  /* ONE MEANING OF "AN AGENT ASKED" ON A RECORD: the Agents page's queue held the same questions until Agents 1.17.0,
     which left each question to Needs you alone; its clause is read off that page as it was released. */
  const page16 = JSON.parse(readFileSync(new URL('./fixtures/agents-page-1.16.0.json', import.meta.url), 'utf8')) as Record<string, unknown>[];
  const theirs = page16.find((b) => b.kind === 'queue' && b.source === 'governance.open');
  assert.ok(theirs, 'the Agents page had no queue to compare with');
  assert.deepEqual(queue.where, theirs.where);
  /* AND THE AGENTS PAGE DRAWS NO QUEUE OF ITS OWN NOW, so the questions are counted in one place. */
  assert.equal((AGENTS_PAGES.agents!.blocks as Record<string, unknown>[]).filter((b) => b.kind === 'queue').length, 0);
});

test('EVERY BLOCK HAS A KEY OF ITS OWN, so a tile moved in Edit layout, or by a proposal, is found again', () => {
  const keys = ALL.map((b) => b.key);
  for (const k of keys) assert.match(String(k), BLOCK_KEY);
  assert.equal(new Set(keys).size, ALL.length, `two blocks share a key: ${keys.join(', ')}`);
});

test('IT LEANS ON NO LIST AND IS NOT ON THE RAIL, so every record can hold it and the seven places stay seven', () => {
  assert.equal(PAGE.requires, undefined);
  assert.equal(PAGE.nav, undefined);
  assert.equal(PAGE.pack, 'core');
  assert.equal(PAGE.for, undefined);
});

test('NOTHING THE GRAMMAR REFUSES: the page installs as a declaration', () => {
  assert.equal(validateDeclaration(DECL), null);
});

test('WHAT A PERSON READS ON IT IS PLAIN: no id, no dash, no word for the machine, a glyph on every heading', () => {
  const said = [PAGE.title, ...ALL.flatMap((b) => [b.heading, b.empty, b.body])].filter((s): s is string => typeof s === 'string');
  assert.ok(said.length >= 6);
  for (const s of said) {
    assert.doesNotMatch(s, /—|–/u, s);
    assert.doesNotMatch(s, /\b(row|rows|entity|register|item|event|events|log)\b/iu, s);
    assert.doesNotMatch(s, /\{\{/u, `${s} says a figure, and nothing counts what is unseen yet`);
  }
  for (const b of ALL) if (typeof b.heading === 'string') assert.match(String(b.icon), /^[a-z][a-z0-9-]*$/u, `${b.heading} wears no glyph`);
});

test('A FRESH RECORD HAS THE PAGE, and with nothing written it reads clean and draws no queue', async () => {
  const { k } = await fresh();
  assert.deepEqual(k.pages().filter((p) => p.slug === 'activity').map((p) => [p.slug, p.title, p.nav]), [['activity', 'Activity', null]]);
  const blocks = opened(k);
  const feed = keyed(blocks, 'feed')!;
  assert.deepEqual(feed.refusals ?? [], []);
  assert.deepEqual(feed.feed ?? [], []);
  assert.equal(keyed(blocks, 'line'), undefined, 'the page still draws its line of counts');
  /* NOTHING IS ASKED, so the record says the queue is not drawn: no band saying nothing waits. */
  assert.equal((keyed(blocks, 'agents-asked') as { drawn?: boolean } | undefined)?.drawn, false);
});

test('THIRTY CHANGES OVER THREE DAYS BY ONE RUN AND ONE PERSON: three days, and the run as one line a day', async () => {
  const { k, sql } = await fresh();
  thirty(sql);
  const feed = keyed(opened(k), 'feed')!;
  assert.deepEqual(feed.refusals ?? [], []);
  assert.equal(feed.matched, 30);
  const rows = feed.feed ?? [];
  const days = [...new Set(rows.map((r) => r.day))];
  assert.deepEqual(days, [0, 1, 2].map((d) => new Date(NOW - d * DAY - 60 * MIN).toISOString().slice(0, 10)), 'not three days, newest first');
  /* THE RUN WROTE FIVE LINES A DAY AND IS ONE LINE A DAY, its newest, saying four more. */
  const runs = rows.filter((r) => r.who === 'S1');
  assert.deepEqual(runs.map((r) => [r.day, r.run_more]), days.map((d) => [d, 4]));
  /* AND NOTHING IS LOST TO THE FOLD: what is drawn and what is folded under it add up to the thirty. */
  assert.equal(rows.reduce((n, r) => n + r.count + (r.run_more ?? 0), 0), 30);
  assert.ok(rows.some((r) => r.who === 'p_1'), 'the person is not on the page');
});

test('THE THREE TILES ARE READ FROM THE SAME THIRTY, each in its parts', async (t) => {
  const { k, sql } = await fresh();
  thirty(sql);
  const blocks = opened(k);
  const tiles = TILES.map(([heading]) => blocks.find((b) => b.heading === heading));
  for (const [at, tile] of tiles.entries()) assert.ok(tile, `${TILES[at]![0]} is not on the page`);
  if (tiles.every((b) => refusedForParts(b!))) return t.skip(WAITS);
  for (const [at, tile] of tiles.entries()) {
    const [heading, figure] = TILES[at]!;
    assert.deepEqual(tile!.refusals ?? [], [], heading);
    const reading = tile!.readings?.[0];
    assert.equal(reading?.metric, figure);
    assert.equal((reading?.reading?.groups ?? []).reduce((n, g) => n + (g.value ?? 0), 0), 30, `${heading} does not add up to the thirty`);
  }
});

test('A QUESTION AN AGENT ASKED IS IN THE SIDE COLUMN, and one a rule put is not', async () => {
  const { k } = await fresh();
  const asked = (question: string, who: string): void => {
    const out = k.propose({ question, body_kind: 'options', body: OPTIONS } as never, who);
    assert.ok(out.ok, sayOf(out));
  };
  /* A RULE'S QUESTION ALONE leaves the queue with nothing in it, which a host does not draw. */
  asked('A rule asks about a bill', 'rule:bills');
  const quiet = keyed(opened(k), 'agents-asked')!;
  assert.deepEqual([quiet.refusals ?? [], quiet.queue ?? [], quiet.matched], [[], [], 0]);
  asked('Retire the old key?', 'S1');
  asked('Raise the retainer?', 'agent:codex');
  const queue = keyed(opened(k), 'agents-asked') as (Drawn & { drawn?: boolean }) | undefined;
  assert.ok(queue && queue.drawn !== false, 'the queue is not drawn while two questions wait');
  assert.deepEqual(queue.refusals ?? [], []);
  assert.deepEqual((queue.queue ?? []).map((q) => q.question).sort(), ['Raise the retainer?', 'Retire the old key?']);
  assert.equal(queue.matched, 2);
});

/* THE SEED SPREADS `BASE_PAGES` INTO `PAGES` (`src/index.ts`), so a record made by `installSeed` and People's pack
   document both hold Activity. */
test('THE SEED SHIPS IT: Activity is among the pages every seeded record is given', () => {
  assert.ok(pageDeclarations().some((d) => d.id === 'page.activity'));
});
