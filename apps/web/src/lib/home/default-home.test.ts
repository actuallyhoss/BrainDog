/**
 * Today, declared: the body built from what the record holds, and what Home does to the page it draws — the line
 * lifted into the head, each row drawn once, what is late split out, only what is new, and nothing drawn that holds
 * nothing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMING_UP_LIMIT, DEFAULT_HOME, homeDrawn, railed, todayHome } from './default-home.ts';
import type { LiveBlock } from '../record/page-live.ts';

const NOW = Date.parse('2026-10-02T09:00:00');

/** A block as the record answers it, its rows one for one with its entries. */
function block(over: Partial<LiveBlock> & { kind: string }, rows: Record<string, unknown>[] = [], seqs?: number[]): LiveBlock {
  const entries = rows.map((fields, n) => ({ seq: seqs?.[n] ?? n + 1, fields, version: 1, created: '', by: '' }));
  return {
    rows: rows.map((_, n) => ({ key: String(n), cells: [], href: undefined, tone: undefined })),
    columns: [],
    entries,
    matched: entries,
    refusals: [],
    shown: rows.length,
    total: rows.length,
    drawn: true,
    stale_at: '',
    ...over,
  } as unknown as LiveBlock;
}

const day = (field: string) => [{ field, label: '', width: '' }];

/** The blocks Home draws, of the list it hands the reader. */
const shown = (blocks: readonly LiveBlock[]): LiveBlock[] => blocks.filter((b) => b.drawn);

test('THE BODY IS BUILT FROM WHAT THE RECORD HOLDS: no work blocks without tasks, no line to add without the right, no cash without Money', () => {
  const kinds = (b: { blocks: { kind: string; source?: string }[] }) => b.blocks.map((x) => x.source ?? x.kind);
  assert.deepEqual(kinds(DEFAULT_HOME), ['note', 'capture', 'governance.open', 'register.tasks', 'deadlines', 'register.tasks', 'register.tasks', 'sessions.live', 'stat', 'deadlines', 'activity']);
  assert.deepEqual(kinds(todayHome({ tasks: false, adds: false, money: false })), ['note', 'governance.open', 'deadlines', 'sessions.live', 'deadlines', 'activity']);
  assert.deepEqual(kinds(todayHome({ tasks: true, adds: false, money: false })), ['note', 'governance.open', 'register.tasks', 'deadlines', 'register.tasks', 'register.tasks', 'sessions.live', 'deadlines', 'activity']);
  /* WHAT IS LATE AND WHAT COMES UP ARE TWO READS, so the late ones never use up the next few's rows. */
  const due = DEFAULT_HOME.blocks.filter((b) => b.source === 'deadlines') as unknown as { where?: string; limit?: number }[];
  assert.deepEqual(due.map((b) => [b.where, b.limit]), [['day before today', 8], ['day after -1d', COMING_UP_LIMIT]]);
  /* EVERY TILE WEARS A GLYPH, and every block over a source says what it says when it is empty. */
  for (const b of DEFAULT_HOME.blocks) if (b.kind !== 'note') assert.ok(b.icon, `${b.kind} has an icon`);
  for (const b of DEFAULT_HOME.blocks) if (b.source) assert.ok(b.empty, `${b.source} says its empty line`);
  /* THE QUEUE IS DRAWN AS TILES, and the agents, cash, what comes up and what changed sit in the rail, what comes up
     right under cash so the two columns end near each other. */
  const raw = DEFAULT_HOME.blocks as unknown as { kind: string; tiles?: boolean; area?: string }[];
  assert.equal(raw.find((b) => b.kind === 'queue')?.tiles, true);
  assert.deepEqual(raw.filter((b) => b.area === 'rail').map((b) => b.kind), ['table', 'stat', 'timeline', 'feed']);
});

test('THE PAGE LINE IS LIFTED INTO THE HEAD, and one that fills figures stays the author tile', () => {
  const plain = homeDrawn([block({ kind: 'note', lead: true, body: 'Calm.' }), block({ kind: 'chips', body: 'Kiln · Bake' })], NOW);
  assert.equal(plain.lead, 'Calm.');
  assert.deepEqual(shown(plain.blocks).map((b) => b.kind), ['chips']);
  /* A PAGE OF FIGURES HAS NOTHING TO COUNT, so the line is its own. */
  assert.equal(plain.sentence, null);
  const filled = homeDrawn([block({ kind: 'note', lead: true, body: 'Cash is {{cash-now}}.' })], NOW);
  assert.equal(filled.lead, null);
  assert.equal(shown(filled.blocks).length, 1);
});

test('A ROW IS DRAWN ONCE: a late urgent task is in the first block, and a deadline that is a task drawn above is not drawn again', () => {
  const late = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }, { by: '2026-10-02' }], [4, 5]);
  const urgent = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }, { by: '' }], [4, 9]);
  const due = block({ kind: 'timeline', source: 'deadlines' }, [
    { row: 'tasks#4', day: '2026-09-30' },
    { row: 'obligations#2', day: '2026-09-29' },
    { row: 'tasks#7', day: '2026-10-08' },
  ]);
  const out = homeDrawn([late, urgent, due], NOW);
  assert.deepEqual(shown(out.blocks).map((b) => [b.heading ?? '', b.entries.map((e) => e.seq)]), [
    ['', [4, 5]],
    ['', [9]],
    ['Late', [2]],
    ['', [3]],
  ]);
  /* THE LINE COUNTS WHAT IS DRAWN: three tasks and a late bill, the oldest from Tuesday. */
  assert.deepEqual(out.sentence, { text: 'Four things need you, and two are late, the oldest 3 days late.', needs: 'two are late' });
});

