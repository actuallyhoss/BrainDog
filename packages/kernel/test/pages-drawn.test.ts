/**
 * WHAT A PAGE DRAWS IS THE RECORD'S TO SAY (PGS-A05 job 1): `readPage` marks each block it leaves out `drawn: false`
 * with `why` (`drawn.ts` `markDrawn`), so an agent reading the page, a shared page and an export draw what the screen
 * does. One case a why, and a box over nothing shut by the one rule, never a second beside it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { defaultBlockKey } from '../src/block-keys.ts';
import { readPage, type BlockResult, type PageBlock, type PageDeps } from '../src/pages.ts';
import type { Entry } from '../src/index.ts';

const NOW = Date.UTC(2026, 9, 9, 7);

const TASKS: Schema = { register: 'tasks', fields: { what: { type: 'text' }, size: { type: 'enum', values: ['s', 'm', 'l'] }, hours: { type: 'int' } } };
const NOTES: Schema = { register: 'notes', fields: { title: { type: 'text' } } };

const row = (seq: number, fields: Entry['fields']): Entry => ({
  id: `t${seq}`,
  register: 'tasks',
  seq,
  fields,
  state: null,
  version: 1,
  created_at: '',
  updated_at: '',
  deleted_at: null,
});

/* Two tasks, neither of them sized: a chart by size reads what no row has said. Notes hold nothing. */
const ROWS: Record<string, Entry[]> = { tasks: [row(1, { what: 'Pay HSBC', size: null, hours: 2 }), row(2, { what: 'Write the brief', size: null, hours: 3 })], notes: [] };

const schemaOf = (r: string): Schema | null => (r === 'tasks' ? TASKS : r === 'notes' ? NOTES : null);

function depsOver(blocks: PageBlock[], more: Partial<PageDeps> = {}): PageDeps {
  return {
    pages: () => [{ page: 'desk', title: 'Desk', blocks }],
    metric: () => null,
    read: () => no('METRIC_UNKNOWN', 'This test reads no figures.'),
    list: (q) => ok({ rows: ROWS[q.register] ?? [], matched: (ROWS[q.register] ?? []).length }),
    schemaOf,
    titleOf: (r) => (r === 'tasks' ? 'what' : 'title'),
    runway: () => null,
    ctx: { nowMs: NOW, schemaOf },
    ...more,
  };
}

const page = (deps: PageDeps): BlockResult[] => {
  const read = readPage(deps, 'desk');
  assert.ok(read.ok, JSON.stringify(read));
  return read.value.blocks;
};
const marks = (blocks: readonly BlockResult[]) => blocks.map((b) => [b.drawn ?? true, b.why ?? null]);

/** A note, whose body the page's own type does not list: it is the note kind's. */
const note = (b: Record<string, unknown>): PageBlock => ({ kind: 'note', ...b }) as PageBlock;

const LEAD: PageBlock = { kind: 'table', source: 'register.tasks', columns: [{ field: 'what' }] };
const NOTHING: PageBlock = { kind: 'table', source: 'register.notes', columns: [{ field: 'title' }], empty: 'No notes yet.' };

test('EMPTY: a block that holds nothing and does not lead is not drawn, and says why', () => {
  assert.deepEqual(marks(page(depsOver([LEAD, NOTHING]))), [
    [true, null],
    [false, 'empty'],
  ]);
});

test('AND THE LEAD KEEPS ITS ONE EMPTY LINE: a page whose first block holds nothing says its sentence once', () => {
  const blocks = page(depsOver([NOTHING, { ...NOTHING, empty: 'Nothing else either.' }]));
  assert.deepEqual(marks(blocks), [
    [true, null],
    [false, 'empty'],
  ]);
  assert.equal(blocks[0]?.empty, 'No notes yet.');
});

test('EMPTY, KEPT: an author who writes empty: keep keeps the nought, as a ledger wants its zeros', () => {
  assert.deepEqual(marks(page(depsOver([LEAD, { ...NOTHING, empty: 'keep' }]))), [
    [true, null],
    [true, null],
  ]);
});

