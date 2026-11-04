/**
 * Today, declared: the body built from what the record holds, and what Home does to the page it draws — the line
 * lifted into the head, each row drawn once, what is late split out, only what is new, and nothing drawn that holds
 * nothing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { openRecord } from '@braindog/kernel';

import { COMING_UP_LIMIT, DEFAULT_HOME, DESK_KEYS, NUMBERS, PEOPLE_LIMIT, TODAY_LEAD, captureHeading, homeDrawn, numbersTile, onDesk, peopleOf, quietHeld, railed, slashLineOf, todayHome, weekMoney, weekOf, type Holds, type HomeVoice, type Week, type WeekDecl } from './default-home.ts';
import { homeLineOf, recordDay } from './home-line.ts';
import type { LiveBlock } from '../record/page-live.ts';
import type { WithRows } from './home-rows.ts';

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
  /* WHO IS WORKING IS NOT A BLOCK OF TODAY'S OWN BODY (today F1): Home draws it from `boot`, once. THE WORK DUE THIS
     WEEK is its own tile beside what comes up with money on it (audit Q10). */
  assert.deepEqual(kinds(DEFAULT_HOME), ['note', 'capture', 'governance.open', 'register.tasks', 'deadlines', 'register.tasks', 'register.tasks', 'stat', 'kpis', 'stat', 'deadlines', 'register.tasks', 'activity']);
  assert.deepEqual(kinds(todayHome({ tasks: false, adds: false, money: false })), ['note', 'governance.open', 'deadlines', 'kpis', 'deadlines', 'activity']);
  assert.deepEqual(kinds(todayHome({ tasks: true, adds: false, money: false })), ['note', 'governance.open', 'register.tasks', 'deadlines', 'register.tasks', 'register.tasks', 'kpis', 'deadlines', 'register.tasks', 'activity']);
  /* WHAT IS LATE AND WHAT COMES UP ARE TWO READS, so the late ones never use up the next few's rows. */
  const due = DEFAULT_HOME.blocks.filter((b) => b.source === 'deadlines') as unknown as { where?: string; limit?: number }[];
  /* WHAT COMES UP IS WHAT FALLS DUE WITH MONEY ON IT (audit Q10), as Money's Coming up reads it. */
  assert.deepEqual(due.map((b) => [b.where, b.limit]), [['day before today', 8], ['amount is set, day after -1d', COMING_UP_LIMIT]]);
  /* EVERY TILE WEARS A GLYPH, and every block over a source says what it says when it is empty. */
  for (const b of DEFAULT_HOME.blocks) if (b.kind !== 'note') assert.ok(b.icon, `${b.kind} has an icon`);
  for (const b of DEFAULT_HOME.blocks) if (b.source) assert.ok(b.empty, `${b.source} says its empty line`);
  /* THE QUEUE IS DRAWN AS TILES, and Today is one board with no rail: the desk's blocks are keyed and given their share
     of a row (five, four and three; then three and three beside Arrivals), and the rest fold behind More. */
  const raw = DEFAULT_HOME.blocks as unknown as { kind: string; tiles?: boolean; area?: string; key?: string; span?: number }[];
  assert.equal(raw.find((b) => b.kind === 'queue')?.tiles, true);
  assert.equal(DEFAULT_HOME.layout, undefined);
  assert.deepEqual(raw.filter((b) => b.area !== undefined), []);
  /* EVERY WIDGET OF THE BOARD IS KEYED (the widgets plan of 29 October, §4.1), and the late band's four reads with it. */
  assert.deepEqual(raw.filter((b) => b.key !== undefined).map((b) => [b.key, b.span]), [
    ['needs-you', 5], ['late', undefined], ['overdue-money', undefined], ['to-check', undefined], ['urgent', undefined],
    ['cash', 3], ['numbers', 12], ['week-money', 3], ['coming-up', 3], ['work-due', undefined], ['arrivals', undefined],
  ]);
});

test('TODAY CARRIES THE FEW KEY NUMBERS THAT LEAD, as the record ranks them, a whole row under cash and named Numbers', () => {
  const numbers = DEFAULT_HOME.blocks.find((b) => b.kind === 'kpis') as unknown as Record<string, unknown> & { key: string };
  assert.deepEqual(numbers, numbersTile() as unknown);
  /* THE RECORD PICKS AND ORDERS THEM (`kpisForToday`): the block asks for Today's form and names no order, no limit and no list. */
  assert.deepEqual(
    { kind: numbers.kind, source: numbers.source, for: numbers.for, key: numbers.key, heading: numbers.heading, icon: numbers.icon, span: numbers.span },
    { kind: 'kpis', source: NUMBERS, for: 'today', key: 'numbers', heading: 'Numbers', icon: 'gauge', span: 12 },
  );
  for (const key of ['order', 'limit', 'where', 'register', 'columns']) assert.equal(numbers[key], undefined, key);
  assert.ok(onDesk(numbers), 'shown at rest, never folded behind More');
  /* ON EVERY RECORD, under cash where there is cash and before what is coming up. */
  for (const holds of [{ tasks: true, adds: true, money: true }, { tasks: false, adds: false, money: false }] as Holds[]) {
    const at = todayHome(holds).blocks.map((b) => (b as unknown as { key?: string }).key ?? b.kind);
    assert.ok(at.indexOf('numbers') < at.indexOf('coming-up'));
    if (holds.money) assert.equal(at.indexOf('numbers'), at.indexOf('cash') + 1);
  }
});

test('NO KEY NUMBER, NO TILE: a record that keeps none answers none and Today draws nothing, and a host that cannot read them is not drawn a refusal', () => {
  /* AS THE RECORD ANSWERS IT: its key numbers, and how many it ranked (`matched`), with no rows. */
  const tile = (kpis: unknown, refusals: unknown[] = []) =>
    block({ kind: 'kpis', source: 'kpis', key: 'numbers', heading: 'Numbers', kpis, matched: Array.isArray(kpis) ? kpis.length : 0, refusals } as never);
  const sales = { kpi: 'k1', name: 'Sales a month', project: 'Kiln', hue: 265, unit: 'GBP', kind: 'flow', points: [{ at: '2026-09-01', amount: 'GBP 4,350.00' }], rank: 'money' };
  const drawnOf = (b: LiveBlock) => homeDrawn([b], NOW).blocks[0]!.drawn;
  assert.equal(drawnOf(tile([])), false, 'none answered: no empty box');
  assert.equal(drawnOf(tile(undefined)), false, 'nothing answered at all');
  assert.equal(drawnOf(tile([sales])), true);
  /* A REFUSED ONE IS NEVER HIDDEN BY BEING EMPTY, but Today's own body holds it, as it holds what went quiet. */
  const refused = tile(undefined, [{ code: 'NOT_IN_THIS_BUILD', fix: 'This BrainDog does not read its key numbers onto a page yet.' }]);
  assert.equal(drawnOf(refused), true);
  assert.equal(quietHeld([refused])[0]!.drawn, false);
  assert.equal(quietHeld([tile([sales])])[0]!.drawn, true);
});

