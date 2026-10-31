/**
 * Whether each block of a page is drawn, for every reader (`src/drawn.ts`).
 *
 * THE BLOCKS ARE THE RECORD'S OWN SHAPE (`BlockResult`), so a change to that type that the rule can no longer read is a
 * compile error here rather than a page that quietly draws everything again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { arranged, bare, emptyHidden, leadOf, markDrawn, unsaid, type Why } from '../src/drawn.ts';
import type { BlockResult, PageRow } from '../src/pages.ts';

type Readings = NonNullable<BlockResult['readings']>;

const block = (over: Partial<BlockResult> & { kind: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...over });

const row = (fields: PageRow['fields']): PageRow => ({
  id: 'r',
  register: 'projects',
  seq: 1,
  fields,
  state: null,
  version: 1,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
});

/** `why` is read off the block as `pages.ts` will type it once it calls `markDrawn` (blocked to batch 39). */
const whyOf = (b: object): Why | undefined => (b as { why?: Why }).why;
const whys = (blocks: readonly BlockResult[]): (Why | 'drawn' | 'no why')[] => blocks.map((b) => (b.drawn === false ? (whyOf(b) ?? 'no why') : 'drawn'));

test('EACH WHY: a list of nothing is empty, a chart of a field nobody filled is unsaid, a when that said no is when', () => {
  const blocks = [
    block({ kind: 'table', source: 'register.tasks', rows: [row({ title: 'Ship it' })], matched: 1 }),
    block({ kind: 'todo', source: 'register.tasks', empty: 'Nothing due today.' }),
    block({ kind: 'chips', source: 'register.projects', columns: [{ field: 'health' }], rows: [row({ health: null }), row({ health: '' })], matched: 2 }),
    block({ kind: 'note', heading: 'Heads up', drawn: false }),
  ];
  assert.deepEqual(whys(markDrawn(blocks)), ['drawn', 'empty', 'unsaid', 'when']);
});

test('CANNOT: a block the reader cannot draw goes, and one the record refused stays to say its fix', () => {
  const cannot = { ...block({ kind: 'table' }), cannot: 'This part of the page cannot be drawn from the record yet.' };
  const refused = block({ kind: 'table', refusals: [{ code: 'DECLARATION_INVALID', fix: 'Name a list.' }] });
  const out = emptyHidden([block({ kind: 'table', rows: [row({ title: 'a' })], matched: 1 }), cannot, refused]);
  assert.deepEqual(out.map((b) => whyOf(b) ?? 'drawn'), ['drawn', 'cannot', 'drawn']);
});

test('THE LEAD KEEPS ITS ONE EMPTY LINE, and the empty blocks after it say nothing', () => {
  const blocks = [
    block({ kind: 'section', heading: 'Today' }),
    block({ kind: 'todo', empty: 'Nothing due today.' }),
    block({ kind: 'timeline', empty: 'Nothing of yours is late.' }),
    block({ kind: 'table', rows: [row({ title: 'a' })], matched: 1 }),
  ];
  assert.equal(leadOf(blocks), 1);
  assert.deepEqual(whys(markDrawn(blocks)), ['drawn', 'drawn', 'empty', 'drawn']);
  /* A LEAD THAT HOLDS SOMETHING leaves no empty line on the page at all. */
  const held = [blocks[3]!, blocks[1]!];
  assert.deepEqual(whys(markDrawn(held)), ['drawn', 'empty']);
});

test('EMPTY: KEEP keeps a block that holds nothing, and its noughts', () => {
  const idle = { metric: 'costs-year', reading: { value: 0, unit: 'GBP', rows: 0, held: 0, refusals: [], met: null } };
  const ledger = block({ kind: 'stat', cells: [{ metric: 'costs-year' }], readings: [idle] as unknown as Readings, empty: 'keep' });
  assert.equal(bare(ledger), false);
  const [kept] = markDrawn([block({ kind: 'table', rows: [row({ a: 1 })], matched: 1 }), ledger]).slice(1);
  assert.equal(kept!.drawn, undefined);
  assert.equal(kept!.readings?.length, 1, 'its nought is still there');
  /* WITHOUT THE KEY, the same figure is taken from its row, and the row that held nothing else goes. */
  const plain = { ...ledger, empty: 'Nothing costs a year yet.' };
  const out = markDrawn([block({ kind: 'table', rows: [row({ a: 1 })], matched: 1 }), plain]);
  assert.equal(whyOf(out[1]!), 'empty');
});

