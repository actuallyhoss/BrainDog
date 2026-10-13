/**
 * A look is rehearsed before it is written (ENG-B09, decision 3 check 4): laid over the page as it reads now, and read
 * by the lint for what a page prints. The page here is a desk with a late list and an empty one, which is the shape
 * the composer met on his record: a look that led with the empty one drew a blank at the top of the page.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyedBlocks, type BlockResult, type LookBody, type PageResult, type PageRow } from '@braindog/kernel';
import { REFUSALS_MOST, lookRefusedKey, noteRefusal, refusedFor, rehearse } from '../src/compose-rehearse.ts';

const at = '2026-10-09T03:00:00.000Z';
const row = (register: string, seq: number, fields: Record<string, unknown>): PageRow => ({
  id: `01K${register.toUpperCase()}${seq}`,
  register,
  seq,
  fields: fields as PageRow['fields'],
  state: 'open',
  version: 1,
  created_at: at,
  updated_at: at,
  deleted_at: null,
});

const block = (b: Partial<BlockResult> & { kind: string; body?: string }): BlockResult => ({ rows: [], matched: 0, refusals: [], ...b }) as BlockResult;

const bills = block({
  kind: 'table',
  source: 'register.bills',
  heading: 'Bills',
  columns: [{ field: 'what' }],
  types: { what: 'text' },
  rows: [row('bills', 1, { what: 'Rent' }), row('bills', 2, { what: 'Phone' })],
  matched: 2,
});
const notes = block({ kind: 'table', source: 'register.notes', heading: 'Notes', columns: [{ field: 'what' }], types: { what: 'text' }, rows: [row('notes', 1, { what: 'Call the bank' })], matched: 1 });
const trips = block({ kind: 'table', source: 'register.trips', heading: 'Trips', columns: [{ field: 'what' }], types: { what: 'text' } });

const desk = (...blocks: BlockResult[]): PageResult => ({ page: 'desk', title: 'Desk', blocks: keyedBlocks(blocks) });
const keyOf = (page: PageResult, heading: string): string => page.blocks.find((b) => b.heading === heading)!.key!;
const look = (more: Partial<LookBody> = {}): LookBody => ({ look: 'desk', basis: 'b1', by: 'slash', ...more });

test('a look that leads with a block which draws nothing is refused, and the finding says so', () => {
  const page = desk(notes, bills, trips);
  const got = rehearse(page, look({ lead: keyOf(page, 'Trips') }));
  assert.equal(got.ok, false);
  if (got.ok) return;
  const drew = got.findings.filter((f) => f.rule === 'drew-nothing');
  assert.equal(drew.length, 1, JSON.stringify(got.findings));
  assert.deepEqual({ page: drew[0]!.page, part: drew[0]!.part }, { page: 'Desk', part: 'Trips' });
  /* A finding is read by a person: the part by its name, never its key. */
  assert.ok(!drew[0]!.said.includes(keyOf(page, 'Trips')));
  assert.match(drew[0]!.said, /draws nothing/u);
});

test('a look that leaves a blank tile on the page is refused, and one that hides it passes', () => {
  const page = desk(notes, bills, trips);
  const blank = rehearse(page, look({ lead: keyOf(page, 'Bills') }));
  assert.equal(blank.ok, false);
  if (!blank.ok) assert.deepEqual(blank.findings.map((f) => [f.rule, f.part]), [['drew-nothing', 'Trips']]);
  assert.equal(rehearse(page, look({ lead: keyOf(page, 'Bills'), hide: [keyOf(page, 'Trips')] })).ok, true);
});

test('a tile that says its own empty words, and one the person pinned, are theirs to show', () => {
  const said = desk(notes, bills, { ...trips, empty: 'No trips yet.' } as BlockResult);
  assert.equal(rehearse(said, look()).ok, true);
  const page = desk(notes, bills, trips);
  assert.equal(rehearse(page, look({ pinned: [keyOf(page, 'Trips')] })).ok, true);
});

test('a look whose headline leaves a brace is refused', () => {
  const page = desk(notes, bills);
  /* No block on the page says this figure, so the hole has nothing to fill it. */
  const got = rehearse(page, look({ headline: 'You owe {{bills.due}} this week.' }));
  assert.equal(got.ok, false);
  if (got.ok) return;
  assert.deepEqual(got.findings.map((f) => [f.rule, f.part]), [['placeholder', 'Desk']]);
  for (const f of got.findings) assert.ok(!f.said.includes('{{'), f.said);
  /* And a brace that is no hole is no line either. */
  assert.equal(rehearse(page, look({ headline: 'You owe {bills} this week.' })).ok, false);
});

