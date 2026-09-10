/**
 * The `Table` primitive's props, in a `.ts` file so a consumer can import them as types.
 *
 * They live here rather than in `Table.svelte` because a type exported from a component's instance
 * script is not on the module's public surface — and the register grid, the declared page and the
 * shared page all need to build these shapes.
 */

import type { Tone } from '../src/index.ts';

export type Column = {
  field: string;
  label: string;
  /**
   * A CSS track. DECLARED, never content-derived: `content-visibility` needs size containment,
   * `subgrid` is nullified by it, so one `--cols` track list on the grid root is what keeps the
   * header and the body in step. The reason the fast path exists is that pages are declared (22 §4).
   */
  width: string;
  /**
   * The header carries the name and does not SHOW it.
   *
   * For a column whose cells are a control rather than a value — a row picker — where a visible
   * heading would be a word wider than the column and a heading nobody reads. The name is still
   * there, because a column header with no name is an unnamed button in the tab order and an empty
   * `columnheader` in the tree, which is what the accessibility gate found the moment one existed.
   * A column like that is never sortable: there is nothing to sort by.
   */
  hideLabel?: boolean | undefined;
  /** Quantities, dates and counts end; text and refs start (13 §4.2). */
  align?: 'start' | 'end' | undefined;
  /**
   * Text truncates at the end; an IDENTIFIER truncates in the middle, keeping prefix and suffix;
   * a FIGURE NEVER TRUNCATES, because a truncated figure is not shortened, it is wrong.
   */
  truncate?: 'end' | 'middle' | 'never' | undefined;
};

export type TableRow = {
  /** A stable key, never an index — deep-linking a paged list needs one (19 §5). */
  key: string;
  cells: (string | null)[];
  /** From a column's `tone_when`, or from the row's own state. Reaches the DOM with its glyph. */
  tone?: Tone | undefined;
  href?: string | undefined;
};

/**
 * The rows in groups, for the chunked `content-visibility` the measurement above bought.
 *
 * Here rather than inside the component because the step is the one number in that file that can be
 * wrong in a way nothing catches: `chunk={0}` is `i += 0`, a loop with no end, running during
 * render. The tab froze with no error and nothing on screen to say which component did it.
 *
 * The step is also the row index's unit — `aria-rowindex` is `group * step + i` — so the two cannot
 * be allowed to disagree, which is the second reason this is one function.
 */
export function chunkRows<T>(rows: readonly T[], size: number): { step: number; groups: T[][] } {
  const step = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : 1;
  const groups: T[][] = [];
  for (let i = 0; i < rows.length; i += step) groups.push(rows.slice(i, i + step));
  return { step, groups };
}

/**
 * What a column header announces about sorting, which for most of them is NOTHING.
 *
 * `aria-sort="none"` WAS ON EVERY VISIBLE HEADER OF EVERY TABLE. It does not mean "this column is
 * not involved in sorting"; it means "this column is sortable and is not the one currently
 * sorted", so it is the attribute that tells a screen-reader user there is a control here to
 * press. Five of the six callers of `Table` pass no `onsort` at all and the sixth passes one only
 * once it has two rows to put in an order, so on a `comparison` block, a shared page, a related
 * list and a saved view, every heading advertised a control that does not exist and the reader
 * spent the keystrokes finding out. The register's own call site had already written the sentence
 * down, *"eight header buttons over a single row, each announcing `aria-sort="none"`"*, as the
 * reason it withholds `onsort`, and withholding it did not withhold the claim.
 *
 * A COLUMN THAT IS SORTED STILL SAYS SO. The direction is a fact about the list the reader is
 * looking at and is true whether or not the control that set it is this header: a host can sort
 * from a URL, which is exactly what the register does with one row. So `undefined` is only for the
 * case where there is no sort on this column AND no way to ask for one.
 *
 * Here rather than in the component for the reason `moveCell` is here: it is a decision with an
 * answer, and an attribute that is absent is not visible in a rendered tree.
 */
export function ariaSort(
  column: Column,
  sort: { field: string; dir: 'asc' | 'desc' } | undefined,
  sortable: boolean,
): 'ascending' | 'descending' | 'none' | undefined {
  /* A column whose cells are a control is never sortable, and `hideLabel` is already the declaration
     for that, and it is the same one the header reads to decide it has no visible name. */
  if (column.hideLabel) return undefined;
  if (sort?.field === column.field) return sort.dir === 'asc' ? 'ascending' : 'descending';
  return sortable ? 'none' : undefined;
}

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
export const cardCells = (
  row: TableRow,
  columns: readonly Column[],
): { column: Column; value: string | null }[] =>
  columns.map((column, i) => ({ column, value: row.cells[i] ?? null }));

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