test('WHAT CHANGED IS ONLY WHAT IS NEW, and a block with nothing to show is not drawn', () => {
  const feed = block({
    kind: 'feed',
    source: 'activity',
    seen: '2026-10-02T08:00:00Z',
    feed: [{ at: '2026-10-02T08:30:00Z' }, { at: '2026-10-01T10:00:00Z' }] as never,
  });
  (feed as { rows: unknown[] }).rows = [{ key: 'a' }, { key: 'seen' }, { key: 'b' }];
  const runs = block({ kind: 'table', source: 'sessions.live' });
  const queue = block({ kind: 'queue', source: 'governance.open', queue: [] });
  const out = homeDrawn([queue, runs, feed], NOW);
  assert.deepEqual(shown(out.blocks).map((b) => [b.kind, b.rows.length]), [['feed', 1]]);
  assert.deepEqual(out.sentence, { text: 'Nothing needs you, and no agent is working.', needs: '' });
  const read = homeDrawn([{ ...feed, seen: '2026-10-02T08:45:00Z' }], NOW);
  assert.equal(shown(read.blocks).length, 0);
});

test('A REFUSED BLOCK IS NEVER HIDDEN, and the rail is kept only beside a main column', () => {
  const refused = block({ kind: 'todo', source: 'register.tasks', refusals: ['tasks has no state called review'] });
  assert.equal(shown(homeDrawn([refused], NOW).blocks).length, 1);
  const rail = { ...block({ kind: 'feed' }), area: 'rail' } as LiveBlock;
  assert.equal(railed([rail]), false);
  assert.equal(railed([block({ kind: 'queue' }), rail]), true);
});

test('A BLOCK THAT EMPTIES KEEPS ITS PLACE: the reader keys its writes by place, so the blocks after it never move up', () => {
  const page = (urgent: Record<string, unknown>[]) =>
    homeDrawn(
      [
        block({ kind: 'note', lead: true, body: 'Calm.' }),
        block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, urgent, [9]),
        block({ kind: 'timeline', source: 'deadlines' }, [{ row: 'obligations#2', day: '2026-10-08' }]),
        block({ kind: 'feed', source: 'activity', feed: [{ at: '2026-10-02T08:30:00Z' }] as never }, [{}]),
      ],
      NOW,
    ).blocks.map((b) => [b.kind, b.heading ?? '', b.drawn]);
  const before = page([{ by: '' }]);
  const after = page([]);
  assert.equal(before.length, after.length);
  assert.deepEqual(after, [
    ['note', '', false],
    ['todo', '', false],
    ['timeline', 'Late', false],
    ['timeline', '', true],
    ['feed', '', true],
  ]);
  /* A RAIL WHOSE EVERY BLOCK IS NOT DRAWN IS NO RAIL. */
  const rail = { ...block({ kind: 'feed' }), area: 'rail', drawn: false } as LiveBlock;
  assert.equal(railed([block({ kind: 'queue' }), rail]), false);
});

test('HOME HIDES WHAT HOLDS NOTHING BY THE PAGE READER`S RULE, even where an empty line was written, and a section over nothing goes', () => {
  const out = homeDrawn(
    [
      block({ kind: 'capture', register: 'tasks' }),
      block({ kind: 'section', heading: 'Agents' }),
      block({ kind: 'table', source: 'sessions.live', empty: 'No agent is working.' }),
      block({ kind: 'stat', source: 'figures.home', metrics: [], empty: 'Nothing pinned.' }),
    ],
    NOW,
  );
  assert.deepEqual(out.blocks.map((b) => [b.kind, b.drawn]), [
    ['capture', true],
    ['section', false],
    ['table', false],
    ['stat', false],
  ]);
});

test('WHEN EVERY DRAWN DEADLINE IS LATE, LATE KEEPS WHAT STANDS PAST THE LIMIT and the block for later days is not drawn empty', () => {
  const due = block({ kind: 'timeline', source: 'deadlines' }, [
    { row: 'obligations#2', day: '2026-09-29' },
    { row: 'obligations#3', day: '2026-09-30' },
  ]);
  const out = homeDrawn([{ ...due, total: 9 }], NOW);
  assert.deepEqual(out.blocks.map((b) => [b.heading ?? '', b.drawn, b.total]), [
    ['Late', true, 9],
    ['', false, 0],
  ]);
});

test('LATE IS ONE TILE: the late money joins the late tasks before it, under their name, which says "or due today" while one is', () => {
  const late = (by: string[]) => block({ kind: 'todo', heading: 'Late', source: 'register.tasks', columns: day('by') as never }, by.map((d) => ({ by: d })), by.map((_, n) => n + 4));
  const money = block({ kind: 'timeline', heading: 'Late', source: 'deadlines' }, [
    { row: 'tasks#4', day: '2026-09-30' },
    { row: 'obligations#2', day: '2026-09-29' },
  ]);
  const page = (tasks: LiveBlock) => shown(homeDrawn([tasks, money], NOW).blocks).map((b) => [b.heading ?? '', (b as { joins?: boolean }).joins === true, b.entries.map((e) => e.seq)]);
  assert.deepEqual(page(late(['2026-09-30'])), [
    ['Late', false, [4]],
    ['', true, [2]],
  ]);
  assert.deepEqual(page(late(['2026-09-30', '2026-10-02'])), [
    ['Late or due today', false, [4, 5]],
    ['', true, [2]],
  ]);
  /* WITH NO LATE TASKS THE MONEY IS THE TILE, under its own name; and a list with work not yet due is not joined. */
  assert.deepEqual(page(late([])), [['Late', false, [1, 2]]]);
  assert.deepEqual(page(late(['2026-09-30', '2026-10-09'])), [
    ['Late', false, [4, 5]],
    ['Late', false, [2]],
  ]);
});