test('a hole the page has a figure for passes, filled as the page prints it', () => {
  const figured = { ...bills, values: { 'bills.count': 2 } } as BlockResult;
  const page = desk(notes, figured);
  const got = rehearse(page, look({ headline: '{{bills.count}} bills wait.' }));
  assert.equal(got.ok, true, JSON.stringify(got));
  if (got.ok) assert.equal(got.look.headline, '2 bills wait.');
});

test('a raw id or a raw time in the headline or the next step is refused', () => {
  const page = desk(notes, bills);
  const id = rehearse(page, look({ headline: 'Look at 01JZ8QK3F7R2M9V4XN6TCB5HAD first.' }));
  assert.equal(id.ok, false);
  if (!id.ok) assert.ok(id.findings.some((f) => f.rule === 'raw-id'), JSON.stringify(id.findings));
  const time = rehearse(page, look({ next: { row: 'bills#1', text: 'Pay rent by 2026-10-07T12:00:00Z' } }));
  assert.equal(time.ok, false);
  if (!time.ok) assert.ok(time.findings.some((f) => f.rule === 'raw-instant'), JSON.stringify(time.findings));
});

test('a cell the page would print raw refuses the look that shows it, and not the one that hides it', () => {
  const runs = block({ kind: 'table', source: 'register.runs', heading: 'Runs', columns: [{ field: 'ended' }], types: { ended: 'text' }, rows: [row('runs', 1, { ended: '2026-10-07T12:00:00Z' })], matched: 1 });
  const page = desk(notes, bills, runs);
  const shown = rehearse(page, look());
  assert.equal(shown.ok, false);
  if (!shown.ok) assert.deepEqual(shown.findings.map((f) => [f.rule, f.part]), [['raw-instant', 'Runs, Ended']]);
  assert.equal(rehearse(page, look({ hide: [keyOf(page, 'Runs')] })).ok, true);
});

test('a clean look passes and answers the blocks as they would be drawn', () => {
  const page = desk(notes, bills, trips);
  const got = rehearse(page, look({ lead: keyOf(page, 'Bills'), hide: [keyOf(page, 'Trips')], headline: 'Rent and phone are due.' }));
  assert.equal(got.ok, true, JSON.stringify(got));
  if (!got.ok) return;
  assert.deepEqual(got.blocks.map((b) => [b.heading, b.drawn !== false]), [['Bills', true], ['Notes', true], ['Trips', false]]);
  assert.equal(got.look.lead, keyOf(page, 'Bills'));
  assert.deepEqual(got.look.hide, [keyOf(page, 'Trips')]);
  /* The page it was handed is not touched: a rehearsal is a read. */
  assert.deepEqual(page.blocks.map((b) => b.heading), ['Notes', 'Bills', 'Trips']);
  assert.ok(page.blocks.every((b) => b.drawn !== false));
});

test('a second refusal for the same basis leaves the page on its rules until its basis moves', () => {
  assert.equal(REFUSALS_MOST, 2);
  assert.equal(lookRefusedKey('desk'), 'look.refused.desk');
  assert.equal(refusedFor('b1', undefined), 'rehearse');
  const once = noteRefusal('b1', undefined);
  assert.deepEqual(once, { basis: 'b1', times: 1 });
  assert.equal(refusedFor('b1', once), 'rehearse');
  const twice = noteRefusal('b1', once);
  assert.deepEqual(twice, { basis: 'b1', times: 2 });
  assert.equal(refusedFor('b1', twice), 'leave');
  /* A third is not counted past the most, so the kept value never grows. */
  assert.deepEqual(noteRefusal('b1', twice), twice);
});

test('a different basis is rehearsed afresh, and a kept value that is not one counts for nothing', () => {
  const twice = noteRefusal('b1', noteRefusal('b1', undefined));
  assert.equal(refusedFor('b2', twice), 'rehearse');
  assert.deepEqual(noteRefusal('b2', twice), { basis: 'b2', times: 1 });
  for (const kept of [null, 'b1', 7, [], { basis: 'b1' }, { basis: 'b1', times: 'two' }, { basis: 'b1', times: -1 }, { basis: 'b1', times: 1.5 }]) {
    assert.equal(refusedFor('b1', kept), 'rehearse', JSON.stringify(kept));
    assert.deepEqual(noteRefusal('b1', kept), { basis: 'b1', times: 1 });
  }
});
