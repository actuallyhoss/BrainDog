/**
 * Lasts is one figure and the sentence that says why: how long the money lasts with nothing coming in, then the day that
 * ends on and what falls due then, and the day the walk with what comes in runs out only while there is one. It stood as
 * "Lasts past" a year away beside "79 days", two answers with nothing saying what each assumed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* WHAT EACH FIGURE IS: the page path no longer loads the build's tables (9e03fe8e7), a record says them with each block. */
import './declared.ts';
import { noteOf } from './metrics.ts';
import { tileOf } from './page-live.ts';

const NOTE =
  'If all money in stopped, {{every-month-in.names}} too, it lasts to {{lasts-no-income.on}}, when {{lasts-no-income.because}} is due. ' +
  'With what comes in it still runs out on {{runs-out-on}}.';

const cell = (value: number) =>
  ({
    metric: 'lasts-no-income',
    label: 'With no money coming in',
    note: NOTE,
    reading: { value, unit: null, rows: 4, held: 4, delta: null, why: '', met: true, refusals: [] },
  }) as never;

test('LASTS SAYS ITS DAYS, THE DAY THEY END ON AND WHAT FALLS DUE THEN, and the money in it counted as stopped', () => {
  const tile = tileOf(cell(79), {
    'every-month-in.names': 'Pay',
    'lasts-no-income.on': '2027-01-13',
    'lasts-no-income.because': 'House, part 3 of 36',
  });
  assert.equal(tile.value, '79 days');
  assert.equal(tile.label, 'With no money coming in');
  /* THE WALK WITH WHAT COMES IN NEVER GOES UNDER, so its sentence goes whole and the first keeps its full stop. */
  assert.match(tile.note, /^If all money in stopped, Pay too, it lasts to (?:Wed )?13 Jan(?: 2027)?, when House, part 3 of 36 is due\.$/u);
});

test('WHERE THE MONEY RUNS OUT EVEN WITH WHAT COMES IN, the second sentence says the day; with no money in to name, its clause goes', () => {
  const tile = tileOf(cell(40), { 'lasts-no-income.on': '2026-12-05', 'lasts-no-income.because': 'Rent', 'runs-out-on': '2026-12-20' });
  assert.match(tile.note, /^If all money in stopped, it lasts to (?:Sat )?5 Dec, when Rent is due\. With what comes in it still runs out on (?:Sun )?20 Dec\.$/u);
});

test('A NOTE OF ONE SENTENCE IS CUT BY ITS CLAUSES AS IT WAS, and a part of a figure is read as the figure is', () => {
  const said = (id: string) => ({ a: '3', 'b.names': 'Kiln' })[id] ?? null;
  assert.equal(noteOf('in {{a}} account(s), as of {{c}}', said), 'in 3 accounts');
  assert.equal(noteOf('{{b.names}} owes, {{c.on}} due', said), 'Kiln owes');
  /* A SENTENCE WITH NO FIGURE LEFT GOES WHOLE, and one with no figure in it at all stays. */
  assert.equal(noteOf('Lasts {{a}} day(s). Then {{c}} goes. Nothing else.', said), 'Lasts 3 days. Nothing else.');
});
