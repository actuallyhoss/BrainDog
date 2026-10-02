/**
 * WHAT A PERSON READS IS SAID, NEVER PRINTED: a due day as a day, a signed amount as money, a figure in its format, and
 * a block this build cannot draw left out of the page rather than drawn as an apology.
 *
 * Three things the visual review found on screen (`loop/research-visual-review.md` #1, #3 and #11), each driven here
 * through the path that drew it: Today's Overdue and Coming up read `2026-07-01` over `[object Object]`; Money's "Out of
 * date" note read "from 20,690"; and Today's "Working now" was a tile saying it could not be drawn.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { DEFAULT_HOME, homeDrawn } from '../home/default-home.ts';
import { display } from './api.ts';
import { toSegments } from './blocks.ts';
import { readBlock } from './fixtures/readers.ts';
import { NOW } from './fixtures/sample.ts';
import { blockOf, liveWords, resolverOf } from './page-live.ts';
import { noteOf } from './metrics.ts';
import { emptyHidden } from '../page/home.ts';

const ISO = /\b\d{4}-\d{2}-\d{2}\b/u;

/** Every cell a block's drawn fences hold, as the renderer is handed them. */
const cellsOf = (segments: ReturnType<typeof toSegments>): string[] =>
  segments.flatMap((s) => (s.type === 'block' ? ((s as { rows?: { cells: string[] }[] }).rows ?? []).flatMap((r) => r.cells) : []));

test('TODAY SAYS WHAT FALLS DUE AS DAYS AND SIGNED MONEY, in Overdue and in Coming up, as its rows were read', () => {
  /* TODAY'S OWN BLOCK, as the house page declares it, read by the record and drawn by Home: the rows `blockOf` said by
     hand were said again from the raw fields by the fence, through a register nobody declares, and `String(v)` wrote
     the day as it is stored and the amount as an object. */
  /* BOTH BLOCKS OF IT, since Late reads what fell due on its own and Coming up the days from today (`default-home.ts`). */
  const declared = DEFAULT_HOME.blocks.filter((b) => b.source === 'deadlines');
  assert.equal(declared.length, 2, 'Today no longer reads what is late and what comes up');
  const reads = declared.map((b) => readBlock(b));
  for (const read of reads) assert.deepEqual(read.refusals, []);
  assert.ok(reads.every((read) => read.entries.length > 0), 'the sample has nothing late or coming up, so this asks nothing');

  const { blocks } = homeDrawn(reads, NOW);
  const due = blocks.filter((b) => b.drawn && b.source === 'deadlines');
  assert.equal(due.length, 2, 'Late and Coming up are not both drawn');
  const read = reads[0]!;

  const day = read.columns.findIndex((c) => c.field === 'day');
  const amount = read.columns.findIndex((c) => c.field === 'amount');
  for (const b of due) {
    const drawn = toSegments(b);
    const cells = cellsOf(drawn);
    assert.ok(cells.length > 0, `${b.heading} drew no rows`);
    assert.ok(!cells.some((c) => c.includes('[object Object]')), `${b.heading}: ${cells.join(' | ')}`);
    assert.ok(!cells.some((c) => ISO.test(c)), `${b.heading} prints a stored day: ${cells.join(' | ')}`);
    /* AND THE FENCE SAYS EXACTLY WHAT THE ROWS WERE READ AS, cell for cell, so the two cannot drift again. */
    const rows = drawn.flatMap((s) => (s.type === 'block' ? ((s as { rows?: { cells: string[] }[] }).rows ?? []) : []));
    b.rows.forEach((row, n) => {
      assert.equal(rows[n]?.cells[day]?.trim(), row.cells[day] ?? '', `${b.heading} row ${n}'s day`);
      assert.equal(rows[n]?.cells[amount]?.trim(), row.cells[amount] ?? '', `${b.heading} row ${n}'s amount`);
    });
  }
  /* EACH AMOUNT CARRIES ITS SIGN, AND EACH DAY READS AS ONE. */
  const said = due.flatMap((b) => b.rows);
  assert.ok(said.some((r) => /^[+−]/u.test(String(r.cells[amount] ?? ''))), 'no amount is signed');
  assert.ok(said.every((r) => r.cells[day] === null || /^\d{1,2} [A-Z][a-z]{2} \d{4}$/u.test(String(r.cells[day]))), said.map((r) => r.cells[day]).join(', '));
});

test('A VALUE NO FIELD DECLARES IS SAID BY ITS SHAPE, never as [object Object] or a stored day', () => {
  assert.equal(display('deadlines', 'amount', { amount: 919000, currency: 'GBP' }), display('obligations', 'amount', { amount: 919000, currency: 'GBP' }));
  assert.equal(display('deadlines', 'day', '2026-07-01'), '1 Jul 2026');
  assert.equal(display('deadlines', 'what', { nothing: 'to say' }), null);
  assert.equal(display('deadlines', 'title', 'Legal review, February'), 'Legal review, February');
  assert.equal(display('deadlines', 'n', 3), '3');
});

test('A FIGURE THAT IS A DAY IS WRITTEN AS ONE IN A NOTE, and Money says when its oldest balance is from', () => {
  /* `cash-as-of` is a day held as whole days since 1970, sent by the record as the bare number. */
  const values = { 'cash-as-of': 20_690, 'cash-accounts': 3 };
  const resolve = resolverOf(values);
  assert.equal(resolve('cash-as-of'), '25 Aug');
  assert.equal(resolve('cash-accounts'), '3');
  const body = "The oldest balance in Cash now is from {{cash-as-of}}. Update it so this page starts from today's money.";
  assert.equal(body.replace(/\{\{\s*([a-z][a-z0-9_-]*)\s*\}\}/gu, (_, id: string) => resolve(id) ?? '—'), "The oldest balance in Cash now is from 25 Aug. Update it so this page starts from today's money.");
  assert.equal(noteOf('in {{cash-accounts}} account(s), as of {{cash-as-of}}', resolve), 'in 3 accounts, as of 25 Aug');
});

test('A FIGURE THAT IS A COUNT IS LEFT A COUNT IN A NOTE, so Money\'s lead says its unit once', () => {
  /* `runway-days` is declared in `days`, which `format` writes as "12 days"; the lead names the unit itself. */
  const resolve = resolverOf({ 'runway-days': 12, 'cash-accounts': 1 });
  assert.equal(noteOf('it runs out in {{runway-days}} day(s), in {{cash-accounts}} account(s).', resolve), 'it runs out in 12 days, in 1 account.');
});

test('A BLOCK THIS BUILD CANNOT DRAW IS LEFT OUT OF A PAGE BEING READ, and kept for whoever is arranging it', () => {
  /* A walk the record did not send: the block keeps the line saying it cannot be drawn, so a page being arranged or
     previewed still shows it and it can be moved or taken off; the page being read leaves it out (`home.ts`). */
  const answer = { kind: 'forecast', source: 'forecast.runway', rows: [], matched: 0, refusals: [] };
  const read = blockOf(answer as never, new Map(), NOW);
  assert.equal(read.drawn, true);
  assert.equal(read.cannot, liveWords.cannot);
  assert.equal(emptyHidden([read])[0]?.drawn, false, 'a reader was shown a tile saying it cannot be drawn');
  /* AND TODAY DRAWS NOTHING IN ITS PLACE: Home keeps the block's place and leaves it undrawn. */
  const { blocks } = homeDrawn([{ ...read, kind: 'table', source: 'sessions.live', heading: 'Working now' }], NOW);
  assert.equal(blocks[0]?.drawn, false);
});