test('A FIGURE THAT SAYS NOTHING GOES FROM ITS ROW, and the figure beside it stays', () => {
  const read = (metric: string, held: number, value: number) => ({ metric, reading: { value, unit: null, rows: held, held, refusals: [], met: null } });
  const stat = block({ kind: 'stat', cells: [{ metric: 'a' }, { metric: 'b' }], readings: [read('a', 0, 0), read('b', 3, 3)] as unknown as Readings });
  const [out] = markDrawn([stat]);
  assert.deepEqual(out!.readings?.map((r) => r.metric), ['b']);
});

test("A FIGURE'S PARTS that no row sits in are unsaid; a figure that read no row at all holds nothing", () => {
  const parts = (value: number, groups: unknown[]) =>
    block({ kind: 'split', source: 'metric.earning-by-project', readings: [{ metric: 'earning-by-project', reading: { value, unit: null, rows: 4, refusals: [], met: null, groups } }] as unknown as unknown as Readings });
  assert.equal(unsaid(parts(0, [{ key: 'a', value: null }, { key: 'b', value: null }])), true);
  assert.equal(unsaid(parts(5, [])), true);
  assert.equal(unsaid(parts(5, [{ key: 'a', value: 5 }])), false);
  assert.equal(bare(parts(0, [])), true);
});

test('A KPIS BLOCK HOLDS ITS KEY NUMBERS, not rows: one with numbers and no rows stands, one with none goes', () => {
  const kpis = (numbers: unknown[]) => block({ kind: 'kpis', source: 'kpis', kpis: numbers, matched: [] } as never);
  assert.equal(bare(kpis([{ name: 'Sales a month', points: [] }])), false);
  assert.equal(bare(kpis([])), true);
});

test('A SECTION OVER NOTHING GOES WITH ITS BLOCKS, in its own column; one with a panel, or over nothing at all, stays', () => {
  const blocks = [
    block({ kind: 'section', heading: 'Heads up', box: true }),
    block({ kind: 'note', heading: 'Rail note', area: 'rail' }),
    block({ kind: 'todo', drawn: false }),
    block({ kind: 'section', heading: 'Actions', panel: 'actions' }),
    block({ kind: 'todo' }),
    block({ kind: 'table', rows: [row({ a: 1 })], matched: 1 }),
    block({ kind: 'section', heading: 'The end' }),
  ];
  assert.deepEqual(whys(markDrawn(blocks)), ['empty', 'drawn', 'when', 'drawn', 'empty', 'drawn', 'drawn']);
});

test('A PAGE AT ITS OWN ADDRESS IS NEVER EMPTIED: it keeps the first block, which says its one sentence', () => {
  const blocks = [block({ kind: 'section', heading: 'Tasks' }), block({ kind: 'table', empty: 'Nothing in Tasks yet.' }), block({ kind: 'todo' })];
  assert.deepEqual(whys(markDrawn(blocks, true)), ['drawn', 'drawn', 'empty']);
  assert.deepEqual(whys(emptyHidden([blocks[2]!], true)), ['drawn']);
  assert.deepEqual(whys(emptyHidden([blocks[2]!], false)), ['empty']);
});

test('A REGISTERED KIND, A SENTENCE AND A FIELD TO TYPE INTO are never called empty', () => {
  const out = markDrawn([block({ kind: 'calendar' }), block({ kind: 'note' }), block({ kind: 'capture' }), block({ kind: 'table', rows: [row({ a: 1 })], matched: 1 })]);
  assert.deepEqual(whys(out), ['drawn', 'drawn', 'drawn', 'drawn']);
});