test('TODAY IS A BOARD: every widget keyed and sized, the phone in its own order, and no more than sixteen', () => {
  const body = todayHome({ tasks: true, adds: true, money: true, runs: true, health: true, quiet: true });
  assert.equal(body.board, true);
  const widgets = body.blocks.filter((b) => (b as { size?: unknown }).size !== undefined);
  assert.ok(widgets.length <= 16);
  assert.ok(body.blocks.every((b) => b.kind === 'capture' || (b.kind === 'note' && (b as { lead?: unknown }).lead === true) || typeof (b as { key?: unknown }).key === 'string'));
  assert.deepEqual(body.phone?.order?.slice(0, 3), ['needs-you', 'late', 'working']);
  assert.ok(DESK_KEYS.every((k) => onDesk({ key: k })));
  /* AUDIT Q10: the money tile reads Money's own due list, and the work has its own heading. */
  const coming = body.blocks.find((b) => (b as { key?: unknown }).key === 'coming-up') as { where?: string };
  assert.match(coming.where ?? '', /^amount is set/);
  assert.ok(body.blocks.some((b) => (b as { key?: unknown }).key === 'work-due'));
});

test('THE DESK NAMES A FEW PEOPLE where the record keeps a list of them, by its own words and never by its name', () => {
  const people: WeekDecl = {
    id: 'folk',
    name: 'Folk',
    one: 'Person',
    title: 'name',
    fields: [
      { id: 'name', type: 'text' },
      { id: 'merged_into', type: 'ref', to: 'folk' },
      { id: 'org', type: 'ref', to: 'organisations' },
    ],
  } as never;
  assert.equal(peopleOf([people], null), undefined);
  assert.equal(peopleOf([], 'folk'), undefined);
  const p = peopleOf([people], 'folk')!;
  /* AND LEAVES OUT WHO IS FOLDED INTO ANOTHER, as People counts them. */
  assert.deepEqual(p, { register: 'folk', name: 'Folk', icon: 'users', title: 'name', fact: 'org', where: 'merged_into is empty' });
  assert.equal(peopleOf([{ ...people, icon: 'heart' } as never], 'folk')?.icon, 'heart');
  const tile = todayHome({ tasks: true, adds: true, money: true, people: p }).blocks.find((b) => b.source === 'register.folk') as unknown as { key: string; span: number; heading: string; columns: { field: string; as: string }[]; limit: number };
  assert.equal(tile.key, 'faces');
  assert.equal(tile.span, 3);
  assert.equal(tile.heading, 'Folk');
  assert.deepEqual(tile.columns.map((c) => [c.field, c.as]), [['name', 'who'], ['org', 'fact']]);
  assert.equal(tile.limit, PEOPLE_LIMIT);
});

/* Today said "People 8" over every row of the list, the
   record's own person and those merged into another among them, while People said "7 contacts". */
test('Today counts the people People counts: never the reader, never one merged into another', () => {
  const people: WeekDecl = {
    id: 'folk',
    name: 'Folk',
    one: 'Person',
    title: 'name',
    meets: { name: 'name', merged_into: 'folded', self: 'me' },
    fields: [
      { id: 'name', type: 'text' },
      { id: 'folded', type: 'ref', to: 'folk' },
      { id: 'me', type: 'bool' },
    ],
  } as never;
  const p = peopleOf([people], 'folk')!;
  const tile = todayHome({ tasks: true, adds: true, money: true, people: p }).blocks.find((b) => b.source === 'register.folk') as unknown as { where?: string };
  assert.equal(tile.where, 'folded is empty, me is not true');
  /* A LIST THAT MARKS NEITHER keeps every row, and asks of no field it lacks. */
  const plain = peopleOf([{ ...people, meets: undefined, fields: [{ id: 'name', type: 'text' }] } as never], 'folk')!;
  assert.equal((todayHome({ tasks: true, adds: true, money: true, people: plain }).blocks.find((b) => b.source === 'register.folk') as { where?: string }).where, undefined);
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
    /* IN DAYS ALWAYS (30 October), as a list's cards and tables say it. */
    ['Legal review, February', '−£9,190', '93 days late'],
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
  const plain = homeDrawn([block({ kind: 'note', lead: true, body: 'Calm.' }), block({ kind: 'chips', body: 'Kiln · Oxbow' })], NOW);
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
  /* THE LINE COUNTS WHAT IS LATE: a late task and a late bill with no amount. Nothing is a question, so nothing needs you. */
  assert.deepEqual(out.sentence, { text: 'Nothing needs you. 2 things are late.', needs: '2 things are late' });
});

