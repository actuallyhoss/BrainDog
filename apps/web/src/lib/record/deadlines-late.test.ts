/**
 * A DAY ALREADY GONE SAYS HOW LATE IT IS, on every page that lists what falls due across lists.
 *
 * The live look at 03882ba5 found Today's "Due this week" listing a payment dated 9 Oct on 14 Oct under "this week", as a
 * bare day with no word that it was late. Home's own Late already said "5 days late" (`default-home.ts` `howLate`), but
 * every other block over `deadlines` (business's Due this week, student's, personal's Coming up, any page a person or
 * Slash makes) drew the day as it was stored. The reader (`page-live.ts`) now says it there, in Today's words, with the
 * bad tone that brings its glyph; a day of today or later reads as before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { DEFAULT_HOME, homeDrawn } from '../home/default-home.ts';
import { lateSaid } from '../home/today-tiles.ts';
import { addDays, dayOf } from '../work/board.ts';
import { toSegments } from './blocks.ts';
import { readBlock } from './fixtures/readers.ts';
import { NOW } from './fixtures/sample.ts';
import { blockOf } from './page-live.ts';
import { dateSaid } from 'braindog-render';

const today = dayOf(NOW);
const past = addDays(today, -5);
const soon = addDays(today, 3);

/** What the record sends for a `deadlines` block: the kernel's own fields, overdue first and then by day. */
const due = (n: number, day: string, title: string, amount: number, direction: 'in' | 'out') => ({
  id: `d${n}`,
  seq: n,
  fields: { list: 'obligations', row: `obligations#${n}`, title, day, amount: { amount, currency: 'GBP' }, direction },
});
const rows = [due(1, past, 'Orchardline payment', 120_000, 'in'), due(2, today, 'Studio rent', 90_000, 'out'), due(3, soon, 'Hosting', 2_000, 'out')];

/** A block as business 1.7.1 declares its Due this week: description, signed amount, and the day last. */
const business = {
  kind: 'table',
  heading: 'Due this week',
  source: 'deadlines',
  horizon: 7,
  columns: [
    { field: 'title', label: 'Description' },
    { field: 'amount', label: 'Amount', sign: { field: 'direction', minus: 'out' } },
    { field: 'day', label: 'Due' },
  ],
  rows,
  matched: rows.length,
  refusals: [],
};

test('A DUE THIS WEEK TABLE SAYS A DAY GONE IS LATE, in Today\'s words and with the mark, and the rest read as before', () => {
  const b = blockOf(business as never, new Map(), NOW);
  assert.equal(b.drawn, true);
  assert.equal(b.rows.length, 3);
  const [gone, now, later] = b.rows;
  assert.equal(gone!.cells[2], lateSaid(past, today));
  assert.equal(gone!.cells[2], '5 days late');
  assert.equal(gone!.tone, 'bad', 'a late row is told by colour alone, or not at all');
  assert.equal(now!.cells[2], dateSaid(today, NOW));
  assert.equal(later!.cells[2], dateSaid(soon, NOW));
  assert.equal(now!.tone, undefined, 'a row due today is not late yet');
  assert.equal(later!.tone, undefined);
  /* THE REST OF THE ROW IS AS IT WAS: the title, the signed amount, and the door to the row. */
  assert.equal(gone!.cells[0], 'Orchardline payment');
  assert.match(String(gone!.cells[1]), /^\+/u);
  assert.match(String(now!.cells[1]), /^−/u);
  assert.equal(gone!.href, '/r/obligations/1');
  /* THE ENTRIES KEEP THE STORED DAY, which Home reads to split Late from what comes up. */
  assert.equal(b.entries[0]!.fields.day, past);
});

test('A TIMELINE OVER WHAT FALLS DUE SAYS THE SAME, and its fence carries the bad tone to the glyph', () => {
  const timeline = { ...business, kind: 'timeline', heading: 'Coming up', columns: [{ field: 'day' }, { field: 'title' }, { field: 'amount', sign: { field: 'direction', minus: 'out' } }] };
  const b = blockOf(timeline as never, new Map(), NOW);
  assert.equal(b.rows[0]!.cells[0], '5 days late');
  assert.equal(b.rows[0]!.tone, 'bad');
  assert.equal(b.rows[1]!.cells[0], dateSaid(today, NOW));
  assert.equal(b.rows[2]!.cells[0], dateSaid(soon, NOW));
  assert.equal(b.rows[1]!.tone, undefined);
  const drawn = toSegments(b).flatMap((s) => (s.type === 'block' ? ((s as { rows?: { cells: string[]; tone?: string }[] }).rows ?? []) : []));
  assert.equal(drawn.length, 3);
  assert.equal(drawn[0]!.cells[0]?.trim(), '5 days late');
  assert.equal(drawn[0]!.tone, 'bad', 'the timeline dropped the late row\'s mark');
  assert.equal(drawn[1]!.tone, undefined);
});

test('HOME\'S OWN LATE READS AS BEFORE: how late once, in the same words, and Coming up keeps its days', () => {
  const reads = DEFAULT_HOME.blocks.filter((b) => b.source === 'deadlines').map((b) => readBlock(b));
  const { blocks } = homeDrawn(reads, NOW);
  const shown = blocks.filter((b) => b.drawn && b.source === 'deadlines');
  const late = shown.filter((b) => b.heading === 'Late');
  assert.ok(late.length > 0 && late.every((b) => b.rows.length > 0), 'the sample has nothing late, so this asks nothing');
  for (const b of late) {
    const at = b.columns.findIndex((c) => c.field === 'day');
    b.rows.forEach((r, n) => {
      const day = String(b.entries[n]!.fields.day).slice(0, 10);
      assert.equal(r.cells[at], lateSaid(day, today), `Late row ${n} reads "${r.cells[at]}"`);
    });
  }
  /* WHAT COMES UP IS FROM TODAY ON, so none of it is said late and none carries the mark. */
  for (const b of shown.filter((x) => x.heading !== 'Late')) {
    for (const r of b.rows) assert.ok(!r.cells.some((c) => typeof c === 'string' && / late$/u.test(c)), `${b.heading}: ${r.cells.join(' | ')}`);
    assert.ok(b.rows.every((r) => r.tone === undefined), `${b.heading} marks a row that is not late`);
  }
});
