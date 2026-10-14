/**
 * How a look groups a long list (`compose.ts`, `group`): the third thing a look may do after the order and the hide.
 *
 * A LOOK'S `group` IS A MAP FROM A BLOCK'S KEY TO A FIELD OF ITS LIST. The rules set it for a list that shows more than
 * twelve of its things and holds two to eight states among them, a stored look may name another field, and `applyLook`
 * lays it only on a block whose kind draws groups and that names none of its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyedBlocks, kindsReading } from '../src/block-keys.ts';
import { applyLook, composeLook, lookOf, mergeLook, GROUPED_BY_FIELD, LOOK_GROUPS_MOST, LOOK_KEYS, type ComposeInput, type LookBody } from '../src/compose.ts';
import type { BlockResult, ListShape, PageRow } from '../src/pages.ts';

const AT = '2026-10-01T09:00:00.000Z';

const row = (seq: number, fields: Record<string, unknown>): PageRow => ({
  id: `01KTASKS${seq}`,
  register: 'tasks',
  seq,
  fields: fields as PageRow['fields'],
  state: typeof fields.stage === 'string' ? fields.stage : null,
  version: 1,
  created_at: AT,
  updated_at: AT,
  deleted_at: null,
});

/** `n` things whose stage walks round `stages`, so the first `stages.length` of them hold every one. */
const rows = (n: number, stages: readonly string[]): PageRow[] => Array.from({ length: n }, (_, i) => row(i + 1, { what: `Thing ${i + 1}`, stage: stages[i % stages.length]!, kind: i % 2 ? 'bill' : 'licence' }));

const block = (b: Partial<BlockResult> & { kind: string }): BlockResult => ({ rows: [], matched: b.rows?.length ?? 0, refusals: [], ...b }) as BlockResult;
const keyed = (...blocks: BlockResult[]): BlockResult[] => keyedBlocks(blocks);

const TASKS: ListShape = {
  id: 'tasks',
  done: ['done'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'stage', type: 'enum' },
    { id: 'kind', type: 'enum' },
  ],
};

const input = (blocks: BlockResult[], more: Partial<ComposeInput> = {}): ComposeInput => ({
  page: 'desk',
  blocks,
  today: '2026-10-06',
  seen: null,
  lists: [TASKS],
  stateOf: (list) => (list === 'tasks' ? 'stage' : null),
  ...more,
});

const cards = (n: number, stages: readonly string[], more: Partial<BlockResult> = {}): BlockResult => block({ kind: 'cards', source: 'register.tasks', key: 'all', heading: 'Everything', rows: rows(n, stages), ...more });
const STAGES = ['open', 'doing', 'done'];
const NINE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

/* ── what a look may hold ────────────────────────────────────────────────── */

test('A LOOK MAY HOLD group, a map from a part of the page to a field of its list', () => {
  assert.ok(LOOK_KEYS.has('group'));
  const look = lookOf({ look: 'desk', basis: 'x', by: 'slash', group: { all: 'stage', bills: 'kind' } });
  assert.deepEqual(look?.group, { all: 'stage', bills: 'kind' });
  assert.equal(lookOf({ look: 'desk', basis: 'x', by: 'slash' })?.group, undefined);
  assert.equal(lookOf({ look: 'desk', basis: 'x', by: 'slash', group: {} })?.group, undefined, 'a map of nothing groups nothing');
});

test('A MAP THAT IS NOT TEXT TO TEXT, OR HOLDS MORE THAN TWELVE, IS NOT READ, and the rest of the look is', () => {
  const read = (group: unknown): LookBody | null => lookOf({ look: 'desk', basis: 'x', by: 'slash', lead: 'all', group });
  for (const bad of [['all', 'stage'], 'stage', 7, null, { all: 7 }, { all: ['stage'] }, { all: 'Not A Field' }, { 'Not A Key': 'stage' }, { all: '' }]) {
    const look = read(bad);
    assert.equal(look?.group, undefined, JSON.stringify(bad));
    assert.equal(look?.lead, 'all', 'a page never fails to draw over its look');
  }
  const many = (n: number): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`part-${i}`, 'stage']));
  assert.equal(LOOK_GROUPS_MOST, 12);
  assert.equal(Object.keys(read(many(12))?.group ?? {}).length, 12);
  assert.equal(read(many(13))?.group, undefined);
  /* `__proto__` WRITTEN AS A KEY is no part of a page, and sets nothing the map inherits from. */
  assert.equal(read(JSON.parse('{"__proto__":"stage"}'))?.group, undefined);
});

