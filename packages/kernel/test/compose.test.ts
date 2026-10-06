/**
 * The engine's look (`compose.ts`) and the keys it is written in (`block-keys.ts`), on pages built by hand.
 *
 * THE RULES ARE CALM FIRST. A page where nothing happened reads as declared; a block moves only when something in it is
 * late, waiting on the reader or changed since they looked, and only inside its own group. These tests hold that, and
 * hold the floor under every look: a pinned, refused or lead block is never hidden, and nothing is added.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockKeyOf, defaultBlockKey, keyedBlocks } from '../src/block-keys.ts';
import { applyLook, composeLook, drewNothing, lookOf, mergeLook, type ComposeInput, type LookBody } from '../src/compose.ts';
import type { BlockResult, ListShape, PageRow } from '../src/pages.ts';

const TODAY = '2026-10-06';
const SEEN = '2026-10-05T18:00:00.000Z';

const row = (register: string, seq: number, fields: Record<string, unknown>, at = '2026-10-01T09:00:00.000Z', state: string | null = 'open'): PageRow => ({
  id: `01K${register.toUpperCase()}${seq}`,
  register,
  seq,
  fields: fields as PageRow['fields'],
  state,
  version: 1,
  created_at: at,
  updated_at: at,
  deleted_at: null,
});

/* `body` and the rest a declaration may carry beyond the type ride along, as they do on a read's answer. */
const block = (b: Partial<BlockResult> & { kind: string; body?: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...b }) as BlockResult;
const keyed = (...blocks: BlockResult[]): BlockResult[] => keyedBlocks(blocks);
const keysOf = (blocks: readonly BlockResult[]): string[] => blocks.map((b) => b.key!);

const TASKS: ListShape = {
  id: 'tasks',
  done: ['done'],
  fields: [
    { id: 'what', type: 'text' },
    { id: 'by', type: 'day', deadline: true },
    { id: 'state', type: 'enum' },
  ],
};

const input = (blocks: BlockResult[], more: Partial<ComposeInput> = {}): ComposeInput => ({
  page: 'desk',
  blocks,
  today: TODAY,
  seen: SEEN,
  lists: [TASKS],
  titleOf: (r) => (r === 'tasks' ? 'what' : null),
  ...more,
});

/* ── keys ────────────────────────────────────────────────────────────────── */

test('A BLOCK WITH NO KEY IS NAMED BY ITS KIND, SOURCE AND HEADING, and nothing else moves it', () => {
  const a = { kind: 'table', source: 'register.tasks', heading: 'Now', limit: 5 };
  const b = { ...a, limit: 50, where: 'state is open', columns: [{ field: 'what' }] };
  assert.equal(defaultBlockKey(a), defaultBlockKey(b), 'columns, limit and where are not what a person means by "that block"');
  assert.notEqual(defaultBlockKey(a), defaultBlockKey({ ...a, heading: 'Later' }));
  assert.notEqual(defaultBlockKey(a), defaultBlockKey({ ...a, kind: 'cards' }));
  assert.match(defaultBlockKey(a), /^k[0-9a-z]{7}$/u);
  assert.equal(blockKeyOf({ ...a, key: 'cash' }), 'cash', 'a declared key wins');
  assert.equal(blockKeyOf({ ...a, key: 'Not A Key' }), defaultBlockKey(a), 'one of the wrong shape is read as none');
});

test('TWO BLOCKS ALIKE ARE PARTED IN DECLARED ORDER, and a declared key is never taken by a default', () => {
  const note = { kind: 'note', body: 'x' };
  const keys = keyedBlocks([note, { kind: 'note', body: 'y' }, { kind: 'note', body: 'z', key: defaultBlockKey(note) }]).map((b) => b.key);
  assert.equal(keys[2], defaultBlockKey(note), 'the author wrote that key, so the default gives way');
  assert.equal(keys[0], `${defaultBlockKey(note)}-2`);
  assert.equal(keys[1], `${defaultBlockKey(note)}-3`);
  assert.equal(new Set(keys).size, 3);
  /* AND A KEY ALREADY GIVEN ON THE PAGE is parted from, as another pack's addition is from the page's own. */
  const taken = new Set(['cash']);
  assert.equal(keyedBlocks([{ kind: 'stat', key: 'cash' }], taken)[0]!.key, 'cash-2');
});

