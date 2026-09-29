/**
 * The `Table` primitive's props, in a `.ts` file so a consumer can import them as types.
 *
 * They live here rather than in `Table.svelte` because a type exported from a component's instance
 * script is not on the module's public surface — and the register grid, the declared page and the
 * shared page all need to build these shapes.
 */

import { type Column, type TableRow } from '../src/table.ts';
import { MISSING } from '../src/format.ts';

/*
 * `Column`, `TableRow`, `chunkRows` and `ariaSort` MOVED TO `../src/table.ts` AND ARE RE-EXPORTED
 * HERE. None of them was ever markup, and while they lived under `svelte/` the HTML renderer could
 * not read them, so it hand-rolled a second, smaller answer for the same primitive and the two
 * trees came apart. They keep their names here because six call sites across three packages import
 * them from this path, and moving a type is not a reason to touch six files.
 */
export { ariaSort, chunkRows, comparisonPlan, glyphColumn, intrinsicRows, TABLE_CHUNK, TABLE_ROWS_LABEL, type Column, type TableRow } from '../src/table.ts';

/**
 * What a host hands `Block` to make a `capture` real: the register, the line as typed and trimmed, and
 * what the new row inherits from the block's `where:`, by field, in the form the record stores.
 *
 * ONE SIGNATURE, WRITTEN HERE, because three components pass it down (`Block`, `Panel`, `Capture`) and a
 * host builds one, and a callback type copied into four places is four places to change the day the
 * line learns to carry a date.
 */
export type OnCapture = (register: string, text: string, inherited: Record<string, string>) => void;

/** One column of one row, as a phone card draws it. A card never holds an empty value, so `value` is text. */
export type CardCell = { column: Column; value: string };

/**
 * Which columns a phone card may draw, as indexes into `columns`, decided once for the table. `-1` is none.
 *
 * A PHONE CARD IS THE LEAD, THE FIGURE AND AT MOST TWO UNLABELLED VALUES. Every column with its label is a form per
 * row on a phone, and it puts "#", ids and missing marks in front of the one thing a reader scans a
 * list for, so a card draws only what a reader reads down the list by.
 *
 *   - the TITLE is the first column aligned to the start, because text and refs start and a
 *     quantity, a date or a count ends (13 §4.2);
 *   - the first line ENDS on the first figure, a column that never truncates, because a figure
 *     never truncates. A table with no figure has no mark, and nothing takes its place;
 *   - `start` and `end` are the columns the second line may take its values from, text at its start
 *     and quantities at its end, so a running balance still reads down one edge of the list.
 *
 * AN IDENTIFIER IS NEVER ON A CARD, and neither is a control. A column that truncates in the middle is
 * an identifier by the table's own declaration (`Column.truncate`), and so is one headed "#"; a row
 * picker's `hideLabel` says it is a control and not a value. The whole card is the row's target, so
 * neither has anything to add to it.
 */
export type CardPlan = { title: number; mark: number; start: number[]; end: number[] };

const isIdentifier = (c: Column): boolean => c.truncate === 'middle' || c.label.trim() === '#';

export function cardPlan(columns: readonly Column[]): CardPlan {
  const first = (test: (c: Column, i: number) => boolean) =>
    columns.findIndex((c, i) => !c.hideLabel && !isIdentifier(c) && test(c, i));
  const byText = first((c) => c.align !== 'end');
  const title = byText >= 0 ? byText : first(() => true);
  const mark = first((c, i) => i !== title && c.truncate === 'never');
  const start: number[] = [];
  const end: number[] = [];
  columns.forEach((c, i) => {
    if (i !== title && i !== mark && !c.hideLabel && !isIdentifier(c)) (c.align === 'end' ? end : start).push(i);
  });
  return { title, mark, start, end };
}

/** How many values the second line of a phone card holds at most, on a card 390px wide. */
export const CARD_VALUES = 2;

/** One row's phone card: its lead, its figure and the values on its second line, every one of them there to read. */
export type PhoneCard = { title: CardCell | null; mark: CardCell | null; start: CardCell[]; end: CardCell[] };

/**
 * A value a card can draw: text that is there, that is not the record's missing mark and that is not a
 * row's spoken number (`#12`), which is an id a person would never say about the row in front of them.
 */
const drawable = (value: string | null | undefined): value is string => {
  const t = value?.trim() ?? '';
  return t !== '' && t !== MISSING && !/^#\d+$/u.test(t);
};