test('ARRANGING STILL DRAWS EVERY BLOCK, but one whose when said no', () => {
  const marked = markDrawn([
    block({ kind: 'table', rows: [row({ a: 1 })], matched: 1 }),
    block({ kind: 'todo' }),
    block({ kind: 'chips', columns: [{ field: 'h' }], rows: [row({ h: null })], matched: 1 }),
    block({ kind: 'note', drawn: false }),
  ]);
  const laid = arranged(marked);
  assert.deepEqual(laid.map((b) => b.drawn !== false), [true, true, true, false]);
  assert.equal(whyOf(laid[1]!), undefined);
  /* AND THE RECORD'S FLAG IS READ AS IT CAME: judging the marked answer again changes nothing. */
  assert.deepEqual(whys(emptyHidden(marked, true)), whys(marked));
});

/* THE PROJECT PAGE'S OWN BLOCKS (`packages/seed/src/modules/portfolio.ts`): "Where it stands" is cards titled by the
   health, and "Keeping it alive" and the keys, tools and skills a project runs on are cards titled by the name. A card
   holds the row it read, so `holdsNothing` kept each one, and a row with nothing said in it drew a heading over a dash. */
const STANDS = [
  { field: 'health', as: 'title' },
  { field: 'progress', label: '', as: 'ring' },
  { field: 'aim', label: 'Aiming for', as: 'fact' },
  { field: 'agent', label: 'Agent', as: 'who' },
];
const cards = (rows: PageRow[], over: Partial<BlockResult> = {}): BlockResult =>
  block({ kind: 'cards', heading: 'Where it stands', source: 'register.things', columns: STANDS, rows, matched: rows.length, ...over });

test('CARDS WHOSE EVERY CARD SAYS NOTHING are unsaid: no value in any column the block draws, on any row', () => {
  const dash = cards([row({ name: 'Pinwheel', health: null, progress: null, aim: '', agent: null })]);
  assert.equal(unsaid(dash), true);
  /* A FIELD THE ROW NEVER HELD reads as one nobody filled in, and so do two such rows. */
  assert.equal(unsaid(cards([row({ name: 'Pinwheel' }), row({ name: 'Other', aim: '' })])), true);
  const lead = block({ kind: 'table', rows: [row({ title: 'a' })], matched: 1 });
  assert.deepEqual(whys(markDrawn([lead, dash])), ['drawn', 'unsaid']);
  /* ITS HEADING GOES WITH IT, as a section over nothing does. */
  assert.deepEqual(whys(markDrawn([lead, block({ kind: 'section', heading: 'More about it' }), dash])), ['drawn', 'empty', 'unsaid']);
});

test('A CARD WITH ANYTHING SAID IS DRAWN, and every card beside it: a name, a nought, or one fact on one row', () => {
  assert.equal(unsaid(cards([row({ health: 'at_risk' })])), false);
  assert.equal(unsaid(cards([row({ progress: 0 })])), false, 'nought is a value');
  assert.equal(unsaid(cards([row({ health: null }), row({ aim: '2026-12-01' })])), false, 'one card said is the block said');
  /* A CARD WITH A NAME IS NEVER LEFT OUT: a service imported with no cost is still what the project runs on. */
  const alive = cards([row({ name: 'pinwheel.example', cost: null, cycle: null, note: '', renews: null })], {
    heading: 'Services',
    columns: [{ field: 'name', as: 'title' }, { field: 'cost', as: 'figure' }, { field: 'cycle', as: 'fact' }, { field: 'note', as: 'fact' }, { field: 'renews', as: 'when' }],
  });
  assert.equal(unsaid(alive), false);
});

test('CARDS NOT THIS RULE\'S TO JUDGE: a kept nought, a refusal, no row, no named column, and a column off the row itself', () => {
  const nothing = row({ health: null });
  assert.equal(unsaid(cards([nothing], { empty: 'keep' })), false);
  assert.equal(unsaid(cards([nothing], { refusals: [{ code: 'DECLARATION_INVALID', fix: 'Name a list.' }] })), false);
  /* NO ROW is a block that holds nothing, which keeps its empty line where it leads the page. */
  assert.equal(unsaid(cards([])), false);
  assert.equal(bare(cards([])), true);
  assert.equal(unsaid(cards([nothing], { columns: [] })), false);
  /* A COLUMN THAT ONLY COLOURS OR DIMS A CARD draws nothing, so it is not what a card says. */
  assert.equal(unsaid(cards([row({ tint: 210, old: 'yes' })], { columns: [{ field: 'health', as: 'title' }, { field: 'tint', as: 'hue' }, { field: 'old', as: 'quiet' }] })), true);
  /* THE DAY THE RECORD STAMPED A ROW is on the row and not in its fields, and every row has one. */
  assert.equal(unsaid(cards([nothing], { columns: [{ field: 'health', as: 'title' }, { field: 'updated_at', as: 'when' }] })), false);
});