/* ── the rules ───────────────────────────────────────────────────────────── */

test('THE RULES GROUP A LIST THAT SHOWS MORE THAN TWELVE BY ITS STATE, when two to eight states are among them', () => {
  /* EVERY KIND A LOOK MAY GROUP IS ONE THAT READS THE KEY, and a feed, whose `group` is a word and no field, is not among them. */
  for (const kind of GROUPED_BY_FIELD) assert.ok(kindsReading('group')?.includes(kind), kind);
  assert.equal(GROUPED_BY_FIELD.has('feed'), false);
  assert.deepEqual(composeLook(input(keyed(cards(13, STAGES)))).group, { all: 'stage' });
  assert.deepEqual(composeLook(input(keyed(cards(35, ['open', 'done'])))).group, { all: 'stage' }, 'two states');
  assert.deepEqual(composeLook(input(keyed(cards(35, NINE.slice(0, 8))))).group, { all: 'stage' }, 'eight states');
});

test('AND SET NOTHING for twelve or fewer, one state, nine, or a list with no state', () => {
  const none = (b: BlockResult, more: Partial<ComposeInput> = {}): void => assert.equal(composeLook(input(keyed(b), more)).group, undefined);
  none(cards(12, STAGES));
  none(cards(3, STAGES));
  none(cards(35, ['open']));
  none(cards(35, NINE));
  none(cards(35, STAGES), { stateOf: () => null });
  none(cards(35, STAGES), { stateOf: undefined as never });
  /* A STATE THE LIST RETIRED, or one it does not declare, is no field to group by. */
  none(cards(35, STAGES), { lists: [{ ...TASKS, fields: TASKS.fields.map((f) => (f.id === 'stage' ? { ...f, retired: true } : f)) }] });
  none(cards(35, STAGES), { lists: [{ ...TASKS, fields: TASKS.fields.filter((f) => f.id !== 'stage') }] });
  /* THINGS THAT HOLD NO STATE are not a state of their own: 20 with none and 15 open is one state. */
  none(block({ kind: 'cards', source: 'register.tasks', key: 'all', rows: [...rows(15, ['open']), ...Array.from({ length: 20 }, (_, i) => row(100 + i, { what: 'Bare' }))] }));
});

test('ONLY A PART THAT DRAWS GROUPS AND NAMES NONE OF ITS OWN: lanes, a refused part and one not drawn are left', () => {
  const none = (b: BlockResult): void => assert.equal(composeLook(input(keyed(b))).group, undefined);
  none(block({ kind: 'lanes', source: 'register.tasks', key: 'all', rows: rows(35, STAGES) }));
  none(cards(35, STAGES, { group: 'project' }));
  none(cards(35, STAGES, { refusals: [{ code: 'FIELD_UNKNOWN', fix: 'x' }] as never }));
  none(cards(35, STAGES, { drawn: false }));
  none(cards(35, STAGES, { source: 'deadlines' }));
});

test('A PAGE WITH NOTHING TO GROUP KEEPS THE BASIS IT HAD, and one that groups says so in its basis', () => {
  const few = keyed(cards(12, STAGES));
  const many = keyed(cards(13, STAGES));
  const plain = composeLook(input(few, { stateOf: () => null }));
  assert.equal(composeLook(input(few)).basis, plain.basis);
  assert.notEqual(composeLook(input(many)).basis, composeLook(input(many, { stateOf: () => null })).basis);
});

/* ── laying it ───────────────────────────────────────────────────────────── */

const look = (group: Record<string, string>, by: LookBody['by'] = 'slash'): LookBody => ({ look: 'desk', basis: 'x', by, group });