test('YOUR WORK THIS WEEK KEEPS ITS OWN ROWS, so it says what Work says, and the late band keeps the rest (live check of 30 October, 5)', () => {
  const late = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }, { by: '2026-10-02' }], [4, 5]);
  const urgent = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-10-03' }, { by: '' }], [6, 9]);
  const week = block({ kind: 'todo', key: 'work-due', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-10-02' }, { by: '2026-10-03' }, { by: '2026-10-06' }], [5, 6, 7]);
  const out = homeDrawn([late, urgent, week], NOW);
  assert.deepEqual(shown(out.blocks).map((b) => [b.key ?? '', b.entries.map((e) => e.seq), b.total]), [
    ['', [4], 1],
    ['', [9], 1],
    ['work-due', [5, 6, 7], 3],
  ]);
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
  assert.deepEqual(out.sentence, { text: 'Nothing needs you.', needs: '' });
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
  /* THE LINE A TASK IS TYPED INTO IS LIFTED INTO THE HEAD, and keeps its place in the list, not drawn. */
  assert.deepEqual(out.blocks.map((b) => [b.kind, b.drawn]), [
    ['capture', false],
    ['section', false],
    ['table', false],
    ['stat', false],
  ]);
  assert.equal(out.capture?.register, 'tasks');
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

test('LATE IS ONE LIST: the late money joins the late tasks before it, every thing in one shape, with the count of both', () => {
  const late = (by: string[]) => block({ kind: 'todo', heading: 'Late', source: 'register.tasks', columns: day('by') as never }, by.map((d) => ({ by: d })), by.map((_, n) => n + 4));
  const money = block({ kind: 'timeline', heading: 'Late', source: 'deadlines' }, [
    { row: 'tasks#4', day: '2026-09-30' },
    { row: 'obligations#2', day: '2026-09-29' },
  ]);
  const page = (tasks: LiveBlock) =>
    shown(homeDrawn([tasks, money], NOW).blocks).map((b) => {
      const rows = (b as WithRows).homeRows;
      return [b.heading ?? '', b.total, rows?.kind === 'late' ? rows.lines.map((l) => [l.when, l.late, l.tick ?? null]) : null];
    });
  /* ONE LIST UNDER THE TASKS' NAME, the tasks first and each tickable, and the money's own block not drawn. */
  assert.deepEqual(page(late(['2026-09-30'])), [
    [
      'Late',
      2,
      [
        ['2 days late', true, 4],
        ['3 days late', true, null],
      ],
    ],
  ]);
  /* A TASK ONLY DUE TODAY IS NOT LATE YET, and the name says so. */
  assert.deepEqual(page(late(['2026-09-30', '2026-10-02'])), [
    [
      'Late or due today',
      3,
      [
        ['2 days late', true, 4],
        ['Due today', false, 5],
        ['3 days late', true, null],
      ],
    ],
  ]);
  /* WITH NO LATE TASKS THE MONEY IS THE LIST, under its own name; and a list with work not yet due is not joined. */
  assert.deepEqual(page(late([])), [
    [
      'Late',
      2,
      [
        ['2 days late', true, null],
        ['3 days late', true, null],
      ],
    ],
  ]);
  assert.deepEqual(page(late(['2026-09-30', '2026-10-09'])), [
    ['Late', 2, null],
    ['Late', 1, [['3 days late', true, null]]],
  ]);
});

test('THE LATE LIST SAYS WHICH HALF RAN PAST ITS LIMIT, so the door under it opens the half that was cut', () => {
  const tasks = (total: number) => ({ ...block({ kind: 'todo', heading: 'Late', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }], [4]), total });
  const money = (total: number) => ({
    ...block({ kind: 'spec', heading: 'Late', source: 'deadlines' }, [{ row: 'obligations#2', day: '2026-09-29' }, { row: 'obligations#3', day: '2026-09-30' }]),
    total,
  });
  const more = (blocks: LiveBlock[]) =>
    shown(homeDrawn(blocks, NOW).blocks).map((b) => {
      const rows = (b as WithRows).homeRows;
      return [b.total, b.shown, rows?.kind === 'late' ? rows.more : null];
    });
  /* SEVEN BILLS MORE AND EVERY TASK DRAWN: the money was cut, and the one count of both does not say so. */
  assert.deepEqual(more([tasks(1), money(9)]), [[10, 3, { tasks: 0, money: 7 }]]);
  assert.deepEqual(more([tasks(4), money(2)]), [[6, 3, { tasks: 3, money: 0 }]]);
  assert.deepEqual(more([tasks(4), money(9)]), [[13, 3, { tasks: 3, money: 7 }]]);
  assert.deepEqual(more([tasks(1), money(2)]), [[3, 3, { tasks: 0, money: 0 }]]);
  /* LATE MONEY WITH NO LATE TASK BESIDE IT is the list on its own block, and says its own half. */
  assert.deepEqual(more([money(9)]), [[9, 2, { tasks: 0, money: 7 }]]);
});

test('COMING UP IS A FEW DAYS, each a chip with what falls due on it, and a feed never ends on a bare number', () => {
  const due = block({ kind: 'timeline', heading: 'Coming up', source: 'deadlines' }, [
    { row: 'obligations#2', day: '2026-10-02' },
    { row: 'obligations#3', day: '2026-10-02' },
    { row: 'obligations#4', day: '2026-10-05' },
  ]);
  const out = shown(homeDrawn([due], NOW).blocks);
  const rows = (out[0] as WithRows).homeRows;
  assert.equal(rows?.kind, 'days');
  if (rows?.kind !== 'days') return;
  assert.deepEqual(
    rows.days.map((d) => [d.weekday, d.date, d.today, d.lines.length]),
    [
      ['Fri', '2', true, 2],
      ['Mon', '5', false, 1],
    ],
  );
  const feed = block({ kind: 'feed', source: 'activity', feed: [{ at: '2026-10-02T08:30:00Z' }, { at: '2026-10-02T08:00:00Z' }] as never });
  (feed as { rows: unknown[] }).rows = [
    { key: 'a', cells: ['rule', '', '1', 'Categorised 3 payments', '1h ago'] },
    { key: 'b', cells: ['rule', '', '248', '', '2h ago'] },
  ];
  const fed = shown(homeDrawn([feed], NOW).blocks)[0]!;
  assert.deepEqual(
    fed.rows.map((r) => [r.cells[2], r.cells[3]]),
    [
      ['1', 'Categorised 3 payments'],
      ['', '248 changes'],
    ],
  );
});

test('THE HEAD SAYS SLASH`S LINE WHEN THE RECORD SENT ONE, red only where it says the rules` phrase, and the rules` line otherwise', () => {
  const tasks = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }, { by: '2026-10-02' }], [4, 5]);
  /* THE RECORD SENDS HOME'S LINE AS `said` ON TODAY'S LEAD NOTE, and the page reader draws it as the note's words. */
  const page = (said?: string, extra: Partial<LiveBlock> = {}) => homeDrawn([block({ kind: 'note', lead: true, body: said ?? TODAY_LEAD, ...extra }), tasks], NOW);
  const head = (said?: string, today = true) => {
    const out = page(said);
    return homeLineOf(out.sentence!, slashLineOf(out, today), NOW);
  };
  const rules = { text: 'Nothing needs you. 1 thing is late.', needs: '1 thing is late', by: 'rules' };

  /* NO LINE FROM THE RECORD: the rules' line and its red phrase, exactly as before. */
  assert.equal(slashLineOf(page(), true), undefined);
  assert.deepEqual(head(), rules);
  /* SLASH'S LINE IS SAID, its red phrase the rules' own words in it, a count in digits or spelled. */
  assert.deepEqual(head('The Kiln invoice: 1 thing is late, two days.'), {
    text: 'The Kiln invoice: 1 thing is late, two days.',
    needs: '1 thing is late',
    by: 'slash',
  });
  /* WORDED ITS OWN WAY, it is drawn in ink throughout: no red the rules did not choose. */
  assert.deepEqual(head('The Kiln invoice is overdue.'), { text: 'The Kiln invoice is overdue.', needs: '', by: 'slash' });
  /* A PAGE THE RECORD DECLARES WRITES ITS OWN LEAD, which is never taken for Slash's line on Home. */
  assert.deepEqual(head('Oxbow opens at nine.', false), rules);
  /* A BLOCK THAT STILL CARRIES THE RECORD'S `said` IS READ FROM IT, and a dated line only on its day. */
  assert.equal(slashLineOf(page(undefined, { said: 'Kiln first.' } as Partial<LiveBlock>), false), 'Kiln first.');
  const dated = (day: string) => homeLineOf(page().sentence!, slashLineOf(page(undefined, { said: { text: 'Kiln first.', day, basis: 'b' } } as Partial<LiveBlock>), true), NOW);
  assert.equal(dated(recordDay(NOW)).by, 'slash');
  assert.deepEqual(dated('2026-09-01'), rules);
  /* THE BLOCKS DRAWN ARE THE SAME WITH A LINE AS WITHOUT ONE. */
  const shape = (o: ReturnType<typeof homeDrawn>) => o.blocks.map((b) => [b.kind, b.drawn, b.entries.length]);
  assert.deepEqual(shape(page('Kiln first.')), shape(page()));
});