test('A LIST DRAWS ITS NAMES WHATEVER ELSE IS EMPTY, so a table or a to-do of empty cells is never unsaid', () => {
  const empty = [row({ title: null, due: null })];
  for (const kind of ['table', 'todo', 'list']) assert.equal(unsaid(block({ kind, columns: [{ field: 'title' }, { field: 'due' }], rows: empty, matched: 1 })), false, kind);
});

/* A BLOCK DRAWN FROM ITS OWN WRITTEN-OUT CELLS holds them (rule-sheet-pack, batch 40): Layout's three-wide ring of
   `authored: [{ cells: ['Done', '3', '5'] }]` read no row and was answered empty, so it never showed. */
test('A BLOCK WRITTEN OUT IN THE PAGE HOLDS WHAT ITS AUTHOR WROTE, and one with no cells written is still empty', () => {
  const written = { ...block({ kind: 'ring' }), authored: [{ cells: ['Done', '3', '5'] }] } as BlockResult;
  const bareRing = { ...block({ kind: 'ring' }), authored: [] } as BlockResult;
  const lead = { ...block({ kind: 'note' }), body: 'Lead' } as BlockResult;
  assert.deepEqual(whys(markDrawn([lead, written, bareRing])), ['drawn', 'drawn', 'empty']);
});

/* THE PINWHEEL SHAPE: the project page of an imported project nobody has described. "Where it
   stands" is two blocks under one heading, each behind a `when:` (`packages/seed/src/modules/portfolio.ts`): the cards
   while one of the four fields is said, the figures while none is. Under them, the boxed section "More about
   Pinwheel" names the host's `actions` panel over what the project runs on. */
const pinwheel = (over: { said?: boolean; panel?: string; box?: boolean; note?: boolean; actions?: unknown[] } = {}): BlockResult[] => {
  const said = over.said ?? false;
  const fields = said ? { name: 'Pinwheel', health: 'at_risk' } : { name: 'Pinwheel', health: null, progress: null, aim: null, agent: null };
  const more = { ...block({ kind: 'section', heading: 'More about Pinwheel', box: over.box ?? true, panel: over.panel ?? 'actions' }), ...(over.actions ? { actions: over.actions } : {}) };
  return [
    block({ kind: 'table', heading: 'The plan', rows: [row({ title: 'Ship it' })], matched: 1 }),
    cards([row(fields)], { area: 'rail', drawn: said }),
    { ...block({ kind: 'stat', heading: 'Where it stands', area: 'rail', drawn: !said }), readings: [{ label: 'Worked on this week', reading: { value: 2, held: 3 } }] } as unknown as BlockResult,
    more as BlockResult,
    block({ kind: 'feed', heading: 'What changed' }),
    ...(over.note ? [block({ kind: 'note', heading: 'Notes', empty: 'Nothing is written about Pinwheel yet.' })] : []),
    cards([], { heading: 'Keys', columns: [{ field: 'name', as: 'title' }] }),
    cards([], { heading: 'Tools and servers', columns: [{ field: 'name', as: 'title' }] }),
  ];
};

test('WHERE IT STANDS ON PINWHEEL IS OUT BY ITS WHEN, never by the cards rule, and its figures are drawn in its place', () => {
  const page = markDrawn(pinwheel());
  assert.deepEqual(whys(page).slice(0, 3), ['drawn', 'when', 'drawn']);
  /* THE CARDS RULE WOULD HAVE CALLED IT UNSAID, and is never asked: the block's own gate reads the same four fields. */
  assert.equal(unsaid({ ...pinwheel()[1]!, drawn: true }), true);
  /* ONCE ONE OF THE FOUR IS SAID the gate opens, the card says it, and the rule answers no. */
  const told = markDrawn(pinwheel({ said: true }));
  assert.deepEqual(whys(told).slice(0, 3), ['drawn', 'drawn', 'when']);
  assert.equal(unsaid(pinwheel({ said: true })[1]!), false);
});