/**
 * One row as a phone card draws it, from the table's plan.
 *
 * AN EMPTY VALUE IS DROPPED, NOT MARKED. On a grid a missing cell keeps its box and draws the mark,
 * because the column is still there above it; a card has no columns to keep, so the missing mark on it
 * would stand in for nothing. The second line takes the first
 * `CARD_VALUES` values that are there, in the table's column order, so a row with a blank note shows
 * its date and its balance rather than its date and a hole.
 *
 * A missing title or figure leaves its place empty rather than promoting the next column into it:
 * the lead of every card in one list is the same column, so a reader scanning the lead edge is never
 * reading two kinds of thing.
 */
export function cardCells(row: TableRow, columns: readonly Column[], plan: CardPlan = cardPlan(columns)): PhoneCard {
  const at = (i: number): CardCell | null => {
    const column = columns[i];
    const value = row.cells[i];
    return column && drawable(value) ? { column, value } : null;
  };
  const rest = [...plan.start, ...plan.end]
    .sort((a, b) => a - b)
    .map(at)
    .filter((c): c is CardCell => c !== null)
    .slice(0, CARD_VALUES);
  return {
    title: at(plan.title),
    mark: at(plan.mark),
    start: rest.filter((c) => c.column.align !== 'end'),
    end: rest.filter((c) => c.column.align === 'end'),
  };
}

/** Where the caret is, in data rows and columns. The header is not a row it can be on. */
export type Cell = { row: number; col: number };

/**
 * Where the grid's one tab stop goes next, or `null` when the key is not the grid's.
 *
 * THE GRID SHIPPED A ROVING TABINDEX AND NO ROVER. `role="grid"`, `role="gridcell"` on every cell,
 * exactly one of them `tabindex="0"` and no arrow handler anywhere in the component. The only
 * `onkeydown` it had was `Enter` on a cell that could be activated. Two of its six callers bring
 * their own arrows; the other four do not, and on those four a keyboard user tabbed to cell (0,0)
 * and tabbed straight back out, every other cell in the table unreachable. The component's own
 * comment claimed the opposite in the present tense: *"a composite widget with one tab stop, arrow
 * keys inside it, and a caret a screen reader can follow along a row."* One tab stop is the whole
 * argument for `role="grid"` over `role="table"`, and at 500 rows by 8 columns it is the difference
 * between one tab stop and four thousand. It is a bargain the reader only wins if the arrows
 * are there to spend it on.
 *
 * Here rather than inside the component for the reason `chunkRows` is here: none of it is markup,
 * and a caret that walks off the end of a row is not visible in a rendered tree.
 *
 * IT CLAMPS AND DOES NOT WRAP, which is `moveTick`'s rule and `board.ts`'s: under wrapping the
 * cheapest possible slip, one press too many, becomes the largest possible move. The clamp is not
 * a `null` either: the arrow is swallowed at the edges too, so the last press before the end of a
 * row does not suddenly scroll the page instead of moving the caret.
 *
 * `Home` AND `End` ARE THE ROW'S ENDS, not the grid's, because a row here has columns to be at the
 * end of. That is what the register grid has always bound them to, and what the APG grid pattern
 * asks for; the whole-grid ends are the same keys with a modifier, which belong to whoever owns
 * the page rather than to one block on it.
 *
 * `from` is clamped before it is moved, so a caller whose caret is parked outside a table that has
 * since got smaller is brought back inside by the first press rather than left with nowhere to go.
 */
export function moveCell(from: Cell, key: string, rows: number, cols: number): Cell | null {
  if (rows <= 0 || cols <= 0) return null;
  const lastRow = rows - 1;
  const lastCol = cols - 1;
  const at = {
    row: Math.max(0, Math.min(Number.isFinite(from.row) ? Math.floor(from.row) : 0, lastRow)),
    col: Math.max(0, Math.min(Number.isFinite(from.col) ? Math.floor(from.col) : 0, lastCol)),
  };
  switch (key) {
    case 'ArrowDown':
      return { ...at, row: Math.min(at.row + 1, lastRow) };
    case 'ArrowUp':
      return { ...at, row: Math.max(at.row - 1, 0) };
    case 'ArrowRight':
      return { ...at, col: Math.min(at.col + 1, lastCol) };
    case 'ArrowLeft':
      return { ...at, col: Math.max(at.col - 1, 0) };
    case 'Home':
      return { ...at, col: 0 };
    case 'End':
      return { ...at, col: lastCol };
    default:
      return null;
  }
}