test('TODAY INSTALLED AS `home` SAYS THE MODEL`S LINE WHEN ITS READ CARRIES ONE, and the rules` line when it does not', () => {
  const tasks = block({ kind: 'todo', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }, { by: '2026-10-02' }], [4, 5]);
  /* ARRANGED AND KEPT, Today is the record's `home` page, so Home reads it as a declared page (`declares` is `home`, not
     `null`) and never guesses a line from its lead. The record's `page` read marks the model's line as `said` on the
     lead note, which the page reader draws as the note's words. */
  const installed = (lead?: Partial<LiveBlock>) => homeDrawn([block({ kind: 'note', lead: true, body: TODAY_LEAD, ...lead }), tasks], NOW);
  const head = (out: ReturnType<typeof homeDrawn>) => homeLineOf(out.sentence!, slashLineOf(out, false), NOW);
  const rules = { text: 'Nothing needs you. 1 thing is late.', needs: '1 thing is late', by: 'rules' };

  const line = 'The Kiln invoice: 1 thing is late; start there.';
  assert.deepEqual(head(installed({ body: line, said: line } as Partial<LiveBlock>)), { text: line, needs: '1 thing is late', by: 'slash' });
  /* WITH NO LINE ON THE READ, the rules' sentence, red phrase and all. */
  assert.deepEqual(head(installed()), rules);
  /* AND A LINE THE RECORD KEPT YESTERDAY is not today's. */
  assert.deepEqual(head(installed({ said: { text: line, day: '2026-10-01', basis: 'b' } } as Partial<LiveBlock>)), rules);
});

test('LATE IS COUNTED FROM WHAT THE LATE BLOCK HOLDS, not from the eight it draws, and a late row is counted once', () => {
  /* TWENTY LATE TASKS, the oldest eight drawn: Today's Late keeps every row before tomorrow. */
  const days = ['2026-08-01', '2026-08-03', '2026-08-09', '2026-08-25', '2026-09-01', '2026-09-10', '2026-09-20', '2026-09-27'];
  const lateTasks = (over: Partial<LiveBlock> = {}) =>
    block({ kind: 'todo', source: 'register.tasks', where: 'state is not done or dropped, by before +1d', columns: day('by') as never, total: 20, ...over }, days.map((by) => ({ by })), days.map((_, n) => n + 1));
  const out = homeDrawn([lateTasks()], NOW);
  assert.deepEqual(out.sentence, { text: 'Nothing needs you. 20 things are late.', needs: '20 things are late' });

  /* AN URGENT TASK PAST LATE'S EIGHT IS ONE OF ITS TWENTY, so it is not counted again, late or as needing you. */
  const urgent = block({ kind: 'todo', source: 'register.tasks', where: 'state is not done or dropped, priority is urgent', columns: day('by') as never }, [{ by: '2026-09-28' }, { by: '2026-10-09' }], [30, 31]);
  assert.equal(homeDrawn([lateTasks(), urgent], NOW).sentence?.text, 'Nothing needs you. 20 things are late.');

  /* WITH ONE DRAWN ROW ONLY DUE TODAY, what stands past the limit is due today too and is not called late. */
  const today = block(
    { kind: 'todo', source: 'register.tasks', where: 'by before +1d', columns: day('by') as never, total: 5 },
    [{ by: '2026-09-30' }, { by: '2026-10-02' }],
    [1, 2],
  );
  assert.equal(homeDrawn([today], NOW).sentence?.text, 'Nothing needs you. 1 thing is late.');

  /* A LIST WITH NO BOUND OF ITS OWN may hold next month's work past its limit: that is not late. */
  const unbounded = block({ kind: 'todo', source: 'register.tasks', where: 'priority is urgent', columns: day('by') as never, total: 9 }, [{ by: '2026-09-30' }], [1]);
  assert.equal(homeDrawn([unbounded], NOW).sentence?.text, 'Nothing needs you. 1 thing is late.');

  /* LATE MONEY PAST ITS LIMIT is late too, as Late's own total says, and needs you. */
  const money = block({ kind: 'spec', source: 'deadlines', where: 'day before today', total: 6 }, [
    { row: 'obligations#2', day: '2026-07-01' },
    { row: 'obligations#3', day: '2026-09-29' },
  ]);
  const paid = homeDrawn([money], NOW);
  assert.equal(paid.sentence?.text, 'Nothing needs you. 6 things are late.');
  assert.equal(shown(paid.blocks)[0]!.total, 6);
  /* WHAT FALLS DUE WITH NO BOUND OF ITS OWN reads a fortnight ahead, so what stands past its limit may not have fallen due. */
  const ahead = homeDrawn([block({ kind: 'spec', source: 'deadlines', total: 12 }, [{ row: 'obligations#2', day: '2026-07-01' }, { row: 'obligations#3', day: '2026-09-29' }])], NOW);
  assert.equal(ahead.sentence?.text, 'Nothing needs you. 2 things are late.');

  /* A DEADLINE THAT IS ONE OF LATE'S UNDRAWN TASKS is not a second late thing. */
  const due = block({ kind: 'timeline', source: 'deadlines' }, [{ row: 'tasks#15', day: '2026-09-28' }, { row: 'obligations#2', day: '2026-09-29' }]);
  assert.equal(homeDrawn([lateTasks(), due], NOW).sentence?.text, 'Nothing needs you. 21 things are late.');
});

test('THE LINE A TASK IS TYPED INTO IS NAMED BY THE LIST`S OWN SINGULAR, with the article chosen for it', () => {
  const capture = (one?: string) => todayHome({ tasks: true, adds: true, money: false, ...(one === undefined ? {} : { one }) }).blocks.find((b) => b.kind === 'capture')?.heading;
  assert.equal(capture(), 'Add a task');
  assert.equal(capture('job'), 'Add a job');
  assert.equal(capture('errand'), 'Add an errand');
  assert.equal(capture('  '), 'Add a task');
  assert.equal(captureHeading(undefined), 'Add a task');
});

test('A HOME INSTALLED FROM TODAY KEEPS SPEAKING IN THE VOICE: a heading still in the house words is said the voice`s way', () => {
  const voice: HomeVoice = {
    rightNow: 'Right now',
    needsYou: 'On your desk',
    sinceAway: 'While you were out',
    workingNow: 'Working now',
    comingUp: 'Next up',
    overdue: 'Overdue',
    nothingWaiting: 'Your desk is clear.',
    nothingDue: 'Nothing falls due in the next two weeks.',
  };
  /* KEPT BY THE ARRANGE MODE'S FIRST DONE in the house voice, and one heading the author wrote. */
  const installed = [
    block({ kind: 'capture', heading: 'Add a task', register: 'tasks' }),
    block({ kind: 'queue', heading: 'Needs you', source: 'governance.open', empty: 'Nothing is waiting on you.', queue: [{ id: 'SG1' }] as never, total: 1 }),
    block({ kind: 'todo', heading: 'Late', source: 'register.tasks', columns: day('by') as never }, [{ by: '2026-09-30' }], [4]),
    block({ kind: 'todo', heading: 'My own list', source: 'register.tasks', columns: day('by') as never }, [{ by: '' }], [9]),
    block({ kind: 'timeline', heading: 'Coming up', source: 'deadlines' }, [{ row: 'obligations#2', day: '2026-10-08' }]),
  ];
  const out = homeDrawn(installed, NOW, voice, 'errand');
  assert.equal(out.capture?.heading, 'Add an errand');
  assert.deepEqual(
    shown(out.blocks).map((b) => b.heading),
    ['On your desk', 'Overdue', 'My own list', 'Next up'],
  );
  assert.equal(shown(out.blocks)[0]!.empty, 'Your desk is clear.');
  /* AND IN THE HOUSE VOICE, NOTHING IS TOUCHED: the very blocks handed in. */
  const house = homeDrawn(installed, NOW);
  assert.equal(house.capture, installed[0]);
  assert.equal(house.blocks[1], installed[1]);
  /* A CAPTURE LINE THE AUTHOR NAMED, or over another list, keeps its words. */
  const own = homeDrawn([block({ kind: 'capture', heading: 'Jot it down', register: 'tasks' }), block({ kind: 'capture', heading: 'Add a task', register: 'notes' })], NOW, voice, 'errand');
  assert.deepEqual(own.blocks.map((b) => b.heading), ['Jot it down', 'Add a task']);
});

