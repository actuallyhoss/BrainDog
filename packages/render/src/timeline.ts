/**
 * Which rows of a `timeline` start a day, decided once for both renderers.
 *
 * A LEDGER READ NEWEST FIRST REPEATS ITS DAY DOWN THE COLUMN. Money's "What moved" drew `1 Oct` beside four payments in
 * a row, and the eye had to read the same date four times to find where the next day began. Where two rows next to
 * each other share a day, the timeline is grouped: each day is said once, as a small heading over its rows, and the
 * rows under it leave their own date blank so their titles still start on one line.
 *
 * ONLY WHEN SOMETHING REPEATS. A timeline whose every row has a day of its own (`3h ago`, `2d ago`) is already as short
 * as it can be, and a heading over each row would double its height to say nothing new, so it is drawn as it always
 * was. The day is the first cell as written, compared trimmed: the host wrote it, and two rows the host wrote the same
 * day for are on the same day. A blank day starts no group, and its row sits under the day above it.
 */

import { barFigures, readable, zeroFigure, type Home } from './format.ts';

/** For each row, the day to say over it, or null where it carries on the day above it (or the timeline is not grouped). */
export function timelineDays(rows: readonly { cells: readonly string[] }[]): (string | null)[] {
  /* Each row's day against the last day said above it, so a blank between two rows of one day does not say it twice. */
  const days = rows.map((r) => (r.cells[0] ?? '').trim());
  let last = '';
  const starts = days.map((d) => {
    const starts = d !== '' && d !== last;
    if (d !== '') last = d;
    return starts;
  });
  const grouped = days.some((d, i) => d !== '' && !starts[i]);
  if (!grouped) return days.map(() => null);
  return days.map((_, i) => (starts[i] ? (rows[i]!.cells[0] ?? '') : null));
}

const MONTH = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
/** A day as `format.ts`'s `day` says it, `1 Jul 2026`, standing alone in a cell. */
const SAID_DAY = new RegExp(`^(\\d{1,2} ${MONTH}) (\\d{4})$`, 'u');

/**
 * A day in the reader's own year said without it: `1 Jul 2026` is `1 Jul` in 2026, and stays whole in any other year.
 *
 * TODAY'S DATES ALL CARRIED "2026" (visual review 4), the year every one of them was in, as Kiln's axis already knew.
 * Only a cell that is nothing but a day: a title that names one keeps its words. UTC, as `day` writes it.
 */
export function dayThisYear(text: string, now: number = Date.now()): string {
  const m = SAID_DAY.exec(text.trim());
  return m && Number(m[3]) === new Date(now).getUTCFullYear() ? m[1]! : text;
}

/**
 * A `timeline` cell as it is drawn, for both renderers: an amount of nothing draws nothing, and a day this year drops
 * its year. "Wildcard certificate −£0" said a payment that is not one (visual review 4); what falls due with no money on
 * it is its title alone.
 */
export const timelineCell = (text: string | undefined, now?: number): string =>
  text === undefined ? '' : zeroFigure(text) ? '' : dayThisYear(text, now);

/**
 * A `timeline` title as it is drawn, for both renderers: a bank's line in capitals reads as words (`readable`, 2.A.8),
 * "GRANGEMOOR EVENTS, STAND DEPOSIT" as "Grangemoor Events, Stand Deposit". A cell that carries markup (a link, a hole)
 * is the author's, and is left as written.
 */
export const timelineTitle = (text: string | undefined): string =>
  text === undefined ? '' : /[[\]{}()`*_<>]/u.test(text) ? text : readable(bankLine(text));

/** A bank's own day at the head of its line, "22OCT26 " or "05OCT2026 ", with words after it. */
const BANK_STAMP = /^\d{1,2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}(?:\d{2})?\s+(?=\S)/u;

/** A till or branch number run onto a word in capitals, "TALLYCART1": three capitals or more, then up to four digits. */
const TILL = /(?<![\p{L}\p{N}])(\p{Lu}{3,})\d{1,4}(?![\p{L}\p{N}])/gu;

/**
 * A BANK'S CODES LEFT OFF ITS LINE (the audit of 25 October, Z13): the Ledger tile reads who was paid, and where nobody
 * is known, the bank's line, and that line drew "22OCT26 Phone Banking Transfer" and a shop's name ending in a till
 * number. The day is the column beside it, and the number a till adds to a shop's name is no part of the name. Only a
 * stamp with words after it, and only a number run onto a word in capitals, which a person does not type; the line as
 * the bank wrote it stays on the entry.
 */
function bankLine(text: string): string {
  const bare = text.replace(BANK_STAMP, '');
  return /\p{Ll}/u.test(bare) ? bare : bare.replace(TILL, '$1');
}

/**
 * A `rows` cell as it is drawn: the same, except that only money MOVING by nothing (`−£0`, `+£0`) is left out. A
 * balance of `£0` on a spec line is a fact about the thing, and saying nothing there would read as never measured.
 */
export const rowsCell = (text: string | undefined, now?: number): string =>
  text === undefined ? '' : zeroFigure(text, true) ? '' : dayThisYear(text, now);

/**
 * EVERY ROW'S THIRD CELL, AS A SET (the UI pass of 20 October, H16): each said by `timelineCell`, and where one amount
 * carries pence, every amount of its currency does, as a chart's figures are (`barFigures`). The Ledger read "−£2,500 …
 * −£964 −£39.61", whole pounds beside pence down one column. A cell that is no figure is left as it is said.
 */
export const timelineDetails = (rows: readonly { cells: readonly string[] }[], now?: number, home?: Home): string[] =>
  barFigures(
    rows.map((r) => timelineCell(r.cells[2], now)),
    home,
  );