/* ── the rules ───────────────────────────────────────────────────────────── */

test('A PAGE WHERE NOTHING HAPPENED READS AS DECLARED: no lead, no order, no next', () => {
  const blocks = keyed(
    block({ kind: 'note', lead: true, body: 'Your desk' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write the brief', by: '2026-10-09' })], matched: 1 }),
    block({ kind: 'stat', heading: 'Cash', readings: [{ metric: 'cash', reading: { value: 120_00, unit: 'GBP', rows: 3 } as never }] }),
  );
  const look = composeLook(input(blocks, { seen: '2026-10-02T00:00:00.000Z' }));
  assert.deepEqual(
    { lead: look.lead, order: look.order, hide: look.hide, next: look.next, by: look.by },
    { lead: undefined, order: undefined, hide: undefined, next: undefined, by: 'rule' },
  );
  assert.match(look.basis, /^r[0-9a-z]{7}$/u);
});

test('LATE BEATS NEEDS-YOU BEATS CHANGED BEATS FIGURES, inside a group, and the most pressing block leads', () => {
  const blocks = keyed(
    block({ kind: 'note', lead: true, body: 'Your desk' }),
    block({ kind: 'stat', heading: 'Cash', readings: [{ metric: 'cash', reading: { value: 120_00, unit: 'GBP', rows: 3 } as never }] }),
    block({ kind: 'table', source: 'register.notes', heading: 'Changed', rows: [row('notes', 4, { title: 'Kiln' }, '2026-10-06T08:00:00.000Z')], matched: 1 }),
    block({
      kind: 'queue',
      source: 'governance.open',
      heading: 'Needs you',
      matched: 1,
      queue: [{ id: 'SG12', who: 'Slash', at: SEEN, kind: 'rowset', question: 'Are Sam Reed and sreed one person?', why: '', cost: 'low', options: [] } as never],
    }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 7, { what: 'Pay HSBC', by: '2026-10-03' })], matched: 1 }),
  );
  const [, cash, changed, needs, late] = keysOf(blocks);
  const look = composeLook(input(blocks));
  assert.equal(look.lead, late, 'the late block leads the page');
  assert.deepEqual(look.order, [needs, changed, cash], 'the rest of its group, most pressing first; the lead is placed on its own');
  assert.deepEqual(look.next, { row: 'tasks#7', text: 'Pay HSBC is 3 days late' }, 'the next action names the row, in words');

  const drawn = applyLook(blocks, look);
  assert.deepEqual(keysOf(drawn.blocks), [keysOf(blocks)[0], late, needs, changed, cash], 'the opening line stays on top');
  assert.equal(drawn.blocks.length, blocks.length, 'nothing is added or taken out');
});

test('A DONE ROW IS NOT LATE, AND WITH NOTHING LATE THE FIRST QUESTION WAITING IS THE NEXT ACTION', () => {
  const blocks = keyed(
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 2, { what: 'Old', by: '2026-09-01' }, undefined, 'done')], matched: 1 }),
    block({ kind: 'queue', source: 'governance.open', heading: 'Needs you', matched: 1, queue: [{ id: 'SG3', question: 'Keep the Kiln page?', options: [] } as never] }),
  );
  const look = composeLook(input(blocks));
  assert.deepEqual(look.next, { row: 'SG3', text: 'Keep the Kiln page?' });
  assert.equal(look.lead, keysOf(blocks)[1]);
});

test('A DEADLINE ACROSS THE LISTS IS LATE BY ITS DAY, and the oldest late row is the one named', () => {
  const due = (seq: number, title: string, day: string): PageRow => ({ ...row('deadlines', seq, { row: `bills#${seq}`, title, day, list: 'bills' }), seq: null });
  const blocks = keyed(block({ kind: 'todo', source: 'deadlines', heading: 'Late', rows: [due(1, 'Rent', '2026-10-01'), due(2, 'Phone', '2026-10-04')], matched: 2 }));
  assert.deepEqual(composeLook(input(blocks)).next, { row: 'bills#1', text: 'Rent is 5 days late' });
});