/* ── a figure's line ─────────────────────────────────────────────────────────── */

/** The Money tile as the record answers it: cash now, with the line its `trend:` drew or none. */
const cashTile = (trend?: (number | null)[]): LiveBlock =>
  block({
    kind: 'stat',
    cells: [{ metric: 'cash-now', label: 'Cash now', trend: '12w' }] as never,
    metrics: [{ id: 'cash-now', label: 'Cash now', value: 'GBP 33,850.00', note: '', ...(trend ? { trend } : {}) }] as never,
    shown: 1,
    total: 1,
  });
const lineOf = (b: LiveBlock): unknown => b.metrics?.[0]?.trend;

test('A FIGURE`S LINE STARTS AT THE FIRST DAY THE RECORD KEPT, and a gap after it stays a gap', () => {
  /* Twelve weeks asked for and a month kept: the line is the month, the tile's whole width. */
  const month = [null, null, null, 3586000, 3586000, null, 4135000, 3385000];
  assert.deepEqual(lineOf(homeDrawn([cashTile(month)], NOW).blocks[0]!), [3586000, 3586000, null, 4135000, 3385000]);
  /* A line that was whole is the block it was handed. */
  const whole = cashTile([1, 2, null, 4]);
  assert.equal(homeDrawn([whole], NOW).blocks[0], whole);
});

test('FEWER THAN THREE DAYS KEPT IS A NUMBER, NOT A CHART, and a tile with no line is left as it was', () => {
  const two = homeDrawn([cashTile([null, null, 5, 6])], NOW).blocks[0]!;
  assert.equal(two.drawn, true);
  assert.equal('trend' in two.metrics![0]!, false);
  assert.equal(lineOf(homeDrawn([cashTile([null, null])], NOW).blocks[0]!), undefined);
  assert.deepEqual(lineOf(homeDrawn([cashTile([null, 5, 6, 7])], NOW).blocks[0]!), [5, 6, 7]);
  const none = cashTile();
  assert.equal(homeDrawn([none], NOW).blocks[0], none);
});

test('WITH boot’S waits HOME SAYS THE BADGE’S NUMBER: every open question and agent at work, and the calm line only when nothing waits', () => {
  const queue = block({ kind: 'queue', source: 'governance.open', queue: [] });
  const waits = { questions: 25, inbox: 32, working: 0, seqs: [] };
  /* 25 QUESTIONS, NOT THE NONE THE QUEUE DREW: the line says what the rail's badge says. */
  assert.equal(homeDrawn([queue], NOW, undefined, undefined, waits).sentence?.text, '25 need you.');
  /* NO QUESTION BUT 32 ARRIVALS: never "Nothing needs you". */
  assert.equal(homeDrawn([queue], NOW, undefined, undefined, { ...waits, questions: 0 }).sentence?.text, '32 things wait in your inbox.');
  /* NOTHING WAITING: a page's own line stands, as before. */
  const calm = homeDrawn([block({ kind: 'note', lead: true, body: 'Calm.' })], NOW, undefined, undefined, { questions: 0, inbox: 0, working: 0, seqs: [] });
  assert.equal(calm.sentence, null);
  assert.equal(calm.lead, 'Calm.');
});

/* ── a record's week ───────────────────────────────────────────────────── */

/** A shop's week as `weekOf` reads it off its Orders. */
const WEEK: Week = { due: { register: 'orders', name: 'Orders', one: 'Order', day: 'due', who: 'who', what: 'what', open: 'state is not paid', paid: 'paid' } };

test('THIS WEEK STARTS TODAY AND LATE IS ITS OWN CLAUSE: an order due yesterday, today and next week reads two due and one late, said once', () => {
  /* Friday 2 October: yesterday is late, today and next Thursday are this week's. */
  const body = todayHome({ tasks: false, adds: false, money: false, week: WEEK });
  const due = body.blocks.find((b) => b.heading === 'Orders due this week')!;
  /* THE SAME DAYS AS THE SHOP'S OWN FIGURE (`orders-due-7d`, shop 1.1.0): today and the seven after, never a day past. */
  assert.equal(due.where, 'state is not paid, due after -1d, due before +8d');
  const JARS = { row: 'orders#1', title: 'Vanilla jars', day: '2026-10-01' };
  /* What Late holds is the case: the order past its day, a bill beside it, or nothing. */
  const answered = (late: Record<string, unknown>[]): LiveBlock[] => body.blocks.map((b) => {
    const cols = ((b as unknown as { columns?: { field: string }[] }).columns ?? []).map((c) => ({ field: c.field, label: '', width: '' }));
    const base = { ...(b as unknown as Partial<LiveBlock> & { kind: string }), columns: cols };
    /* THE RECORD ANSWERS THE TILE WITH THE TWO NOT YET PAST THEIR DAY, and Late with the one that is, by its list and number. */
    if (b === due) return block({ ...base, register: 'orders' }, [{ who: 'people#1', what: 'Gift box', due: '2026-10-02' }, { who: 'people#2', what: 'Tea lights', due: '2026-10-08' }], [2, 3]);
    if (b.source === 'deadlines' && b.where === 'day before today') return block(base, late);
    return block(base);
  });
  const drawn = homeDrawn(answered([JARS]), NOW, undefined, undefined, null, WEEK);
  assert.deepEqual(drawn.sentence, { text: '1 order is late. 2 more are due this week, the first today.', needs: '1 order is late' });
  assert.doesNotMatch(drawn.sentence!.text, /thing/u, 'the late order is said once, by its own name');
  /* THE TILE HOLDS THE TWO, AND LATE THE ONE: the three are never one count. Late leads the board, the week after it. */
  assert.deepEqual(shown(drawn.blocks).map((b) => [b.heading, b.entries.length]), [['Late', 1], ['Orders due this week', 2]]);
  /* SOMETHING ELSE LATE IS STILL THE HOUSE'S TO SAY, after the orders and without them. */
  const bill = answered([{ row: 'obligations#4', title: 'Rent', day: '2026-09-30' }, JARS]);
  assert.equal(homeDrawn(bill, NOW, undefined, undefined, null, WEEK).sentence?.text, '1 order is late. 2 more are due this week, the first today. 1 thing is late.');
  /* NOTHING LATE: the line is the week's, as it was. */
  assert.deepEqual(homeDrawn(answered([]), NOW, undefined, undefined, null, WEEK).sentence, { text: '2 orders are due this week, the first today.', needs: '' });
});

