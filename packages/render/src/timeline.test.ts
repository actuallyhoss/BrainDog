/**
 * A ledger read newest first says each day once (`timeline.ts`), and a timeline whose days never repeat is left alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TIMELINE_BETWEEN, dayThisYear, rowsCell, timelineCell, timelineChip, timelineDays, timelineTitle, timelineWordy } from './timeline.ts';

const rows = (...days: string[]) => days.map((d) => ({ cells: [d, 'something'] }));

test('A DAY THAT REPEATS IS SAID ONCE, over the first of its rows', () => {
  assert.deepEqual(timelineDays(rows('1 Oct', '1 Oct', '30 Sep', '28 Sep', '28 Sep')), ['1 Oct', null, '30 Sep', '28 Sep', null]);
});

test('A TIMELINE WHOSE DAYS NEVER REPEAT IS NOT GROUPED, so no heading doubles its height', () => {
  assert.deepEqual(timelineDays(rows('3h ago', '2d ago', '5d ago')), [null, null, null]);
  assert.deepEqual(timelineDays(rows('1 Oct', '30 Sep', '1 Oct')), [null, null, null], 'the same day apart is not a run');
  assert.deepEqual(timelineDays([]), []);
});

test('A BLANK DAY STARTS NO GROUP and sits under the day above it; two blanks are not a run', () => {
  assert.deepEqual(timelineDays(rows('1 Oct', '1 Oct', '', '30 Sep')), ['1 Oct', null, null, '30 Sep']);
  assert.deepEqual(timelineDays(rows('', '', '1 Oct')), [null, null, null]);
  assert.deepEqual(timelineDays(rows('1 Oct', '', '1 Oct', '30 Sep')), ['1 Oct', null, null, '30 Sep'], 'a blank between two rows of a day does not say it again');
});

test('THE DAY IS COMPARED TRIMMED and said as the host wrote it, so `{{ago:}}` still goes through the inline renderer', () => {
  assert.deepEqual(timelineDays(rows('1 Oct ', '1 Oct')), ['1 Oct ', null]);
});

test('A DAY THIS YEAR DROPS ITS YEAR, and any other year, or a day inside words, is left as written', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  assert.equal(dayThisYear('1 Jul 2026', now), '1 Jul');
  assert.equal(dayThisYear('30 Aug 2026', now), '30 Aug');
  assert.equal(dayThisYear('28 Dec 2025', now), '28 Dec 2025');
  assert.equal(dayThisYear('Aiming for 20 Sep 2026', now), 'Aiming for 20 Sep 2026');
  assert.equal(dayThisYear('3h ago', now), '3h ago');
});

test('AN AMOUNT OF NOTHING IS NOT SAID on a timeline, and on rows only where it moves, since a balance of nothing is a fact', () => {
  const now = Date.UTC(2026, 9, 2, 12);
  for (const zero of ['−GBP 0.00', '+GBP 0.00', '−£0', '£0.00', 'GBP 0', 'JPY 0']) assert.equal(timelineCell(zero, now), '', zero);
  for (const said of ['−GBP 9,190.00', '−£0.01', '0', 'Wildcard certificate', '']) assert.equal(timelineCell(said, now), said, said);
  assert.equal(timelineCell(undefined, now), '');
  assert.equal(rowsCell('−£0', now), '');
  assert.equal(rowsCell('+GBP 0.00', now), '');
  assert.equal(rowsCell('£0', now), '£0', 'a balance of nothing stays');
  assert.equal(rowsCell('1 Jul 2026', now), '1 Jul');
});

/* The Ledger tile drew the bank's
   own codes as names, "22OCT26 Phone Banking Transfer" and a shop's name ending in a till number. The day column says
   the day, and a till number run onto a shouted name is no part of the name. */
test('A BANK LINE READS AS A NAME: its own date stamp and a till number run onto a shouted name are left off', () => {
  assert.equal(timelineTitle('22OCT26 Phone Banking Transfer'), 'Phone Banking Transfer');
  assert.equal(timelineTitle('05OCT2026 PHONE BANKING TRANSFER'), 'Phone Banking Transfer');
  assert.equal(timelineTitle('TALLYCART1'), 'Tallycart');
  assert.equal(timelineTitle('SWIFTCAB RIDE 2210'), 'Swiftcab Ride 2210', "a number apart is the bank's words, and kept");
  assert.equal(timelineTitle('WREN ABERNATHY HOLLOWAY'), 'Wren Abernathy Holloway');
  /* A PERSON'S OWN WORDS ARE KEPT: small letters, a short word, and a stamp that is the whole line. */
  assert.equal(timelineTitle('Rent2'), 'Rent2');
  assert.equal(timelineTitle('HMRC VAT Q3'), 'HMRC VAT Q3');
  assert.equal(timelineTitle('22OCT26'), '22OCT26');
});

test('A BANK LINE QUOTING AN INVOICE IS SAID WITHOUT IT: Ravensworth Ltd, never "Ravensworth Ltd INV 2026-038"', () => {
  assert.equal(timelineTitle('RAVENSWORTH LTD INV 2026-038'), 'Ravensworth Ltd');
  assert.equal(timelineTitle('PREFAB REF 88213'), 'Prefab');
  /* A REFERENCE WITH NO DIGIT IS A WORD OF THE NAME, and a person's own words are left as they are. */
  assert.equal(timelineTitle('TRANSFER TO TAX RESERVE'), 'Transfer to Tax Reserve');
  assert.equal(timelineTitle('Invoice ref 2026-1'), 'Invoice ref 2026-1');
});

test('A MOVE BETWEEN YOUR OWN ACCOUNTS WEARS THE MOVE, never the "?" of a line nobody filed', () => {
  const chip = timelineChip(TIMELINE_BETWEEN, 'Transfer to Tax Reserve');
  assert.equal(chip.unfiled, false);
  assert.equal(chip.between, true);
  assert.equal(chip.glyph, 'repeat');
});

/* A project's note drew its log on a phone as "Raise…" beside "first increase since launch": a sentence of detail took
   the line from the title. Such a detail is marked to go under its title there; a figure keeps its place. */
test('A DETAIL OF WORDS IS TOLD FROM A FIGURE, so a phone can put it under its title', () => {
  assert.equal(timelineWordy('first increase since launch'), true);
  assert.equal(timelineWordy('Hobnail cancelled'), true);
  assert.equal(timelineWordy('{{bad:not paid}} yet'), true);
  assert.equal(timelineWordy('+£2,400'), false);
  assert.equal(timelineWordy('EGP 467,915'), false);
  assert.equal(timelineWordy('£1,200 a month'), false);
  assert.equal(timelineWordy('Done'), false);
  assert.equal(timelineWordy(''), false);
});
