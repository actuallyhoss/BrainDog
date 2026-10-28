/**
 * WHAT A BLOCK MAY BECOME: the kinds that read the cells this block reads, so a table turns into cards and a
 * bar into a line from the block's own menu without a field named again.
 *
 * THE CELLS DECIDE, NOT THE PICTURE. Two families read a list's rows by `columns:` (`kinds/listed.ts`, `pages.ts`): the
 * kinds that draw one row of the list each, its fields as cells (table, cards, a to-do list, and a board or a calendar
 * where the fields fit), and the charts over those same rows (a bar and its parts of a whole, which read
 * `label | amount`; a line, which reads `day | amount`, the measure the record works out over time). A block that
 * writes its own rows (`authored:`, a fence) reads them by place, and only the kinds of its own primitive that read
 * the same cells in the same order are offered: label and value with settings, numbered steps with a timeline, code
 * with a tree, a bar with its parts of a whole.
 *
 * A CHART ONLY WHERE ITS FIELDS ARE NUMBERS OR DAYS. A bar's second column is an amount, and a line's first is a day and
 * its second an amount; a list of names and notes is never offered a chart that would draw nothing. A column's `type`
 * is the record's field type (`schema`), and a column whose type the caller does not know is never a number or a day.
 *
 * NEVER THE BLOCK'S OWN KIND, and never a kind a pack declares: a pack's kind names its own cells, which this table
 * cannot read. The answer is in the table's order below, so the menu lists the same kinds in the same order everywhere.
 */

import type { BlockKind } from './kind-spec.ts';
import type { Kind } from './kinds.ts';

/** One column of the block, as far as kindsFor reads it: its field, and the record's type for that field where known. */
export type KindColumn = { readonly field: string; readonly type?: string | undefined };

/** The record's field types that are an amount: a figure a bar can be as long as and a line can rise to. */
const NUMBERS: ReadonlySet<string> = new Set(['number', 'int', 'integer', 'money', 'amount', 'percent', 'count', 'duration']);

/** The record's field types that are a day: what a line runs along and a calendar places a row on. */
const DAYS: ReadonlySet<string> = new Set(['date', 'day', 'datetime', 'timestamp']);

/** The types a board's columns are: one of a closed set of values, which a card sits under. */
const STATES: ReadonlySet<string> = new Set(['enum', 'state']);

const typeAt = (columns: readonly KindColumn[], at: number): string => (columns[at]?.type ?? '').toLowerCase();
const isNumber = (columns: readonly KindColumn[], at: number): boolean => NUMBERS.has(typeAt(columns, at));
const isDay = (columns: readonly KindColumn[], at: number): boolean => DAYS.has(typeAt(columns, at));

/**
 * THE KINDS DRAWN FROM A LIST'S ROWS BY COLUMNS, each with what its columns must be.
 *
 * A board's first column is the state its cards sit under (`board.ts` `columnsOf`), and a calendar's second is the day
 * (`title | day`, `calendar.ts`). A bar or a split reads `label | amount`; a line reads `day | amount`, as the record's
 * measure of a list does (`pages.ts`, the `lines` arm).
 */
const LISTED: readonly { kind: Kind; fits: (columns: readonly KindColumn[]) => boolean }[] = [
  { kind: 'table', fits: (c) => c.length >= 1 },
  { kind: 'cards', fits: (c) => c.length >= 1 },
  { kind: 'todo', fits: (c) => c.length >= 1 },
  { kind: 'board', fits: (c) => c.length >= 2 && STATES.has(typeAt(c, 0)) },
  { kind: 'calendar', fits: (c) => c.length >= 2 && isDay(c, 1) },
  { kind: 'bar', fits: (c) => c.length >= 2 && isNumber(c, 1) },
  { kind: 'split', fits: (c) => c.length >= 2 && isNumber(c, 1) },
  { kind: 'lines', fits: (c) => c.length >= 2 && isDay(c, 0) && isNumber(c, 1) },
];

/**
 * THE KINDS THAT WRITE THEIR OWN ROWS AND READ THE SAME CELLS, by primitive (`kinds.ts`): each family's kinds read their
 * cells in the same order, so the rows the author wrote draw the same facts in the other.
 */
const AUTHORED: readonly (readonly Kind[])[] = [
  ['spec', 'params'],
  ['steps', 'timeline'],
  ['code', 'tree'],
  ['bar', 'split'],
];

const LISTED_KINDS: ReadonlySet<string> = new Set(LISTED.map((l) => l.kind));

/**
 * The kinds a block of `kind` over `columns` may be changed to, in the menu's order, never `kind` itself.
 *
 * `columns` EMPTY IS A BLOCK THAT WRITES ITS OWN ROWS, and its family is its primitive's (`AUTHORED`). A block with
 * columns whose kind no family names (a feed, a queue, a form) is offered nothing: what it reads is its own.
 */
export function kindsFor(kind: string, columns: readonly KindColumn[]): BlockKind[] {
  if (columns.length > 0 && LISTED_KINDS.has(kind)) return LISTED.filter((l) => l.kind !== kind && l.fits(columns)).map((l) => l.kind);
  if (columns.length > 0) return [];
  const family = AUTHORED.find((f) => (f as readonly string[]).includes(kind));
  return family ? family.filter((k) => k !== kind) : [];
}