test('TWELVE LATE ORDERS ARE TWELVE LATE only where Late says it holds orders alone, and what stands past eight orders is never guessed to be orders', () => {
  /* Late answers its eight oldest and says it holds twelve. */
  const orders = (n: number) => Array.from({ length: n }, (_, i) => ({ row: `orders#${i + 1}`, title: `Order ${i + 1}`, day: `2026-09-${String(10 + i).padStart(2, '0')}` }));
  const late = (rows: Record<string, unknown>[], total: number, where = 'list is orders, day before today') => block({ kind: 'spec', source: 'deadlines', where, total }, rows);
  /* A LATE KEPT TO THE WEEK'S LIST BY ITS OWN `where:`: the four past its limit are orders too. */
  const twelve = homeDrawn([late(orders(8), 12)], NOW, undefined, undefined, null, WEEK);
  /* THE WEEK'S LINE SAYS ALL TWELVE, AND THE HOUSE LINE SAYS NONE OF THEM AGAIN as things. */
  assert.deepEqual(twelve.sentence, { text: '12 orders are late.', needs: '12 orders are late' });
  /* LATE OVER EVERY LIST, its oldest eight all orders: the four behind them may be newer bills, so the line says the
     eight orders it can see and the house line counts the four as things (with none of them drawn their oldest day
     cannot be named, so they need you and are not said late again). Never "12 orders are late", and never dropped. */
  const every = homeDrawn([late(orders(8), 12, 'day before today')], NOW, undefined, undefined, null, WEEK);
  assert.deepEqual(every.sentence, { text: '8 orders are late. 4 things are late.', needs: '8 orders are late' });
  /* TWO LISTS IN THE CLAUSE is not the week's list alone, and neither is another list's. */
  for (const where of ['list is orders or obligations, day before today', 'list is obligations, day before today'])
    assert.equal(homeDrawn([late(orders(8), 12, where)], NOW, undefined, undefined, null, WEEK).sentence!.text, '8 orders are late. 4 things are late.', where);
  /* A BILL AMONG THE EIGHT: what stands past them may be bills, so the seven drawn are the orders and the rest are things. */
  const mixed = homeDrawn([late([{ row: 'obligations#4', title: 'Rent', day: '2026-09-01' }, ...orders(7)], 12, 'day before today')], NOW, undefined, undefined, null, WEEK);
  assert.equal(mixed.sentence!.text, '7 orders are late. 5 things are late.');
  assert.doesNotMatch(mixed.sentence!.text, /1[12] orders/u);
  /* WITH NO DAY BOUND OF ITS OWN what stands past the limit may not have fallen due, and is not counted. */
  const ahead = homeDrawn([block({ kind: 'spec', source: 'deadlines', where: 'list is orders', total: 12 }, orders(8))], NOW, undefined, undefined, null, WEEK);
  assert.equal(ahead.sentence?.text, '8 orders are late.');
});

test('PAID AND CAME IN OF ONE AMOUNT ARE TWO MONEYS, said side by side, and are said once only where one entry backs both', () => {
  type Cell = string | { value: string; backs: string[] };
  const tile = (values: Record<string, Cell>): LiveBlock =>
    ({ ...weekMoney(), drawn: true, rows: [], entries: [], matched: [], columns: [], refusals: [], shown: 0, total: 0, stale_at: '', metrics: Object.entries(values).map(([id, v]) => ({ id, label: id, note: '', ...(typeof v === 'string' ? { value: v } : v) })) }) as unknown as LiveBlock;
  const line = (values: Record<string, Cell>) => homeDrawn([tile(values)], NOW, undefined, undefined, null, WEEK).sentence?.text;
  /* AN ORDER MARKED PAID AND AN UNRELATED EGP 900 IN THE BANK'S TEXT ARE 1,800: equal amounts say nothing of one payment. */
  assert.equal(line({ 'settled-in-7d': 'EGP 900.00', 'received-7d': 'EGP 900.00' }), 'EGP 900 came in, and EGP 900 reached your accounts this week.');
  assert.equal(line({ 'settled-in-7d': 'EGP 900.00 · USD 40.00', 'received-7d': 'EGP 900.00 · USD 40.00' }), 'EGP 900 and USD 40 came in, and EGP 900 and USD 40 reached your accounts this week.');
  /* ONE ENTRY BEHIND BOTH FIGURES, as the figures themselves say: the amount is said once, and the tile still names both. */
  const one = { 'settled-in-7d': { value: 'EGP 900.00', backs: ['obligations#4'] }, 'received-7d': { value: 'EGP 900.00', backs: ['obligations#4'] } };
  assert.equal(line(one), 'EGP 900 came in this week.');
  assert.equal(homeDrawn([tile(one)], NOW, undefined, undefined, null, WEEK).blocks[0]!.metrics?.length, 2);
  /* TWO ENTRIES, OR ONE FIGURE THAT NAMES NONE, OR TWO BEHIND ONE FIGURE: still two moneys. */
  const two = 'EGP 900 came in, and EGP 900 reached your accounts this week.';
  assert.equal(line({ 'settled-in-7d': { value: 'EGP 900.00', backs: ['obligations#4'] }, 'received-7d': { value: 'EGP 900.00', backs: ['transactions#9'] } }), two);
  assert.equal(line({ 'settled-in-7d': { value: 'EGP 900.00', backs: ['obligations#4'] }, 'received-7d': 'EGP 900.00' }), two);
  assert.equal(line({ 'settled-in-7d': { value: 'EGP 900.00', backs: ['obligations#4', 'obligations#5'] }, 'received-7d': { value: 'EGP 900.00', backs: ['obligations#4', 'obligations#5'] } }), two);
  assert.equal(line({ 'settled-in-7d': 'EGP 900.00', 'received-7d': 'EGP 150.00' }), 'EGP 900 came in, and EGP 150 reached your accounts this week.');
});

/* ── working means working ─────────────────────────────────────────────── */

/** The table of the runs at work, as a page the record keeps may declare it; Today's own body draws `boot`'s instead. */
const workingNow = () => ({
  kind: 'table',
  heading: 'Working now',
  icon: 'session',
  source: 'sessions.working',
  columns: [
    { field: 'agent', label: 'Agent' },
    { field: 'doing', label: 'Doing' },
    { field: 'last_seen', label: 'Last seen' },
  ],
  limit: 6,
  empty: 'No agent is working.',
});

test('TODAY`S OWN BODY DECLARES NO WORKING TABLE: who is working is drawn once, from boot (today F1)', () => {
  for (const holds of [{ tasks: false, adds: false, money: false }, { tasks: true, adds: false, money: true }])
    assert.deepEqual(todayHome(holds).blocks.filter((x) => x.source?.startsWith('sessions.')), []);
});

