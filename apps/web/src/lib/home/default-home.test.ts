/**
 * Today, declared: the body built from what the record holds, and what Home does to the page it draws — the line
 * lifted into the head, each row drawn once, what is late split out, only what is new, and nothing drawn that holds
 * nothing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMING_UP_LIMIT, DEFAULT_HOME, TODAY_LEAD, homeDrawn, railed, slashLineOf, todayHome } from './default-home.ts';
import { homeLineOf, recordDay } from './home-line.ts';
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

test('LATE MONEY IS A LINE A THING, oldest first, saying how late it is rather than the day it was due', () => {
  const late = DEFAULT_HOME.blocks.find((b) => b.source === 'deadlines' && b.where === 'day before today') as unknown as { kind: string; columns: { field: string }[] };
  assert.equal(late.kind, 'spec');
  assert.deepEqual(late.columns.map((c) => c.field), ['title', 'amount', 'day']);
  const money = block({ kind: 'spec', source: 'deadlines', columns: [{ field: 'title' }, { field: 'amount' }, { field: 'day' }] as never }, [
    { row: 'obligations#2', day: '2026-07-01' },
    { row: 'obligations#3', day: '2026-09-29' },
  ]);
  (money as { rows: unknown[] }).rows = [
    { key: 'obligations#2', cells: ['Legal review, February', '−£9,190', '1 Jul 2026'] },
    { key: 'obligations#3', cells: ['Ledger Post, sending plan', '−£39', '29 Sep 2026'] },
  ];
  const out = shown(homeDrawn([money], NOW).blocks);
  assert.deepEqual(out[0]!.rows.map((r) => r.cells), [
    ['Legal review, February', '−£9,190', '3 months late'],
    ['Ledger Post, sending plan', '−£39', '3 days late'],
  ]);
});

test('WHAT CHANGED LEAVES OUT WHAT THE PAGE ALREADY SAYS: open questions, and a rule`s note about a row that falls due', () => {
  const queue = block({ kind: 'queue', source: 'governance.open', queue: [{ id: 'SG3' }] as never, total: 4 });
  const due = block({ kind: 'timeline', source: 'deadlines' }, [{ row: 'installments#5', day: '2026-10-02' }]);
  const lines = [
    { by: 'rule', who: 'rule:recurring-missed', kind: 'suggest', target: 'suggestion:SG3', note: null, at: '2026-10-02T08:50:00Z' },
    { by: 'rule', who: 'rule:installment-due-soon', kind: 'note', target: 'installments#5', note: 'Halden licence, 3 of 4 is due today: £2,400.', at: '2026-10-02T08:40:00Z' },
    { by: 'rule', who: 'rule:cash-stale', kind: 'note', target: 'accounts#2', note: 'The balance of Tax reserve was last set 9 days ago.', at: '2026-10-02T08:30:00Z' },
  ];
  const feed = block({ kind: 'feed', source: 'activity', feed: lines as never });
  (feed as { rows: unknown[] }).rows = lines.map((_, n) => ({ key: String(n), cells: [] }));
  const out = shown(homeDrawn([queue, due, feed], NOW).blocks).find((b) => b.kind === 'feed')!;
  assert.deepEqual(out.feed?.map((r) => r.target), ['accounts#2']);
  assert.deepEqual(out.rows.map((r) => r.key), ['2']);
  /* WITH NOTHING WAITING AND NOTHING FALLING DUE, EVERY LINE STAYS; and a feed left with nothing is not drawn. */
  assert.equal(shown(homeDrawn([feed], NOW).blocks)[0]!.feed?.length, 3);
  const asked = block({ kind: 'feed', source: 'activity', feed: [lines[0]] as never });
  (asked as { rows: unknown[] }).rows = [{ key: '0', cells: [] }];
  assert.deepEqual(shown(homeDrawn([queue, asked], NOW).blocks).map((b) => b.kind), ['queue']);
  /* A QUESTION WHAT NEEDS YOU DOES NOT DRAW (past its few, or answered) keeps its line: nothing else says it. */
  const elsewhere = block({ kind: 'feed', source: 'activity', feed: [{ ...lines[0], target: 'suggestion:SG9' }] as never });
  (elsewhere as { rows: unknown[] }).rows = [{ key: '0', cells: [] }];
  assert.equal(shown(homeDrawn([queue, elsewhere], NOW).blocks).find((b) => b.kind === 'feed')?.feed?.length, 1);
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
  assert.deepEqual(out.sentence, { text: 'Two things are late, the oldest by three days. Two more need you.', needs: 'Two things are late' });
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

test('THE HEAD SAYS SLASH`S LINE WHEN THE RECORD SENT ONE, red only where it says the rules` phrase, and the rules` line otherwise', () => {
  const tasks = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }, { by: '2026-10-02' }], [4, 5]);
  /* THE RECORD SENDS HOME'S LINE AS `said` ON TODAY'S LEAD NOTE, and the page reader draws it as the note's words. */
  const page = (said?: string, extra: Partial<LiveBlock> = {}) => homeDrawn([block({ kind: 'note', lead: true, body: said ?? TODAY_LEAD, ...extra }), tasks], NOW);
  const head = (said?: string, today = true) => {
    const out = page(said);
    return homeLineOf(out.sentence!, slashLineOf(out, today), NOW);
  };
  const rules = { text: 'One thing is two days late. One more needs you.', needs: 'two days late', by: 'rules' };

  /* NO LINE FROM THE RECORD: the rules' line and its red phrase, exactly as before. */
  assert.equal(slashLineOf(page(), true), undefined);
  assert.deepEqual(head(), rules);
  /* SLASH'S LINE IS SAID, its red phrase the rules' own words in it, a count in digits or spelled. */
  assert.deepEqual(head('The Kiln invoice is two days late; 2 things need you.'), {
    text: 'The Kiln invoice is two days late; 2 things need you.',
    needs: 'two days late',
    by: 'slash',
  });
  /* WORDED ITS OWN WAY, it is drawn in ink throughout: no red the rules did not choose. */
  assert.deepEqual(head('The Kiln invoice is overdue.'), { text: 'The Kiln invoice is overdue.', needs: '', by: 'slash' });
  /* A PAGE THE RECORD DECLARES WRITES ITS OWN LEAD, which is never taken for Slash's line on Home. */
  assert.deepEqual(head('Bake opens at nine.', false), rules);
  /* A BLOCK THAT STILL CARRIES THE RECORD'S `said` IS READ FROM IT, and a dated line only on its day. */
  assert.equal(slashLineOf(page(undefined, { said: 'Kiln first.' } as Partial<LiveBlock>), false), 'Kiln first.');
  const dated = (day: string) => homeLineOf(page().sentence!, slashLineOf(page(undefined, { said: { text: 'Kiln first.', day, basis: 'b' } } as Partial<LiveBlock>), true), NOW);
  assert.equal(dated(recordDay(NOW)).by, 'slash');
  assert.deepEqual(dated('2026-09-01'), rules);
  /* THE BLOCKS DRAWN ARE THE SAME WITH A LINE AS WITHOUT ONE. */
  const shape = (o: ReturnType<typeof homeDrawn>) => o.blocks.map((b) => [b.kind, b.drawn, b.entries.length]);
  assert.deepEqual(shape(page('Kiln first.')), shape(page()));
});
