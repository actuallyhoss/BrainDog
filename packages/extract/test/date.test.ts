/**
 * Dates, row by row from `43 §9.3`.
 *
 * THE POINT OF EVERY ROW IS THAT THE DECLARATION DECIDES, NOT THE STRING. `29/08/26` is the 29th of August
 * under one format and nothing at all under another, and the package never prefers one because it looks
 * more likely. The rows that yield nothing matter as much as the rows that yield a day: a date read out of
 * the middle of a reference number is worse than a missing one, because a missing one is reviewed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDate, scanDates } from '../src/date.ts';

type Row = [input: string, format: string, want: string | undefined];

const rows: Row[] = [
  ['29/08/26', 'DD/MM/YY', '2026-08-29'],
  ['29/08/2026', 'DD/MM/YYYY', '2026-08-29'],
  ['08/29/2026', 'MM/DD/YYYY', '2026-08-29'],
  ['2026-08-29', 'YYYY-MM-DD', '2026-08-29'],
  ['9/8/26', 'D/M/YY', '2026-08-09'],
  ['29.08.2026', 'DD.MM.YYYY', '2026-08-29'],
  ['on 29/08/26.', 'DD/MM/YY', '2026-08-29'],
  ['129/08/26', 'DD/MM/YY', undefined],
  ['29/08/261', 'DD/MM/YY', undefined],
  ['31/02/26', 'DD/MM/YY', undefined],
  ['29/02/2024', 'DD/MM/YYYY', '2024-02-29'],
  ['29/02/2026', 'DD/MM/YYYY', undefined],
  ['29/08/26', 'MM/DD/YY', undefined],
  ['2026-08-29', 'DD/MM/YY', undefined],
  ['29082026', 'DDMMYYYY', '2026-08-29'],
];

for (const [input, format, want] of rows)
  test(`date: ${input} as ${format}`, () => {
    assert.equal(parseDate(input, format), want);
  });

test('A DAY THAT IS NOT IN THE CALENDAR IS NOT A DATE, leap years included', () => {
  /* Not a review, not a best guess: the 31st of February is not a day, and 2026 is not a leap year. A
     pipeline that accepts either writes a row whose date sorts into a month that never had it. */
  assert.equal(parseDate('31/02/26', 'DD/MM/YY'), undefined);
  assert.equal(parseDate('29/02/2100', 'DD/MM/YYYY'), undefined, '2100 is divisible by four and is not a leap year');
  assert.equal(parseDate('29/02/2000', 'DD/MM/YYYY'), '2000-02-29', '2000 is divisible by four hundred and is');
});

test('every day in the text, in order, so nth: has something to count', () => {
  assert.deepEqual(scanDates('1/1/26 and 2/2/26', 'D/M/YY'), ['2026-01-01', '2026-02-02']);
  assert.equal(scanDates('1/1/26 and 2/2/26', 'D/M/YY')[1], '2026-02-02');
});

test('a format that cannot be read is refused at first use, and says how to fix it', () => {
  /* `declare` lints these at install, so reaching them here means a declaration got in another way. The
     refusal names the path and the remedy and never a byte of the payload (`43 §6`). */
  for (const format of ['DD/MM', 'MMM DD YYYY', 'DMYYYY'])
    assert.throws(
      () => parseDate('29/08/2026', format),
      (err: unknown) => {
        const e = err as { code?: string; at?: string; fix?: string };
        assert.equal(e.code, 'DATE_FORMAT_INVALID');
        assert.equal(e.at, 'date.format');
        assert.ok(typeof e.fix === 'string' && e.fix.length > 0);
        return true;
      },
      format,
    );
});
