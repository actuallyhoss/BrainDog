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

import { barFigures, planFigures, readable, zeroFigure, type Home } from './format.ts';

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
export const timelineTitle = (text: string | undefined): string => {
  if (text === undefined) return '';
  const line = merchantStar(text);
  return bankCode(line) ?? (/[[\]{}()`*_<>]/u.test(line) ? line : readable(bankLine(line)));
};

/**
 * A CARD PROCESSOR'S STAR IS A SPACE (domains lane, 2 Nov): "GOOGLE *WORKSPACE" and "SQ *BLUE BOTTLE" are a bank line in
 * capitals with the processor's mark between its words, and the star read as markup, so the Ledger printed the line
 * as the bank wrote it. Only a line with no small letters, a star between two words of capitals; anything else is kept.
 */
function merchantStar(text: string): string {
  if (/\p{Ll}/u.test(text)) return text;
  return text.replace(/(?<=[A-Z0-9&'.])\s?\*\s?(?=[A-Z0-9])/gu, ' ');
}

/**
 * A BANK'S CODE IS NEVER PRINTED AS A NAME (Q15 of 29 October). A transfer the bank names only by the end of the account
 * it went to ("0140") reads as that account, and the code HSBC writes for a government payment ("NGOV_INTEGRATED 871606")
 * as what it is. Any other code in capitals joined by underscores is left off the line. `null` for a line that is words.
 * The bank's words stay on the entry, under "As the bank wrote it".
 */
export function bankCode(text: string): string | null {
  const bare = text.replace(BANK_STAMP, '').trim();
  const digits = /^[•*xX#-]*\s*(\d{3,6})$/u.exec(bare);
  if (digits) return `Account ending ${digits[1]}`;
  if (/^NGOV_INTEGRATED(?![A-Z0-9])/u.test(bare)) return 'Government payment';
  if (!/(?<![A-Za-z0-9])[A-Z]{2,}(?:_[A-Z0-9]+)+(?![A-Za-z0-9])/u.test(bare)) return null;
  const rest = bare.replace(/(?<![A-Za-z0-9])[A-Z]{2,}(?:_[A-Z0-9]+)+(?![A-Za-z0-9])\s*\d*/gu, '').trim();
  return rest === '' ? 'Bank payment' : readable(bankLine(rest));
}

/** A bank's own day at the head of its line, "22OCT26 " or "05OCT2026 ", with words after it. */
const BANK_STAMP = /^\d{1,2}(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2}(?:\d{2})?\s+(?=\S)/u;

/** A till or branch number run onto a word in capitals, "TALLYCART1": three capitals or more, then up to four digits. */
const TILL = /(?<![\p{L}\p{N}])(\p{Lu}{3,})\d{1,4}(?![\p{L}\p{N}])/gu;

/**
 * A BANK'S CODES LEFT OFF ITS LINE: the Ledger tile reads who was paid, and where nobody
 * is known, the bank's line, and that line drew "22OCT26 Phone Banking Transfer" and a shop's name ending in a till
 * number. The day is the column beside it, and the number a till adds to a shop's name is no part of the name. Only a
 * stamp with words after it, and only a number run onto a word in capitals, which a person does not type; the line as
 * the bank wrote it stays on the entry.
 */
function bankLine(text: string): string {
  const bare = text.replace(BANK_STAMP, '');
  if (/\p{Ll}/u.test(bare)) return bare;
  /* AND THE INVOICE A PAYMENT QUOTES (audit of 31 October, 25): "RAVENSWORTH LTD INV 2026-038" is Ravensworth Ltd, and
     the Ledger drew "Ravensworth Ltd INV 202…". Only a reference with a digit in it, at the end, after words of a name. */
  const named = bare.replace(BANK_REF, '').trim();
  return (named === '' ? bare : named).replace(TILL, '$1');
}

/** An invoice or a reference the bank's line ends on: `INV 2026-038`, `REF 88213`, `INVOICE NO. 41`. */
const BANK_REF = /\s+(?:INV(?:OICE)?|REF)(?:\s*NO)?\.?\s*[#:]?\s*[A-Z0-9][A-Z0-9/-]*\d[A-Z0-9/-]*$/u;

/**
 * A `rows` cell as it is drawn: the same, except that only money MOVING by nothing (`−£0`, `+£0`) is left out. A
 * balance of `£0` on a spec line is a fact about the thing, and saying nothing there would read as never measured.
 */
export const rowsCell = (text: string | undefined, now?: number): string =>
  text === undefined ? '' : zeroFigure(text, true) ? '' : dayThisYear(text, now);

/**
 * EVERY ROW'S THIRD CELL, AS A SET: each said by `timelineCell`, and where one amount
 * carries pence, every amount of its currency does, as a list's figures are (`barFigures`). The Ledger read "−£2,500 …
 * −£964 −£39.61", whole pounds beside pence down one column. A cell that is no figure is left as it is said.
 * A TIMELINE OF THREE CELLS IS WHAT FALLS DUE (`planFigures`): the same, and whole from a thousand up.
 */
export const timelineDetails = (rows: readonly { cells: readonly string[] }[], now?: number, home?: Home): string[] => {
  const cells = rows.map((r) => timelineCell(r.cells[2], now));
  /* AND A MONEY ROW KEEPS ITS PENCE WHATEVER ITS NEIGHBOURS (audit of 30 October, 20): the Ledger's one line waiting to
     clear read "−£2,500" over Every line's "−£2,500.00", the same amount said two ways on one page because the
     first list held no line with pence to pad it to. A ledger line is said to the penny, as `money` writes it. */
  return timelineRich(rows) ? barFigures(cells, home, true) : planFigures(cells, home);
};

/* ---- The money row: a chip, a line under the title, and each day's net ------------------------------------------ */

/**
 * A TIMELINE ROW MAY SAY MORE THAN ITS THREE CELLS, SINCE THE MONEY PAGES: `day | title | amount | under | under | chip`.
 * The fourth and fifth are the quiet line under the title, joined by a dot ("Outing · Credit card"), and the sixth is the
 * row's chip: a glyph name, a category colour, both, or `?` for a line nothing has filed yet. Every one is optional, so
 * a timeline of three cells draws exactly as it did.
 */
export const TIMELINE_UNDER = [3, 4] as const;
export const TIMELINE_CHIP = 5;

/** The dot the line under a title is joined by, as a todo's two facts are. */
export const TIMELINE_JOIN = ' · ';

/** The colours a chip may name, the category slots (`--cat-*`), as a split's part names them. */
const CHIP_COLOURS = ['blue', 'violet', 'pink', 'teal', 'sky', 'yellow', 'lime', 'slate'] as const;
export type TimelineChipColour = (typeof CHIP_COLOURS)[number];
const isColour = (w: string): boolean => (CHIP_COLOURS as readonly string[]).includes(w.toLowerCase());

/**
 * A CHIP WITH NO COLOUR OF ITS OWN TAKES ONE FROM WHAT THE ROW IS KEPT UNDER (its category, the first word of the line
 * under the title): the same word always the same slot, so every Groceries line wears one colour down a ledger and a
 * page of grey initials reads as kinds of spending at a glance. A row kept under nothing stays on the quiet fill.
 */
export function wordSlot(kept: string | undefined): TimelineChipColour | null {
  const word = (kept ?? '').trim().toLowerCase();
  if (word === '') return null;
  /* FNV-1a, so names that differ by a letter land on different slots rather than neighbours. */
  let h = 0x811c9dc5;
  for (const ch of word) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return CHIP_COLOURS[h % CHIP_COLOURS.length]!;
}

/** WHAT A "?" CHIP MEANS, said as its hint (2 Nov, a walk: imported lines drew it on the Money page's Ledger tile and
 * nothing said what it meant). `html.ts` and `List.svelte` both put it on the chip, and the Ledger's cards say the same. */
export const UNFILED_HINT = 'No category yet. Open the line to file it.';

/** A row's chip: the glyph it names, its colour, whether nothing has filed it, and the title's first letter. `between` is a
 * move between a person's own accounts (`TIMELINE_BETWEEN`), whose amount is no money in or out and so wears no colour. */
export type TimelineChip = { glyph: string | null; colour: TimelineChipColour | null; unfiled: boolean; letter: string; between?: true };

/**
 * THE CHIP OF A MOVE BETWEEN YOUR OWN ACCOUNTS (audit of 31 October, 25): such a line has no category because it is no
 * spending, and it wore the "?" of a line nobody had filed, its money in green as if it were income. A host writes this
 * one word in the chip's cell; it is drawn as the two arrows of a move, in the quiet slot, and its amount in ink.
 */
export const TIMELINE_BETWEEN = 'between';

/**
 * Whether a timeline draws the money row: any row says something past its third cell. A timeline that does not keeps
 * its date column and its one line a row, so a project's history reads as it always did.
 */
export const timelineRich = (rows: readonly { cells: readonly string[] }[]): boolean =>
  rows.some((r) => [...TIMELINE_UNDER, TIMELINE_CHIP].some((at) => (r.cells[at] ?? '').trim() !== ''));

/**
 * The line under a rich row's title: its day where the timeline does not head its days (a list of what is coming, each
 * on a day of its own), then the fourth and fifth cells, joined by a dot. Blank parts are left out, so no dot stands
 * alone.
 */
export function timelineUnder(cells: readonly string[], now: number | undefined, grouped: boolean): string {
  const day = grouped ? '' : timelineCell(cells[0], now);
  return [day, ...TIMELINE_UNDER.map((at) => cells[at] ?? '')]
    .map((c) => c.trim())
    .filter((c) => c !== '')
    .join(TIMELINE_JOIN);
}

/**
 * A rich row's chip, read from its sixth cell, words in any order: a colour from the category slots, `?` for a line
 * nothing has filed, and any other word a glyph's name (the drawer draws it only where the host has art for it). With
 * no glyph the chip carries the title's first letter or figure, as a person's initial stands where they have no picture.
 */
export function timelineChip(cell: string | undefined, title: string, kept?: string): TimelineChip {
  const words = (cell ?? '').trim().split(/\s+/u).filter(Boolean);
  if (words.length === 1 && words[0] === TIMELINE_BETWEEN) return { glyph: 'repeat', colour: 'slate', unfiled: false, letter: '⇄', between: true };
  const unfiled = words.includes('?');
  const colour = (words.find(isColour)?.toLowerCase() as TimelineChipColour | undefined) ?? (unfiled ? null : wordSlot(kept));
  const glyph = words.find((w) => w !== '?' && !isColour(w)) ?? null;
  const letter = /[\p{L}\p{N}]/u.exec(title)?.[0]?.toLocaleUpperCase('en') ?? '';
  return { glyph, colour, unfiled, letter };
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A day heading as it is drawn: `Mon 26 Oct`, the weekday in front of a day the cell gives whole, and the year only when
 * it is not the reader's. A heading the cell gives in other words (`Today`, `3d ago`) is said as the cell says it.
 */
export function timelineDayHead(text: string, now: number = Date.now()): string {
  const m = SAID_DAY.exec(text.trim());
  if (!m) return timelineCell(text, now);
  const [d, mon] = m[1]!.split(' ') as [string, string];
  const at = new Date(Date.UTC(Number(m[3]), MONTHS.indexOf(mon as (typeof MONTHS)[number]), Number(d)));
  return `${WEEKDAY[at.getUTCDay()]!} ${dayThisYear(text, now)}`;
}

/** A figure as a drawer was handed it: the words round its digits (its sign and currency), and its digits. */
const FIGURE = /^([^\d]*?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?([^\d]*)$/u;

type Read = { minor: bigint; places: number; unit: string };

/** One amount cell read for a day's sum, or null where it is no single figure in a currency. */
function figureOf(text: string): Read | null {
  const m = FIGURE.exec(text.trim());
  if (!m) return null;
  const before = m[1]!;
  const after = m[4]!;
  const minus = /[−-]/u.test(before);
  const unit = `${before.replace(/[+−-]/gu, '')}|${after}`;
  /* A figure with no currency is a count, and a count is no money to add. */
  if (unit.replace(/[\s|]/gu, '') === '' || /[+−-]/u.test(after)) return null;
  const places = (m[3] ?? '').length;
  const minor = BigInt(`${m[2]!.replace(/,/gu, '')}${m[3] ?? ''}`);
  return { minor: minus ? -minor : minor, places, unit };
}

const grouping = (digits: string): string => digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');

/**
 * EACH DAY'S NET, OVER THE ROWS UNDER ITS HEADING: the amounts as they are drawn (`timelineDetails`), added where every
 * one is written in the same currency, and signed, `+£4,798.50` or `−£1,200.00`. Null for a row that heads no day, a
 * day of one line (its net is the line beside it), a day that nets to nought, and a day whose amounts are in two currencies or are not figures:
 * two currencies are never one sum.
 */
export function timelineNets(days: readonly (string | null)[], details: readonly string[]): (string | null)[] {
  return days.map((day, i) => {
    if (day === null) return null;
    let end = i + 1;
    while (end < days.length && days[end] === null) end++;
    const said = details.slice(i, end).filter((d) => d.trim() !== '');
    /* A DAY THAT NETS TO NOUGHT SAYS NOTHING: money moved between your own accounts read "£0.00" over its two lines. */
    const net = said.length < 2 ? null : figureSum(said, true);
    return net !== null && /[1-9]/u.test(net) ? net : null;
  });
}

/**
 * AMOUNTS AS THEY ARE DRAWN, ADDED, or null where any is not a figure in a currency or two currencies stand among them:
 * two currencies are never one sum. Written in the first one's spelling of its currency, at the most decimal places any
 * of them has; `signed` puts a `+` in front of a sum above nought, as money coming in is written.
 */
export function figureSum(said: readonly string[], signed = false): string | null {
  if (said.length === 0) return null;
  const read = said.map(figureOf);
  if (read.some((r) => r === null)) return null;
  const figures = read as Read[];
  const unit = figures[0]!.unit;
  if (figures.some((f) => f.unit !== unit)) return null;
  const places = Math.max(...figures.map((f) => f.places));
  const sum = figures.reduce((total, f) => total + f.minor * 10n ** BigInt(places - f.places), 0n);
  const size = (sum < 0n ? -sum : sum).toString().padStart(places + 1, '0');
  const whole = grouping(size.slice(0, size.length - places));
  const fraction = places > 0 ? `.${size.slice(size.length - places)}` : '';
  const [before, after] = unit.split('|') as [string, string];
  const sign = sum > 0n ? (signed ? '+' : '') : sum < 0n ? '−' : '';
  return `${sign}${before}${whole}${fraction}${after}`;
}

/** Whether an amount as drawn is money coming in, written with a `+` in front: the one amount a ledger draws in colour. */
export const timelineIn = (text: string): boolean => /^\+/u.test(text.trim());

/**
 * WHETHER A ROW'S DETAIL IS WORDS RATHER THAN A FIGURE: two words or more once the figures, the currency and the inline
 * marks are left out ("first increase since launch", "Hobnail cancelled", not "£2,400", "EGP 467,915" or "£1,200 a
 * month"). On a phone such a detail goes under its title (`kinds/timeline.css`), where beside it a sentence had left the
 * title one word and an ellipsis ("Raise…"); a figure keeps its place at the line's end.
 */
export function timelineWordy(text: string): boolean {
  const words = text.replace(/\{\{\s*[\w-]+\s*:|\}\}/gu, ' ').match(/\p{L}{2,}/gu) ?? [];
  return words.length >= 2;
}