test('WHAT DREW NOTHING IS HIDDEN, A HEADING OVER ONLY THAT TOO, and never a note, a refused block or the last one standing', () => {
  const blocks = keyed(
    block({ kind: 'note', lead: true, body: 'Your desk' }),
    block({ kind: 'section', heading: 'Notes' }),
    block({ kind: 'table', source: 'register.notes', heading: 'Notes', empty: 'No notes yet.' }),
    block({ kind: 'section', heading: 'Work' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write', by: '2026-10-09' })], matched: 1 }),
    block({ kind: 'table', source: 'register.nope', heading: 'Broken', refusals: [{ code: 'REGISTER_UNKNOWN', fix: 'x' }] }),
    block({ kind: 'note', body: 'A word on how we work.' }),
  );
  const [, notesHead, notes, , , broken, word] = keysOf(blocks);
  const look = composeLook(input(blocks));
  assert.deepEqual(look.hide, [notesHead, notes]);
  const drawn = applyLook(blocks, look).blocks;
  assert.equal(drawn.find((b) => b.key === broken)!.drawn, undefined, 'a refused block stays, so the person sees what broke');
  assert.equal(drawn.find((b) => b.key === word)!.drawn, undefined);

  /* A PAGE WITH NOTHING IN IT STILL SAYS WHAT ITS QUIET IS: the first empty block that says so stays. */
  const bare = keyed(
    block({ kind: 'note', lead: true, body: 'Your desk' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', empty: 'Nothing to do.' }),
    block({ kind: 'table', source: 'register.notes', heading: 'Notes', empty: 'No notes yet.' }),
  );
  assert.deepEqual(composeLook(input(bare)).hide, [keysOf(bare)[2]]);
  assert.equal(drewNothing(block({ kind: 'capture', register: 'tasks' })), false, 'the line a row is typed into is never empty');
});

test('A RAIL GROUP AND A MAIN GROUP ARE ORDERED APART, and a block never changes column', () => {
  const blocks = keyed(
    block({ kind: 'table', source: 'register.a', heading: 'A' }),
    block({ kind: 'feed', source: 'activity', heading: 'Since', area: 'rail', rows: [], matched: 1, feed: [{ at: '2026-10-06T07:00:00.000Z' } as never] }),
    block({ kind: 'table', source: 'register.b', heading: 'B', rows: [row('b', 1, { name: 'x' })], matched: 1 }),
    block({ kind: 'stat', heading: 'Money', area: 'rail', readings: [{ metric: 'cash', reading: { value: 1 } as never }] }),
  );
  const look: LookBody = { look: 'desk', basis: 'x', by: 'slash', order: [keysOf(blocks)[3]!, keysOf(blocks)[2]!, keysOf(blocks)[1]!, keysOf(blocks)[0]!] };
  const drawn = applyLook(blocks, look).blocks;
  assert.deepEqual(
    drawn.map((b) => [b.heading, b.area ?? 'main']),
    [
      ['B', 'main'],
      ['Money', 'rail'],
      ['A', 'main'],
      ['Since', 'rail'],
    ],
  );
});

/* ── the floor every look stands on ──────────────────────────────────────── */

test('A LOOK ONLY REORDERS WHAT IS THERE: an unknown key is dropped, a refused or lead block is never hidden, and next names a row the page handed', () => {
  const blocks = keyed(
    block({ kind: 'note', lead: true, body: 'Line' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write' })], matched: 1 }),
    block({ kind: 'table', source: 'register.nope', heading: 'Broken', refusals: [{ code: 'REGISTER_UNKNOWN', fix: 'x' }] }),
  );
  const [line, now, broken] = keysOf(blocks);
  const out = applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', order: ['kzzzzzzz', now!], hide: [line!, broken!, 'kmissing'], next: { row: 'tasks#99', text: 'Ghost' } });
  assert.equal(out.blocks.length, 3);
  assert.ok(out.blocks.every((b) => b.drawn === undefined), 'nothing was hidden');
  assert.deepEqual(out.look.order, [now], 'only the key the page has');
  assert.equal(out.look.hide, undefined);
  assert.equal(out.look.next, undefined, 'the page never handed tasks#99');
  assert.deepEqual(applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', next: { row: 'tasks#1', text: 'Write' } }).look.next, { row: 'tasks#1', text: 'Write' });
});

test('A HIDDEN HEADING HIDES WHAT IT HOLDS, and is not hidden while it holds a pinned block', () => {
  const blocks = keyed(
    block({ kind: 'section', heading: 'Old' }),
    block({ kind: 'table', source: 'register.a', heading: 'A', rows: [row('a', 1, { n: 1 })], matched: 1 }),
    block({ kind: 'section', heading: 'Kept' }),
    block({ kind: 'table', source: 'register.b', heading: 'B', rows: [row('b', 1, { n: 1 })], matched: 1 }),
  );
  const [old, a, kept, b] = keysOf(blocks);
  const out = applyLook(blocks, { look: 'desk', basis: 'x', by: 'owner', hide: [old!, kept!], pinned: [b!] });
  assert.deepEqual(out.look.hide, [old, a]);
  assert.equal(out.blocks[2]!.drawn, undefined);
});

test('A HEADING THE LOOK LEFT HOLDING NOTHING IS NOT DRAWN, whether the lead moved out from under it or its blocks were hidden', () => {
  const blocks = keyed(
    block({ kind: 'section', heading: 'Today' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write' })], matched: 1 }),
    block({ kind: 'section', heading: 'Bills' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Late', rows: [row('tasks', 2, { what: 'Pay HSBC', by: '2026-10-03' })], matched: 1 }),
  );
  const [today, now, bills, late] = keysOf(blocks);
  const led = applyLook(blocks, composeLook(input(blocks)));
  assert.deepEqual(keysOf(led.blocks), [late, today, now, bills]);
  assert.equal(led.blocks[3]!.drawn, false, 'Bills would stand over nothing once its one block leads the page');
  assert.equal(led.blocks[1]!.drawn, undefined);
  const hid = applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', hide: [now!] });
  assert.deepEqual(hid.blocks.map((b) => b.drawn), [false, false, undefined, undefined]);
  assert.deepEqual(hid.look.hide, [today, now]);
  /* A HEADING THE PAGE DECLARED OVER NOTHING is the page's own to draw. */
  const bare = keyed(block({ kind: 'section', heading: 'Later' }), block({ kind: 'section', heading: 'Now' }), block({ kind: 'table', source: 'register.tasks', heading: 'A', rows: [row('tasks', 1, { what: 'x' })], matched: 1 }));
  assert.equal(applyLook(bare, { look: 'desk', basis: 'x', by: 'slash' }).blocks[0]!.drawn, undefined);
});

test('A BLOCK THAT ALREADY LEADS STAYS UNDER ITS HEADING, which is not left standing over nothing', () => {
  /* "Waiting on you" over the one question: the question leads the page, and it already does from under its heading. */
  const blocks = keyed(
    block({ kind: 'section', heading: 'Waiting on you' }),
    block({ kind: 'queue', source: 'governance.open', queue: [{ id: 'SG1', question: 'Fire on Friday?' }] as never, matched: 1 }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write' })], matched: 1 }),
  );
  const [heading, queue, now] = keysOf(blocks);
  const led = applyLook(blocks, composeLook(input(blocks)));
  assert.equal(led.look.lead, queue);
  assert.deepEqual(keysOf(led.blocks), [heading, queue, now]);
  assert.deepEqual(led.blocks.map((b) => b.drawn), [undefined, undefined, undefined]);
});

test("THE LEAD GOES UNDER THE PAGE'S OPENING: a capture line the author put first stays first", () => {
  const blocks = keyed(
    block({ kind: 'note', body: 'Nothing is open right now', drawn: false }),
    block({ kind: 'note', lead: true, body: '3 open tasks' }),
    block({ kind: 'capture', heading: 'What needs doing?', register: 'tasks' }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Today', rows: [row('tasks', 1, { what: 'Write', by: '2026-10-09' })], matched: 1 }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Late', rows: [row('tasks', 2, { what: 'Pay HSBC', by: '2026-10-03' })], matched: 1 }),
  );
  const k = keysOf(blocks);
  assert.deepEqual(keysOf(applyLook(blocks, composeLook(input(blocks))).blocks), [k[0], k[1], k[2], k[4], k[3]]);
});

test('A LATE ROW THE PAGE CANNOT NAME STILL MAKES ITS BLOCK LATE, and the next action is one it can name', () => {
  const blocks = keyed(
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write' })], matched: 1 }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Old', rows: [row('tasks', 2, { by: '2026-09-01' }), row('tasks', 3, { what: 'Call Sam', by: '2026-10-05' })], matched: 2 }),
  );
  const look = composeLook(input(blocks));
  assert.equal(look.lead, keysOf(blocks)[1]);
  assert.deepEqual(look.next, { row: 'tasks#3', text: 'Call Sam is 1 day late' });
});

test("AN OWNER'S LOOK WINS AND HIS PINS ARE NEVER OVERRIDDEN: the rules fill only what he left, around his pins", () => {
  const blocks = keyed(
    block({ kind: 'note', lead: true, body: 'Your desk' }),
    block({ kind: 'table', source: 'register.notes', heading: 'Notes', empty: 'None.' }),
    block({ kind: 'stat', heading: 'Cash', readings: [{ metric: 'cash', reading: { value: 1 } as never }] }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 7, { what: 'Pay HSBC', by: '2026-10-03' })], matched: 1 }),
  );
  const [, notes, cash, now] = keysOf(blocks);
  const owner: LookBody = { look: 'desk', basis: 'owner-1', by: 'owner', pinned: [notes!, cash!], headline: 'My desk' };
  const engine = composeLook(input(blocks, { pinned: owner.pinned! }));
  assert.equal(engine.hide, undefined, 'a pinned block is never hidden, empty or not');
  assert.equal(engine.lead, undefined, 'the late block would lead past his pins, so it does not');
  assert.ok(!(engine.order ?? []).some((k) => k === notes || k === cash), 'and his pins are never moved');
  const merged = mergeLook(owner, { ...engine, hide: [notes!], lead: notes! });
  assert.deepEqual([merged.by, merged.basis, merged.headline, merged.pinned, merged.hide, merged.lead], ['owner', 'owner-1', 'My desk', [notes, cash], undefined, undefined]);
  assert.deepEqual(merged.next, { row: 'tasks#7', text: 'Pay HSBC is 3 days late' }, 'what he left unset is the engine’s');
  const drawn = applyLook(blocks, merged).blocks;
  assert.deepEqual(keysOf(drawn), keysOf(blocks));
  assert.ok(drawn.every((b) => b.drawn === undefined));
  assert.equal(now, keysOf(blocks)[3]);
});

test('A STORED LOOK IS READ FORGIVINGLY: what still reads is kept and the rest dropped', () => {
  assert.equal(lookOf(null), null);
  assert.equal(lookOf({ look: 'desk', by: 'robot' }), null);
  assert.deepEqual(lookOf({ look: 'desk', by: 'slash', basis: 'b', order: ['ka', 'Bad Key', 'ka', 3], next: { row: 'tasks#1' }, headline: '  ' }), {
    look: 'desk',
    basis: 'b',
    by: 'slash',
    order: ['ka'],
  });
});

/* ── the edges audit 17 found (L1) ───────────────────────────────────────── */

test('A LEAD NEVER PUSHES A PINNED BLOCK DOWN: with one between it and the top it stays, and is not said to lead', () => {
  const blocks = keyed(
    block({ kind: 'note', lead: true, body: 'Your desk' }),
    block({ kind: 'table', source: 'register.notes', heading: 'Notes', rows: [row('notes', 1, { name: 'x' })], matched: 1 }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 7, { what: 'Pay HSBC', by: '2026-10-03' })], matched: 1 }),
  );
  const [line, notes, now] = keysOf(blocks);
  /* WHOEVER NAMED THE LEAD: a stored look that pins nothing moves it, and one that pins the block above does not. */
  assert.deepEqual(keysOf(applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', lead: now! }).blocks), [line, now, notes]);
  const owner = applyLook(blocks, { look: 'desk', basis: 'x', by: 'owner', lead: now!, pinned: [notes!] });
  assert.deepEqual(keysOf(owner.blocks), keysOf(blocks), 'the pinned Notes keeps its place');
  assert.equal(owner.look.lead, undefined);
  /* AND THE ENGINE'S LEAD UNDER HIS PINS, once merged, does the same. */
  const merged = mergeLook({ look: 'desk', basis: 'x', by: 'owner', pinned: [notes!] }, { look: 'desk', basis: 'r', by: 'rule', lead: now! });
  assert.deepEqual(keysOf(applyLook(blocks, merged).blocks), keysOf(blocks));
  /* A PIN IN THE RAIL IS NOT IN THE WAY: the main column's blocks are what move. */
  const railed = keyed(
    block({ kind: 'table', source: 'register.notes', heading: 'Notes', rows: [row('notes', 1, { name: 'x' })], matched: 1 }),
    block({ kind: 'stat', heading: 'Cash', area: 'rail', readings: [{ metric: 'cash', reading: { value: 1 } as never }] }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 7, { what: 'Pay HSBC', by: '2026-10-03' })], matched: 1 }),
  );
  const r = keysOf(railed);
  const led = applyLook(railed, { look: 'desk', basis: 'x', by: 'owner', lead: r[2]!, pinned: [r[1]!] });
  assert.deepEqual(keysOf(led.blocks), [r[2], r[0], r[1]]);
  assert.equal(led.look.lead, r[2]);
});

test('THE NEXT STEP IS A ROW STILL DRAWN AFTER THE HIDE: a look that hides the block holding it says no next', () => {
  const blocks = keyed(
    block({ kind: 'table', source: 'register.tasks', heading: 'Now', rows: [row('tasks', 1, { what: 'Write' })], matched: 1 }),
    block({ kind: 'table', source: 'register.tasks', heading: 'Later', rows: [row('tasks', 2, { what: 'Call Sam' })], matched: 1 }),
  );
  const [now, later] = keysOf(blocks);
  const hid = applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', hide: [now!], next: { row: 'tasks#1', text: 'Write' } });
  assert.deepEqual(hid.look.hide, [now]);
  assert.equal(hid.look.next, undefined, 'tasks#1 is in the block the look hid');
  const kept = applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', hide: [now!], next: { row: 'tasks#2', text: 'Call Sam' } });
  assert.deepEqual(kept.look.next, { row: 'tasks#2', text: 'Call Sam' });
  /* A ROW IN A BLOCK HELD FROM THE READER IS NOT ONE SHE CAN TAKE EITHER. */
  const held = keyed(block({ kind: 'table', heading: 'Now', rows: [row('tasks', 1, { what: 'Write' })], refusals: [{ code: 'FORBIDDEN', fix: 'x' }] }));
  assert.equal(applyLook(held, { look: 'desk', basis: 'x', by: 'slash', next: { row: 'tasks#1', text: 'Write' } }).look.next, undefined);
  assert.equal(later, keysOf(blocks)[1]);
});

test('AN ORDER STAYS UNDER ITS HEADINGS: a block named across two groups keeps its own, and a heading is never moved', () => {
  const blocks = keyed(
    block({ kind: 'section', heading: 'Today' }),
    block({ kind: 'table', source: 'register.a', heading: 'A', rows: [row('a', 1, { n: 1 })], matched: 1 }),
    block({ kind: 'table', source: 'register.b', heading: 'B', rows: [row('b', 1, { n: 1 })], matched: 1 }),
    block({ kind: 'section', heading: 'Bills' }),
    block({ kind: 'table', source: 'register.c', heading: 'C', rows: [row('c', 1, { n: 1 })], matched: 1 }),
  );
  const [today, a, b, bills, c] = keysOf(blocks);
  /* C NAMED FIRST WOULD HAVE TAKEN A'S PLACE UNDER "Today", and A gone under "Bills". */
  assert.deepEqual(keysOf(applyLook(blocks, { look: 'desk', basis: 'x', by: 'slash', order: [c!, b!, a!] }).blocks), [today, b, a, bills, c]);
  assert.deepEqual(keysOf(applyLook(blocks, { look: 'desk', basis: 'x', by: 'owner', order: [c!, a!] }).blocks), keysOf(blocks));
  const headed = applyLook(blocks, { look: 'desk', basis: 'x', by: 'owner', order: [bills!, today!, c!] });
  assert.deepEqual(keysOf(headed.blocks), keysOf(blocks), 'a heading is no block an order moves');
  assert.deepEqual(headed.look.order, [c]);
});
