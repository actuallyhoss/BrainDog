/**
 * The inspector's clock fields, read as text, because the sheet is a `.svelte` file and this runner is `node --test`
 * (the move `canvas-page.test.ts` makes on the page, for the same reason).
 *
 * MEASURED RED AT `896dd8b`. The "How often" list was `flow.ts`'s `EVERY`, 15m to 1w, and every pick went
 * through `clockOf`, so a monthly rule opened with no field for its day, its time or its month, and a pick of another
 * clock dropped all three. `calendar.ts` holds what is offered and how a pick is written, and
 * `inspector-monthly.test.ts` holds that to the record; this holds the sheet to `calendar.ts`, so the list the record is
 * measured against is the list a person is shown.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHEET = readFileSync(fileURLToPath(new URL('./Inspector.svelte', import.meta.url)), 'utf8');
const markup = SHEET.slice(SHEET.indexOf('</script>'), SHEET.indexOf('<style>'));

test('THE CLOCK IS PICKED FROM `calendar.ts` AND WRITTEN THROUGH IT, never through `clockOf`, which keeps a day for a week alone', () => {
  assert.match(markup, /\{#each CLOCKS as /u, 'the How often list is not CLOCKS');
  assert.doesNotMatch(markup, /\bEVERY\b/u, 'the How often list still reads EVERY, which stops at a week');
  assert.doesNotMatch(markup, /\bclockOf\(/u, 'a pick still goes through clockOf, which drops a day of the month and a month');
});

test('A CLOCK OF MONTHS DRAWS ITS TIME, ITS DAY OF THE MONTH AND, ABOVE ONE MONTH, THE MONTH IT COUNTS FROM', () => {
  for (const id of ['flow-at', 'flow-date', 'flow-month']) assert.match(markup, new RegExp(`id="${id}"`, 'u'), `no field ${id}`);
  assert.match(markup, /\{#each MONTH_DAYS as /u, 'the day of the month is not picked from MONTH_DAYS');
});

/* THE WIRING BETWEEN THE FIELDS AND `clockTo` WAS HELD BY NOTHING. Measured: with
   `setClock` passing the patch alone to `clockTo`, which is the day-and-time-dropping pick this change exists to end,
   with it keeping the old `every` on a pick, and with the month field drawn for a year alone, all six tests above and
   in `inspector-monthly.test.ts` stayed green, because `clockTo` was tested and the sheet's call to it was not. */
test('EVERY CLOCK FIELD WRITES THROUGH `setClock`, and `setClock` writes the new clock from the whole of the clock it was', () => {
  const script = SHEET.slice(0, SHEET.indexOf('</script>'));
  assert.match(script, /clockTo\(patch\.every \?\? t\.every, \{ \.\.\.clock, \.\.\.patch \}\)/u, 'setClock does not write the picked clock from the whole of the one it was');
  for (const [id, key] of [['flow-every', 'every'], ['flow-month', 'month'], ['flow-date', 'day'], ['flow-at', 'at']])
    assert.match(markup, new RegExp(`id="${id}"[^\\n]*setClock\\(\\{ ${key}:`, 'u'), `${id} does not write its ${key} through setClock`);
  /* `month:` IS REQUIRED ABOVE ONE MONTH AND REFUSED ON ONE (`calendarFault`), so the field is drawn for exactly those. */
  assert.match(markup, /\{#if months > 1\}/u, 'the month field is not drawn for every clock of more than one month');
});
