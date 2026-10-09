/**
 * Whether each block of a page is drawn, for every reader (`src/drawn.ts`, DIRECTION §35 and §37, PGS-A05).
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

/* A BLOCK DRAWN FROM ITS OWN WRITTEN-OUT CELLS holds them (rule-sheet-pack, batch 40): Layout's three-wide ring of
   `authored: [{ cells: ['Done', '3', '5'] }]` read no row and was answered empty, so it never showed. */
test('A BLOCK WRITTEN OUT IN THE PAGE HOLDS WHAT ITS AUTHOR WROTE, and one with no cells written is still empty', () => {
  const written = { ...block({ kind: 'ring' }), authored: [{ cells: ['Done', '3', '5'] }] } as BlockResult;
  const bareRing = { ...block({ kind: 'ring' }), authored: [] } as BlockResult;
  const lead = { ...block({ kind: 'note' }), body: 'Lead' } as BlockResult;
  assert.deepEqual(whys(markDrawn([lead, written, bareRing])), ['drawn', 'drawn', 'empty']);
});