test('applyLook SETS group ON A PART WHOSE KIND READS IT, and answers what it laid', () => {
  const blocks = keyed(block({ kind: 'note', lead: true, key: 'top' }), cards(20, STAGES));
  const out = applyLook(blocks, look({ all: 'kind' }));
  assert.equal(out.blocks.find((b) => b.key === 'all')!.group, 'kind');
  assert.deepEqual(out.look.group, { all: 'kind' });
  assert.equal(blocks.find((b) => b.key === 'all')!.group, undefined, 'the page as read is not written on');
  assert.equal(applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash' }).look.group, undefined);
  /* THE RULES' OWN LOOK, laid. */
  const ruled = applyLook(blocks, composeLook(input(blocks)));
  assert.equal(ruled.blocks.find((b) => b.key === 'all')!.group, 'stage');
  assert.deepEqual(ruled.look.group, { all: 'stage' });
});

test('AND LEAVES UNTOUCHED lanes, a part that names its own group, and a key the page does not have', () => {
  const blocks = keyed(
    block({ kind: 'lanes', source: 'register.tasks', key: 'table', rows: rows(20, STAGES) }),
    cards(20, STAGES, { key: 'own', group: 'project' }),
    cards(20, STAGES, { key: 'all' }),
  );
  const out = applyLook(blocks, look({ table: 'stage', own: 'stage', ghost: 'stage', all: 'stage' }));
  assert.equal(out.blocks.find((b) => b.key === 'table')!.group, undefined);
  assert.equal(out.blocks.find((b) => b.key === 'own')!.group, 'project', 'what the page says of itself stands');
  assert.deepEqual(out.look.group, { all: 'stage' });
  assert.equal(out.blocks.length, blocks.length, 'nothing is added and nothing taken out');
});

test('A GROUP THE THINGS SHOWN NO LONGER BEAR IS NOT LAID: one value, more than eight, or a field none of them holds', () => {
  const laid = (b: BlockResult, field: string): string | undefined => applyLook(keyed(b), look({ all: field })).blocks[0]!.group;
  assert.equal(laid(cards(20, ['open']), 'stage'), undefined, 'a stored look read later, when all but one state has gone');
  assert.equal(laid(cards(20, NINE), 'stage'), undefined);
  assert.equal(laid(cards(20, STAGES), 'colour'), undefined);
  assert.equal(laid(cards(20, STAGES, { source: 'deadlines' }), 'stage'), undefined, 'only a list has fields');
  assert.equal(laid(cards(20, STAGES, { refusals: [{ code: 'FIELD_UNKNOWN', fix: 'x' }] as never }), 'stage'), undefined);
  /* THE PERSON'S OWN LOOK IS HELD TO THE SAME: a heading over every thing is no grouping, whoever asked. */
  assert.equal(applyLook(keyed(cards(20, ['open'])), look({ all: 'stage' }, 'owner')).blocks[0]!.group, undefined);
  /* FEWER THAN THIRTEEN IS THE RULES' OWN LINE, not the look's: a person may group a short list. */
  assert.equal(laid(cards(4, ['open', 'done']), 'stage'), 'stage');
});

test("THE OWNER'S LOOK OUTRANKS THE ENGINE'S, a part at a time", () => {
  const owner: LookBody = { look: 'desk', basis: 'o', by: 'owner', group: { all: 'kind' } };
  const engine: LookBody = { look: 'desk', basis: 'r', by: 'rule', group: { all: 'stage', bills: 'stage' } };
  const merged = mergeLook(owner, engine);
  assert.deepEqual(merged.group, { all: 'kind', bills: 'stage' });
  assert.equal(merged.by, 'owner');
  assert.deepEqual(mergeLook({ look: 'desk', basis: 'o', by: 'owner' }, engine).group, engine.group, 'what he left unset is the engine’s');
  assert.equal(mergeLook({ look: 'desk', basis: 'o', by: 'owner' }, { look: 'desk', basis: 'r', by: 'rule' }).group, undefined);
  /* AND THE WHOLE IS NEVER MORE THAN A LOOK MAY HOLD: his first, then the engine's while there is room. */
  const many = (n: number, field: string, at = 0): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`part-${at + i}`, field]));
  const full = mergeLook({ ...owner, group: many(10, 'kind') }, { ...engine, group: many(10, 'stage', 5) }).group!;
  assert.equal(Object.keys(full).length, LOOK_GROUPS_MOST);
  assert.equal(full['part-5'], 'kind');
  assert.equal(full['part-10'], 'stage');
});
