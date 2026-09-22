/**
 * The `Table` primitive's props, in a `.ts` file so a consumer can import them as types.
 *
 * They live here rather than in `Table.svelte` because a type exported from a component's instance
 * script is not on the module's public surface — and the register grid, the declared page and the
 * shared page all need to build these shapes.
 */

import { type Column, type TableRow } from '../src/table.ts';

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

/**
 * Every column of a row, paired with the value the phone card draws for it.
 *
 * THE CARD DROPPED A CELL WHOSE VALUE WAS EMPTY. `{#if row.cells[i + 1]}` guarded each label-and-
 * value pair, so a blank cell took its label with it and the column vanished from the card
 * entirely, and a reader cannot tell a column that is empty from a column that is not there.
 * The grid arm of the same component draws the record's own missing mark in that box and the
 * card's own header says why it must: *"EVERY COLUMN, LABELLED … nothing hidden, nothing cut."*
 * `13 §10` is that a declaration decides what a card shows; dropping a pair for the value that
 * happens to be in it is the renderer deciding, once per row, differently each time.
 *
 * `?? null` AND NOT `?? ''`, because those are two different facts and the cell body draws them
 * differently: a cell the row does not have is missing and gets the mark, a cell the author left
 * blank is blank. It is the same reading the grid arm takes, so the two arms cannot disagree.
 */
export const cardCells = (row: TableRow, columns: readonly Column[]): CardCell[] =>
  columns.map((column, i) => ({ column, value: row.cells[i] ?? null }));

/** One column of one row, as a phone card draws it. */
export type CardCell = { column: Column; value: string | null };

/**
 * Which line of a phone card each column goes on, as indexes into `columns`. `-1` is none.
 *
 * THE CARD WAS ONE LINE PER COLUMN, AND ON A PHONE THAT WAS MOST OF THE PAGE. The first column led
 * and every other column was a label-and-value line of its own under it, so a four-column table was
 * a four-line card. Measured at 390 on the build of September 10th: `/p/money` was 6,267px against
 * 2,800px at 1440, and its forecast, "What is coming", was 1,615px for thirteen payments at 116 to
 * 144px each, `When`, `What`, `In and out` and `Balance` stacked in every one. The services table on
 * `/p/estate` was 2,329px for sixteen rows at 145px each. A running balance is the thing a phone
 * reader wants one payment at a time, and they were given a form per payment.
 *
 * SO A CARD IS TWO LINES, ARRANGED BY THE TWO RULES A TABLE ALREADY DECLARES (13 §4.2):
 *
 *   - the TITLE is the first column aligned to the start, because text and refs start and a
 *     quantity, a date or a count ends. It skips the register's `#`, which is aligned to the end,
 *     and a row picker, whose `hideLabel` already says it is a control and not a value;
 *   - the first line ENDS on the first figure, a column that never truncates, because a figure
 *     never truncates. Failing a figure, the first identifier, which truncates in the middle, and
 *     which is where `RowCards` has always put `#seq`;
 *   - EVERY OTHER COLUMN goes on the second line, labelled as it always was: text at its start,
 *     quantities at its end, so a running balance still reads down one edge of the list.
 *
 * NOTHING IS DROPPED, AND THAT IS WHY THIS NEEDS NO NEW KEY. `13 §10` gives a register card three
 * declared `mobile:` fields because that card SHOWS three and leaves the rest out, and choosing what
 * to leave out is a decision only the author can make. This leaves nothing out. Every column is
 * still on the card with its label; what changed is which line it sits on, and `05 §6` is that width
 * may change layout. A block that wanted fewer columns on a phone would need `06 §1.1` to grow a key,
 * and no block needs to.
 *
 * IT TAKES THE COLUMNS AND NOT A ROW, so the arrangement is decided once for the table and is the
 * same on every card. A row whose title is missing keeps its title slot and draws the missing mark
 * there; the next column is not promoted into it. Deciding per row from what happens to be in a cell
 * is the fault `cardCells` records above, where a blank value took its column off the card.
 */
export function cardPlan(columns: readonly Column[]): { title: number; mark: number; start: number[]; end: number[] } {
  const first = (test: (c: Column, i: number) => boolean) => columns.findIndex((c, i) => !c.hideLabel && test(c, i));
  const byText = first((c) => c.align !== 'end');
  const title = byText >= 0 ? byText : first(() => true);
  const byFigure = first((c, i) => i !== title && c.truncate === 'never');
  const mark = byFigure >= 0 ? byFigure : first((c, i) => i !== title && c.truncate === 'middle');
  const start: number[] = [];
  const end: number[] = [];
  columns.forEach((c, i) => {
    if (i !== title && i !== mark) (c.align === 'end' ? end : start).push(i);
  });
  return { title, mark, start, end };
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
