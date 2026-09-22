/**
 * The month written as a name, `43 §4.3`'s `MON` token.
 *
 * WHY THIS FILE EXISTS: HSBC Egypt's general account line dates itself `16AUG26`, and until this token the
 * grammar had no way to say so. `DDMMMYY` reads as `DD`, `MM`, `M`, `YY`: two month tokens, refused at
 * install as `DATE_FORMAT_INVALID`, so the wording landed `untriaged` however often it arrived
 * (`packages/seed/test/money-bank.test.ts`, measured on the day `aeef01c5` landed).
 *
 * `MON` AND NOT `MMM`, and the spelling is the point rather than a preference. `MMM DD YYYY` is `43 §9.3`'s
 * worked refusal for two month tokens, asserted in `date.test.ts` and again by `declare`'s own lint in the
 * kernel (`dateFormatFault`), which reads `MMM` as `MM` then `M`. Giving `MMM` a new meaning would reverse a
 * refusal three places hold. `MON` is the spelling Oracle's `TO_DATE` uses for the same thing, and no format
 * that installed before this token existed contained it as a literal, because `M` was already a token.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDate, scanDates } from '../src/date.ts';

type Row = [input: string, format: string, want: string | undefined];

const rows: Row[] = [
  /* The bank's own shape, and the reason the token exists. */
  ['From HSBC: 16AUG26 ATM Cash Withdrawal', 'DDMONYY', '2026-08-16'],
  ['01AUG26', 'DDMONYY', '2026-08-01'],
  /* ENGLISH THREE-LETTER MONTHS, IN ANY CASE: a bank that prints `Aug` and one that prints `AUG` are
     writing the same month, and the format is a declaration about shape, not about capitals. */
  ['16Aug26', 'DDMONYY', '2026-08-16'],
  ['16aug26', 'DDMONYY', '2026-08-16'],
  ['Aug 16 2026', 'MON DD YYYY', '2026-08-16'],
  ['16-Sep-2026', 'DD-MON-YYYY', '2026-09-16'],
  ['9 Dec 2026', 'D MON YYYY', '2026-12-09'],
  ['31JAN26', 'DDMONYY', '2026-01-31'],
  /* The calendar still decides, whatever spelled the month. */
  ['29FEB24', 'DDMONYY', '2024-02-29'],
  ['29FEB26', 'DDMONYY', undefined],
  ['31APR26', 'DDMONYY', undefined],
  /* NOT A MONTH IS NOT A DATE. `SEPT` is four letters, and `AUX` is three that name nothing. */
  ['16AUX26', 'DDMONYY', undefined],
  ['16SEPT26', 'DDMONYY', undefined],
  /* BOUNDED BY LETTERS WHERE THE NAME IS AT THE EDGE, the way a number is bounded by digits: `XAug 16 2026`
     is a word that happens to end in `aug`, and reading a month out of the middle of it invents one. */
  ['XAug 16 2026', 'MON DD YYYY', undefined],
  ['on Aug 16 2026.', 'MON DD YYYY', '2026-08-16'],
  ['116AUG26', 'DDMONYY', undefined],
  ['16AUG261', 'DDMONYY', undefined],
];

for (const [input, format, want] of rows)
  test(`month name: ${input} as ${format}`, () => {
    assert.equal(parseDate(input, format), want);
  });

test('EVERY MONTH OF THE TWELVE HAS ITS NAME, in calendar order', () => {
  const names = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  names.forEach((name, i) => assert.equal(parseDate(`01${name}26`, 'DDMONYY'), `2026-${String(i + 1).padStart(2, '0')}-01`, name));
});

test('every day in the text, in order, when the month is a name', () => {
  assert.deepEqual(scanDates('16AUG26 then 01SEP26', 'DDMONYY'), ['2026-08-16', '2026-09-01']);
});

test('A NAME IS STILL ONE MONTH TOKEN, so the format rules that were about ambiguity still hold', () => {
  /* `MON` beside `MM` is two months; `DMON` runs a one-or-two-digit day into a token, which `declare`
     refuses too (it reads `DMON` as `D` then `M`), so the two readers of a format agree about it. */
  for (const format of ['DDMONMMYY', 'DMONYY', 'DDMON'])
    assert.throws(
      () => parseDate('16AUG26', format),
      (err: unknown) => (err as { code?: string }).code === 'DATE_FORMAT_INVALID',
      format,
    );
  /* And the worked refusal of `43 §9.3` is unchanged: `MMM` is still `MM` then `M`. */
  assert.throws(() => parseDate('Aug 16 2026', 'MMM DD YYYY'), (err: unknown) => (err as { code?: string }).code === 'DATE_FORMAT_INVALID');
});