test('A RUN QUIET FOR 20 MINUTES IS NOT WORKING NOW, though it is active and was heard from today', async () => {
  const at = Date.parse('2026-10-02T12:00:00Z');
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync: <T>(fn: () => T): T => fn(),
  } as unknown as Parameters<typeof openRecord>[0];
  const k = await openRecord(sql, { now: () => at });
  for (const [doing, minutes] of [['Write the note', 20], ['Fix the invoice export', 5]] as const) {
    const made = k.create('session', { doing, agent: 'claude', state: 'active' }, { actor: 'p_1', stamp: { last_seen: new Date(at - minutes * 60_000).toISOString() } });
    assert.ok(made.ok, JSON.stringify(made));
  }
  const out = k.block(workingNow() as never);
  assert.deepEqual(out.refusals, []);
  assert.deepEqual(out.rows.map((r) => r.fields.doing), ['Fix the invoice export']);
  assert.equal(out.matched, 1);
  /* AND THE RECORD TAKES THE TABLE AS A PAGE'S OWN: nothing in it is refused at install. */
  const installed = (await k.install([{ id: 'page.working', kind: 'page', body: { page: 'working', title: 'Working', layout: DEFAULT_HOME.layout, blocks: [workingNow()] } }] as never)) as { ok: boolean; refusal?: { fix: string } };
  assert.ok(installed.ok, installed.refusal?.fix);
  db.close();
});

test('THE MONEY TILE SAYS WHAT IS STILL TO COME IN, beside what was paid and what came in', () => {
  assert.deepEqual(weekMoney().cells?.map((c) => c.label), ['Came in', 'Into your accounts', 'Still to come in']);
});

/* ── the line Today says while a vital sign reads red ── */

/** Today's two notes on `signs-red`, of which the record draws one at most. */
const signNotes = (holds: Holds = { tasks: true, adds: true, money: true, health: true }) =>
  todayHome(holds).blocks.filter((b) => b.when?.metric === 'signs-red');

/** A record with nothing in it, on the clock the other kernel test here reads. */
async function emptyRecord() {
  const db = new DatabaseSync(':memory:');
  const sql = {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : void db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync: <T>(fn: () => T): T => fn(),
  } as unknown as Parameters<typeof openRecord>[0];
  return { k: await openRecord(sql, { now: () => Date.parse('2026-10-02T12:00:00Z') }), db };
}

test('TODAY SAYS HOW MANY VITAL SIGNS NEED A LOOK, after what needs you, in a person`s grammar', () => {
  const body = todayHome({ tasks: true, adds: true, money: true, health: true });
  const at = body.blocks.flatMap((b, n) => (b.when?.metric === 'signs-red' ? [n] : []));
  assert.equal(at.length, 2, 'one for one sign and one for more, so the count reads as a person says it');
  assert.ok(at[0]! > body.blocks.findIndex((b) => b.kind === 'queue'), 'after the questions');
  /* ON THE BOARD IT IS SAID IN NEEDS YOU'S OWN TILE, under the questions (`signsSaid` in `Home.svelte`), so where the
     two notes sit in the body moves nothing on screen. */
  const [one, many] = signNotes();
  assert.deepEqual([one!.kind, one!.when, one!.body], ['note', { metric: 'signs-red', is: 1 }, '[One vital sign needs a look](/p/health).']);
  assert.deepEqual([many!.kind, many!.when, many!.body], ['note', { metric: 'signs-red', gt: 1 }, '[{{signs-red}} vital signs need a look](/p/health).']);
  /* NEVER THE PAGE'S LINE, and in the main column, never the rail. */
  for (const b of signNotes()) {
    assert.notEqual(b.lead, true);
    assert.equal((b as unknown as { area?: string }).area, undefined);
    assert.ok(!/[—]/.test(b.body ?? ''));
  }
  assert.equal(body.blocks.filter((b) => b.kind === 'note' && b.lead === true).length, 1);
  assert.equal(body.blocks[0]!.body, TODAY_LEAD);
});

test('TODAY CARRIES THE LINE ONLY WHERE THE RECORD HOLDS THE PAGE IT OPENS, and is block for block as it was where it does not', () => {
  for (const holds of [{ tasks: true, adds: true, money: true }, { tasks: false, adds: false, money: false, health: false }]) assert.deepEqual(signNotes(holds), []);
  assert.deepEqual(todayHome({ tasks: true, adds: true, money: true, health: false }), DEFAULT_HOME);
  /* WITH THE PAGE, the two notes are all that is added: take them out and the body is the one it was. */
  const held = todayHome({ tasks: true, adds: true, money: true, health: true });
  assert.deepEqual({ ...held, blocks: held.blocks.filter((b) => b.when?.metric !== 'signs-red') }, DEFAULT_HOME);
  assert.equal(signNotes({ tasks: false, adds: false, money: false, health: true }).length, 2, 'on a record with no tasks too');
});

test('THE RECORD DRAWS THE LINE ONLY WHILE A SIGN READS RED: not on a record nobody has read, and not once every sign is green', async () => {
  const { k, db } = await emptyRecord();
  /* The record marks only a block it left out (`drawn: false`, `why: 'when'`). */
  const drawn = () => signNotes().map((b) => (k.block(b as never) as { drawn?: boolean }).drawn !== false);
  const red = (): number | null => {
    const r = k.metric(k.metricDecl('signs-red')!);
    assert.ok(r.ok, JSON.stringify(r));
    return r.value.value;
  };
  assert.equal(red(), null);
  assert.deepEqual(drawn(), [false, false], 'nothing read yet is not red');
  assert.ok(k.signRead('model-answers', { state: 'green', value: 0, said: 'The model answered every time it was asked.' }).ok);
  assert.equal(red(), 0);
  assert.deepEqual(drawn(), [false, false], 'nought red draws no line');
  assert.ok(k.signRead('model-answers', { state: 'red', value: 3, said: 'The model did not answer 3 times.' }).ok);
  assert.equal(red(), 1);
  assert.deepEqual(drawn(), [true, false]);
  assert.ok(k.signRead('tools-listed', { state: 'red', value: 0, said: 'The tools did not list.' }).ok);
  assert.equal(red(), 2);
  assert.deepEqual(drawn(), [false, true]);
  const many = k.block(signNotes()[1] as never);
  assert.deepEqual(many.refusals, []);
  /* AND THE RECORD TAKES BOTH AS A PAGE'S OWN: the figure, the test and the link are refused by no rule at install. */
  const installed = (await k.install([{ id: 'page.signs', kind: 'page', body: { page: 'signs', title: 'Signs', blocks: signNotes() } }] as never)) as { ok: boolean; refusal?: { fix: string } };
  assert.ok(installed.ok, installed.refusal?.fix);
  db.close();
});