/* What the record hands the section once it has counted the project's scheduled actions and found none. */
const COUNTED_NONE = { actions: [] };

test('A BOXED ACTIONS SECTION IS SHUT WHEN THE RECORD SEES NO SCHEDULED ACTION and every block under it is gone', () => {
  assert.deepEqual(whys(markDrawn(pinwheel(COUNTED_NONE))).slice(3), ['empty', 'empty', 'empty', 'empty']);
  /* ONE BLOCK UNDER IT DRAWN KEEPS IT: a sentence is never called empty, so the seed's Notes holds the tile open. */
  assert.deepEqual(whys(markDrawn(pinwheel({ ...COUNTED_NONE, note: true }))).slice(3), ['drawn', 'empty', 'drawn', 'empty', 'empty']);
  /* THE OTHER PANELS ALWAYS HOLD SOMETHING, and a heading with no box is not a tile: each stays, as before. */
  assert.equal(whys(markDrawn(pinwheel({ ...COUNTED_NONE, panel: 'reporting' })))[3], 'drawn');
  assert.equal(whys(markDrawn(pinwheel({ ...COUNTED_NONE, panel: 'run' })))[3], 'drawn');
  assert.equal(whys(markDrawn(pinwheel({ ...COUNTED_NONE, box: false })))[3], 'drawn');
  /* WITH NO BLOCK AFTER IT AT ALL it is the author's own divider, and stays. */
  assert.equal(whys(markDrawn(pinwheel(COUNTED_NONE).slice(0, 4)))[3], 'drawn');
  /* AND ARRANGING DRAWS IT AGAIN, with every block under it. */
  assert.deepEqual(whys(arranged(markDrawn(pinwheel(COUNTED_NONE)))).slice(3), ['drawn', 'drawn', 'drawn', 'drawn']);
});

test('A BOXED ACTIONS SECTION IS KEPT BY DEFAULT: a project with one scheduled action and no other block keeps its heading', () => {
  /* NOBODY COUNTED: no host hands the section its actions, so the record cannot say the panel is
     empty, and the heading the host draws "Nightly import" under stays though every block under it went. */
  const uncounted = markDrawn(pinwheel());
  assert.deepEqual(whys(uncounted).slice(3), ['drawn', 'empty', 'empty', 'empty']);
  assert.equal(whyOf(uncounted[3]!), undefined);
  /* COUNTED, AND ONE IS THERE: the same, said rather than assumed. */
  assert.deepEqual(whys(markDrawn(pinwheel({ actions: [{ name: 'Nightly import' }] }))).slice(3), ['drawn', 'empty', 'empty', 'empty']);
  /* WHAT IS HANDED AND IS NO LIST IS NOT A COUNT OF NONE, so it shuts nothing. */
  const odd = pinwheel().map((b, n) => (n === 3 ? ({ ...b, actions: null } as unknown as BlockResult) : b));
  assert.equal(whys(markDrawn(odd))[3], 'drawn');
});

test('A SERIES OF GAPS HOLDS NOTHING, a spec with no value on any row is unsaid', () => {
  const lead = block({ kind: 'table', rows: [row({ title: 'a' })], matched: 1 });
  const bars = (values: (number | null)[][]) => ({ bucket: 'month', current: '2026-10', keys: values[0]!.map((_, i) => `k${i}`), states: [], values, unit: null });
  const gaps = block({ kind: 'series', bars: bars([[], []]) } as never);
  const some = block({ kind: 'series', bars: bars([[null, 4], [null, null]]) } as never);
  assert.deepEqual(whys(markDrawn([lead, gaps, some])), ['drawn', 'empty', 'drawn']);
  const spec = (fields: PageRow['fields']) => block({ kind: 'spec', source: 'register.services', columns: [{ field: 'name' }, { field: 'cost' }], rows: [row(fields)], matched: 1 } as never);
  assert.equal(unsaid(spec({ name: 'Kiln host' })), true);
  assert.equal(unsaid(spec({ name: 'Kiln host', cost: '12' })), false);
});