test('UNSAID: a chart made of a field no row has filled in is not drawn wherever it stands', () => {
  const chips: PageBlock = { kind: 'chips', source: 'register.tasks', columns: [{ field: 'size' }] };
  assert.deepEqual(marks(page(depsOver([chips, LEAD]))), [
    [false, 'unsaid'],
    [true, null],
  ]);
});

test('WHEN: a block whose when: says no is not drawn, and is never read', () => {
  const blocks = page(depsOver([LEAD, { ...LEAD, heading: 'Late', when: { metric: 'overdue', gt: 0 } }]));
  assert.deepEqual(marks(blocks), [
    [true, null],
    [false, 'when'],
  ]);
  assert.deepEqual(blocks[1]?.rows, []);
});

test('WHEN, UNDER A HEADING THAT SAYS NO: what the section holds goes with it, each saying when', () => {
  const blocks = page(
    depsOver([LEAD, { kind: 'section', heading: 'Not this week', when: { metric: 'overdue', gt: 0 } }, note({ body: 'Rest.' })]),
  );
  assert.deepEqual(marks(blocks), [
    [true, null],
    [false, 'when'],
    [false, 'when'],
  ]);
});

test('CANNOT: a block the reader cannot draw is left out, and one the record refused still says its sentence', () => {
  /* The record's own blocks never carry `cannot`; a host's hold may, for a kind its reader does not draw. */
  const hold = (b: BlockResult): BlockResult => (b.heading === 'Board' ? ({ ...b, cannot: 'board' } as BlockResult) : b);
  const blocks = page(depsOver([LEAD, { ...LEAD, heading: 'Board' }, { kind: 'table', source: 'register.nowhere' }], { reader: { hold } }));
  assert.deepEqual(marks(blocks), [
    [true, null],
    [false, 'cannot'],
    [true, null],
  ]);
  assert.ok(blocks[2]!.refusals.length > 0, 'refused, and drawn so somebody sees the fix');
});

test('A BOX OVER NOTHING IS SHUT ONCE, by the one rule: empty, and never when; a box holding anything stays', () => {
  const blocks = page(
    depsOver([
      LEAD,
      { kind: 'section', heading: 'Heads up', box: true },
      note({ body: 'Something is late.', when: { metric: 'overdue', gt: 0 } }),
      NOTHING,
      { kind: 'section', heading: 'Open', box: true },
      LEAD,
      NOTHING,
    ]),
  );
  assert.deepEqual(marks(blocks), [
    [true, null],
    [false, 'empty'],
    [false, 'when'],
    [false, 'empty'],
    [true, null],
    [true, null],
    [false, 'empty'],
  ]);
  assert.equal(blocks.filter((b) => b.kind === 'section' && b.drawn === false).length, 1, 'one box shut, once');
});

test('A BOX IN THE MAIN COLUMN IS NOT HELD OPEN BY A BLOCK IN THE RAIL', () => {
  const blocks = page(
    depsOver([LEAD, { kind: 'section', heading: 'Heads up', box: true }, note({ area: 'rail', body: 'Always here.' }), NOTHING]),
  );
  assert.deepEqual(marks(blocks), [
    [true, null],
    [false, 'empty'],
    [true, null],
    [false, 'empty'],
  ]);
});

test('WHAT THE OWNER PINNED IS NEVER LEFT OUT FOR HOLDING NOTHING, and the answer keeps its own empty: line', () => {
  const pinned = defaultBlockKey(NOTHING);
  const look: PageDeps['look'] = (p) => (p === 'desk' ? { look: 'desk', basis: 'mine', by: 'owner', pinned: [pinned] } : null);
  const blocks = page(depsOver([LEAD, { kind: 'section', heading: 'Notes', box: true }, NOTHING], { look }));
  assert.deepEqual(marks(blocks), [
    [true, null],
    [true, null],
    [true, null],
  ]);
  assert.equal(blocks[2]?.empty, 'No notes yet.');
  assert.deepEqual(marks(page(depsOver([LEAD, { kind: 'section', heading: 'Notes', box: true }, NOTHING]))).slice(1), [
    [false, 'empty'],
    [false, 'empty'],
  ], 'unpinned, the same box is shut');
});