test('HOME DRAWS THE LINE ONCE WHILE A SIGN IS RED AND IS AS IT WAS WHILE NONE IS: never the page`s line, never counted in it', () => {
  /* Today as the record answers it: the lead, a question, the two notes, a late task. */
  const answered = (one: boolean, many: boolean): LiveBlock[] => [
    block({ kind: 'note', lead: true, body: TODAY_LEAD }),
    block({ kind: 'queue', heading: 'What needs you', source: 'governance.open', queue: [{ id: 'q1' }] as never, total: 1 }),
    block({ kind: 'note', body: '[One vital sign needs a look](/p/health).', drawn: one, ...(one ? {} : { why: 'when' }) } as never),
    block({ kind: 'note', body: '[{{signs-red}} vital signs need a look](/p/health).', drawn: many, ...(many ? {} : { why: 'when' }) } as never),
    block({ kind: 'todo', heading: 'Late', source: 'register.tasks', columns: day('by') }, [{ what: 'Renew', by: '2026-09-30' }]),
  ];
  /* Today as it was before the line: the same answer without the two notes. */
  const before = homeDrawn(answered(false, false).filter((b) => !(b.kind === 'note' && b.lead !== true)), NOW);
  const calm = homeDrawn(answered(false, false), NOW);
  assert.deepEqual(shown(calm.blocks), shown(before.blocks), 'with no sign red the body is exactly as it was');
  assert.deepEqual(calm.sentence, before.sentence);
  assert.equal(calm.lead, TODAY_LEAD);
  for (const [one, many, said] of [[true, false, 'One vital sign'], [false, true, '{{signs-red}} vital signs']] as const) {
    const red = homeDrawn(answered(one, many), NOW);
    const notes = shown(red.blocks).filter((b) => b.kind === 'note');
    assert.equal(notes.length, 1, 'drawn once');
    assert.ok(notes[0]!.body?.includes(said) && notes[0]!.body.includes('](/p/health)'));
    assert.deepEqual(shown(red.blocks).map((b) => b.kind), ['queue', 'note', 'todo'], 'after the questions, and nothing else moved');
    assert.equal(red.blocks.length, answered(one, many).length, 'every block keeps its place in the list');
    assert.equal(red.lead, TODAY_LEAD, 'the line is never the page’s');
    assert.deepEqual(red.sentence, before.sentence, 'and the sentence counts what it counted');
  }
});

test('a feed line says a day as "10 Sep", never the record\u2019s ISO date (today F19)', async () => {
  const { dayWords } = await import('./default-home.ts');
  assert.equal(dayWords('Newsletter sending · renews 2026-09-10'), 'Newsletter sending · renews 10 Sep');
  assert.equal(dayWords('at 2026-09-10T08:00:00Z'), 'at 2026-09-10T08:00:00Z', 'an instant is left to its own reader');
  assert.equal(dayWords('nothing dated'), 'nothing dated');
});

test('A LATE BILL IS A ROW OF A LIST THAT OWES ITS AMOUNT ONCE: a repeating charge or a renewal past its day is a late thing, so Today sums what Money sums', async () => {
  const { lateSumsOf } = await import('./default-home.ts');
  const { REGISTERS } = await import('../record/held.ts');
  const decl = (id: string, fields: Record<string, unknown>[]) => ({ id, name: id, one: id, title: 'what', mobile: [], fields }) as never;
  REGISTERS.bills = decl('bills', [{ id: 'amount', type: 'money', required: true }]);
  REGISTERS.repeats = decl('repeats', [{ id: 'amount', type: 'money', required: true, qualifies: 'every' }]);
  REGISTERS.renewals = decl('renewals', [{ id: 'cost', type: 'money' }]);
  const gbp = (amount: number) => ({ amount, currency: 'GBP' });
  const late = block({ kind: 'spec', source: 'deadlines' }, [
    { list: 'bills', row: 'bills#20', day: '2026-07-01', amount: gbp(919000), direction: 'out' },
    { list: 'bills', row: 'bills#1', day: '2026-07-27', amount: gbp(480000), direction: 'in' },
    { list: 'repeats', row: 'repeats#7', day: '2026-08-30', amount: gbp(3900), direction: 'out' },
    { list: 'renewals', row: 'renewals#2', day: '2026-08-30', amount: gbp(1400), direction: 'out' },
    { list: 'bills', row: 'bills#3', day: '2026-09-01', amount: gbp(135000), direction: 'out' },
  ]);
  try {
    const sums = lateSumsOf([late], '2026-09-03');
    assert.equal(sums.bills.get('GBP'), 1054000, '£10,540, as Bills late on Money and "2 late" on the list');
    assert.equal(sums.billCount, 2);
    assert.equal(sums.owed.get('GBP'), 480000);
    assert.equal(sums.things, 2, 'the charge and the renewal are late things');
  } finally {
    for (const id of ['bills', 'repeats', 'renewals']) delete REGISTERS[id];
  }
});

test("A STARTER'S OWN LIST THAT FALLS DUE IS TODAY'S WEEK (AM5), and a list nobody started from is not", () => {
  const assignments: WeekDecl = {
    id: 'assignments',
    name: 'Assignments',
    one: 'assignment',
    title: 'what',
    state: 'state',
    done: ['handed_in', 'marked'],
    pack: 'usecase-student',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['todo', 'handed_in', 'marked'] },
      { id: 'due', type: 'day', deadline: true },
    ],
  } as WeekDecl;
  const week = weekOf([assignments], 'people');
  assert.equal(week?.due.register, 'assignments');
  assert.equal(week?.due.who, null, "an assignment is nobody else's");
  assert.equal(weekOf([{ ...assignments, pack: 'estate' }], 'people'), undefined, "a service that renews is not the week");
  assert.equal(weekOf([(({ pack: _, ...rest }) => rest)(assignments)], 'people', new Set(['assignments']))?.due.register, 'assignments', 'boot names the pack');
});

test('MONEY TOLD BEFORE AN ACCOUNT IS ON TODAY (audit 31 Oct m, AM3): the week\'s money while none is open, and one tile where a week says it', () => {
  const keyed = (holds: Holds) => todayHome(holds).blocks.filter((b) => (b as unknown as { key?: string }).key === 'week-money') as unknown as { when?: unknown; cells?: { metric: string }[] }[];
  const told = keyed({ tasks: true, adds: true, money: true });
  assert.equal(told.length, 1);
  /* AND WHAT HE TOLD AS PAID OUT, its own cell going out, never added to Paid. */
  assert.deepEqual(told[0]!.cells?.map((c) => c.metric), [...(weekMoney().cells ?? []).map((c) => c.metric), 'settled-out-7d']);
  assert.deepEqual(told[0]!.cells?.at(-1), { metric: 'settled-out-7d', label: 'Paid out', sign: 'out' });
  /* ONLY UNTIL THE FIRST ACCOUNT IS OPEN, when Cash ahead says the money, and only on a Money with the week's figures. */
  assert.deepEqual(told[0]!.when, { all: [{ metric: 'settled-in-7d', gte: -Number.MAX_SAFE_INTEGER }, { metric: 'accounts-open', is: 0 }] });
  assert.deepEqual(keyed({ tasks: true, adds: true, money: false }), [], 'no Money, no money tile');
  assert.equal(keyed({ tasks: false, adds: false, money: true, week: WEEK }).length, 1, 'a week says its money once');
});
