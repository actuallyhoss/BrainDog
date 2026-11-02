/**
 * What the `table` primitive decides, as types and functions both drawers read.
 *
 * WHY THIS FILE EXISTS, AND IT IS THE LARGEST HOLE THIS PACKAGE HAD. Every other primitive keeps
 * its decision out of the markup so two drawers cannot reach two answers: `feed.ts`, `cards.ts`,
 * `queue.ts`, `split.ts` and the rest. `table` never did. `Table.svelte` worked its own answer out
 * from props and `toHTML` hand-rolled a second, smaller one, and `parity.test.ts` had no
 * `comparison` shape to notice, so the two renderers drew genuinely different trees for the
 * primitive that carries most of the record: a scroll region on one side and none on the other, a
 * `rowgroup` on one side and none on the other, `data-align` and `data-truncate` on every cell of
 * one and neither on the other, and two spellings of the same `--cols` track list. Everything
 * `blocks.css` hangs off those attributes was therefore styled on one surface and not on the other.
 *
 * WHAT IS HERE IS WHAT BOTH CAN HONOUR. A declaration's columns, the chunking, the region's name
 * and what a header announces about sorting are all facts about the table, so they are decided
 * once, here, and read by both. What is NOT here is the one thing only a live component can keep:
 * see `ROVING TAB STOP` below.
 *
 * ROVING TAB STOP, AND WHY THE STATIC MIRROR DOES NOT CARRY IT. `Table.svelte` puts `tabindex="0"`
 * on exactly one cell and `-1` on every other, and moves it with the arrow keys. That pair is one
 * promise: there is a caret in this grid and the arrows move it. A static page has no key handler,
 * so a mirror that copied the attributes would offer a tab stop into a grid whose other cells can
 * never be reached, which is precisely the defect `Table.svelte`'s own comment records having just
 * fixed for four of its six callers. So the mirror carries the scroll region, which IS reachable
 * and IS scrollable with a keyboard, and carries no cell tab stop at all. `parity.test.ts` holds
 * the two trees equal with that one difference named, and asserts the difference is exactly that
 * and nothing else, so it cannot quietly grow.
 */

import type { CardRole } from './cards.ts';
import type { Tone } from './kinds.ts';
import { leadingCode, symbolFigure } from './format.ts';
import { type WrittenAmount, writeFigure } from './money.ts';
import { takeWorking } from './working.ts';
import { dayThisYear } from './timeline.ts';

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
  /**
   * This column carries the row's intent: the glyph sits at the head of its cells and its text takes
   * the intent's colour, so a register's state reads `⊘ open` in one place. A table that names no
   * such column puts the glyph at the head of its first value, as it always has.
   */
  tone?: boolean | undefined;
  /**
   * What this column is on a card, for a `cards` block (`src/cards.ts`). A table ignores it. Absent,
   * the page's evaluator places the column the way a phone card does: text first, a figure after.
   */
  as?: CardRole | 'chip' | undefined;
  /**
   * A COLUMN THAT GIVES UP ITS ROOM FIRST when the row is too wide for its space, from `most` down to `least` (widgets-
   * empty, 2 Nov): the Ledger's Category, so Payee and Account stay whole at 1280. Its track is what the row leaves it
   * (`tracksOf`), and `width` is kept for a host that draws no such track. Absent, the column is sized by `width` alone.
   */
  gives?: { least: string; most: string } | undefined;
  /**
   * How wide a column whose `width` is a share (`fr`) is let grow before a column that gives way loses any room. Only
   * read where some column `gives`; a share with no `room` leaves every track as declared.
   */
  room?: string | undefined;
};

export type TableRow = {
  /** A stable key, never an index — deep-linking a paged list needs one (19 §5). */
  key: string;
  cells: (string | null)[];
  /** From a column's `tone_when`, or from the row's own state. Reaches the DOM with its glyph. */
  tone?: Tone | undefined;
  href?: string | undefined;
  /** New since the table was last drawn, and tinted for a moment (`Row`'s `arrived`). */
  arrived?: boolean | undefined;
};

/**
 * What the scroll region is called when its host gave it no heading.
 *
 * The renderer's own word, here for the reason `QUEUE_CLEARED` is in `queue.ts`: this package
 * cannot import the app's `copy.ts`, and a labelled region with no label is an unnamed destination
 * in a screen reader's list. It was a bare string inside `Table.svelte`, which meant `toHTML` had
 * no way to say the same thing even once it grew a region to say it about.
 */
/**
 * WHETHER TWO ANSWERS DRAW THE SAME ROWS: the same keys in the same order, each row saying the same in every cell.
 *
 * A TABLE KEEPS THE ROWS IT DREW WHEN A NEW ANSWER SAYS NOTHING NEW (`Table.svelte`). Its rows are keyed and move with
 * `animate:flip`, and a keyed list that is handed another array measures every row before and after, which is two
 * layouts of the whole table: a list drawn from what the tab kept, then handed the same rows again as the record caught
 * up, spent 36 of its 69 ms on Back laying out 54 unchanged rows. Shallow on each row and on its cells, which are text.
 */
export function sameRows(a: readonly TableRow[], b: readonly TableRow[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as Record<string, unknown>;
    const y = b[i] as Record<string, unknown>;
    if (x === y) continue;
    const keys = Object.keys(x);
    if (keys.length !== Object.keys(y).length) return false;
    for (const k of keys) {
      if (k === 'cells') {
        const cx = x.cells as readonly unknown[];
        const cy = y.cells as readonly unknown[] | undefined;
        if (!Array.isArray(cy) || cx.length !== cy.length || cx.some((c, n) => c !== cy[n])) return false;
      } else if (x[k] !== y[k]) return false;
    }
  }
  return true;
}

export const TABLE_ROWS_LABEL = 'Rows';

/** A track that is one length, so it can be added up: `12ch`, `32px`, a `calc(...)`. */
const LENGTH = /^(?:\d+(?:\.\d+)?(?:ch|px|rem|em)|calc\(.*\))$/u;
/** The most of `minmax(least, most)` where the most is a length. */
const MOST = /^minmax\(\s*[^,]+,\s*(\d+(?:\.\d+)?(?:ch|px|rem|em))\s*\)$/u;

/**
 * THE TABLE'S `--cols`, one track a column and the row's actions after (`extra`), spelled once for both drawers.
 *
 * A COLUMN THAT GIVES (`gives`) TAKES WHAT THE ROW LEAVES IT: `clamp(least, (100% - every other column at its most) / n,
 * most)`, where a share counts at its `room`. A table is as wide as its columns or its space (`.table` in `blocks.css`),
 * so at a width where the rest fit it keeps its most, and below that it is cut before any other column is. Every other
 * track is a length or a `minmax` with a length at its top, else the tracks are drawn as declared.
 */
export function tracksOf(columns: readonly Column[], extra?: string): string {
  const plain = columns.map((c) => c.width).join(' ') + (extra ? ` ${extra}` : '');
  const giving = columns.filter((c) => c.gives !== undefined);
  if (giving.length === 0) return plain;
  const others: string[] = [];
  for (const c of columns) {
    if (c.gives) continue;
    const most = c.room ?? (LENGTH.test(c.width) ? c.width : MOST.exec(c.width)?.[1]);
    if (most === undefined) return plain;
    others.push(most);
  }
  if (extra) {
    if (!LENGTH.test(extra)) return plain;
    others.push(extra);
  }
  const left = `calc((100% - (${others.join(' + ')})) / ${giving.length})`;
  return columns.map((c) => (c.gives ? `clamp(${c.gives.least}, ${left}, ${c.gives.most})` : c.width)).join(' ') + (extra ? ` ${extra}` : '');
}

/**
 * How many rows share one `content-visibility` box.
 *
 * ~100, from the measurement in `Table.svelte`'s header: per-row containment fixes layout and then
 * produced 17 of 89 frames over 16.7 ms during scroll, against 0 of 89 for chunked. Here rather
 * than as a default in the component because the static mirror has to chunk identically or the two
 * trees differ by a `rowgroup` boundary on every hundredth row.
 */
export const TABLE_CHUNK = 100;

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
 * The height a group reserves before it has ever been laid out, so the scrollbar is honest from the
 * first paint: every box is reserved, CLS stays at or under 0.02.
 *
 * Shared because it is a string with a shape, and two renderers writing it by hand is two chances
 * to spell one of `--tr-h` or `--row-h` differently.
 */
export const intrinsicRows = (n: number): string => `contain-intrinsic-size: auto calc(${n} * var(--tr-h, var(--row-h)))`;

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
 * Here rather than in the component for the reason `moveCell` is: it is a decision with an answer,
 * and an attribute that is absent is not visible in a rendered tree.
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
 * Where the tone's glyph goes: the column that declares it carries the tone, and it is the column the
 * tone is ABOUT. On a register that is its deadline, so the dot sits beside the date that made the
 * row late or close. It sat in the state column, and a red dot beside "Open" or a
 * green one beside "Cancelled" said something the word beside it contradicted.
 *
 * A table that declares none keeps it at the head of its first VALUE, which is not always its first
 * column: the register leads with a row picker, and a glyph there qualifies a checkbox rather than a
 * row. Which column declares the tone is the host's to say, since only the host knows its fields.
 */
export function glyphColumn(columns: readonly Column[]): number {
  const declared = columns.findIndex((c) => c.tone);
  return declared >= 0 ? declared : Math.max(0, columns.findIndex((c) => !c.hideLabel));
}

/**
 * A `comparison` block's columns and rows, from its first row.
 *
 * ITS FIRST ROW IS ITS HEADER, which is what fixes the column count: a later row with more cells is
 * cut and one with fewer is filled with the record's missing mark, because a table whose width
 * changes per row is not a table. `null` when there is no first row at all, and BOTH renderers then
 * draw nothing rather than an empty grid: an empty `role="grid"` is a thing a screen reader stops
 * on and reads as "grid, 0 rows", which is a claim about a table nobody wrote.
 *
 * `minmax(0,1fr)` PER COLUMN, spelled exactly once. The two renderers each spelled this list and
 * spelled it differently (`minmax(0,1fr) minmax(0,1fr)` against `repeat(2, minmax(0, 1fr))`), which
 * computes the same and is not the same string, so the trees differed on every table there is.
 */
export function comparisonPlan(rows: readonly { cells: readonly (string | null)[] }[]): { columns: Column[]; rows: TableRow[] } | null {
  const [head, ...body] = rows;
  if (!head) return null;
  return {
    columns: head.cells.map((label, i) => ({ field: String(i), label: label ?? '', width: 'minmax(0,1fr)' })),
    rows: body.map((r, i) => ({ key: String(i), cells: head.cells.map((_, j) => r.cells[j] ?? null) })),
  };
}

/**
 * What one cell of a table holds, as a decision rather than as markup.
 *
 * A TABLE'S CELLS ARE VALUES, NOT PROSE, and that is the call this file makes plain. Every other
 * primitive runs its cells through `inline()`, because their cells are text a person wrote. This
 * one does not, and never has in the app: `Table.svelte` draws the string it is handed, so a
 * `comparison` cell reading `[Kiln](/r/things/1)` has always shown those characters on screen. The
 * mirror rendered it as a link, which is the app and the mirror disagreeing about what a table IS.
 * The app wins, because it is the surface people use and because the primitive's own contract says
 * so: its columns declare alignment, truncation and which one carries the tone, which are all
 * declarations about quantities, dates and identifiers (`13 §4.2`). A cell that needs to be a door
 * has `row.href`, and a host that needs more has `cellSnippet`.
 *
 * THE MISSING MARK IS PART OF THE ANSWER. A cell the row does not have is `null` and draws the
 * record's own mark; a cell the author left blank is blank. The mirror drew neither, so a table
 * with a hole in it had a hole that could not be seen.
 */
export type TableCellBody =
  | { kind: 'missing' }
  | { kind: 'symbol'; text: string; amount?: WrittenAmount }
  | { kind: 'coded'; sign: string; currency: string; rest: string; amount?: WrittenAmount }
  | { kind: 'text'; text: string };

/**
 * MONEY COMING IN, A CELL THE PAGE SIGNED "+" (`sign` on the column): the Ledger and the bills to tick off draw it in
 * the good colour, and a table's money column says it the same way (`data-sign="in"`). Money going out stays ink.
 */
export const cellIn = (body: TableCellBody): boolean => (body.kind === 'coded' ? body.sign === '+' : body.kind === 'symbol' && body.text.startsWith('+'));

/**
 * One cell, read once for both drawers: the working dot taken off its front, then the body.
 *
 * A MISSING CELL CARRIES NO DOT, which is not an oversight. `working: true` says an agent is on
 * this ROW, and the mark is put at the head of the row's title by the evaluator; a title that is
 * missing has nothing for the mark to qualify, so the mark would be a glyph floating beside a dash.
 *
 * MONEY IS READ ONCE AND WRITTEN ONCE, by the one writer (`money.ts`), when the host says the record's home: `home`
 * is its currency, `null` when the record has none, and `undefined` when the caller was never told, which keeps the
 * older spelling. A table is `exact`, every minor unit. The amount comes back as one of the shapes a drawer already
 * knows, a currency with a sign as `symbol` and one written by its code as `coded`, with its parts in `amount` for
 * a drawer that sets the fraction or the code quieter. Only a cell that is the stored form and nothing else is
 * money: `E£1,299`, `EGP 1,299` and a sentence with an amount in it are left exactly as they were.
 */
export function tableCellBody(value: string | null | undefined, home?: string | null, now?: number): { working: boolean; body: TableCellBody } {
  const taken = takeWorking(value ?? null);
  if (taken.text === null) return { working: false, body: { kind: 'missing' } };
  /* ONE WHOLE FIGURE, HOWEVER IT REACHED THE CELL (`writeFigure`): the stored form, one stored ungrouped, and one a
     host drew first are the same amount and are written the same way. */
  const amount = home === undefined ? null : writeFigure(taken.text, home ?? null, 'exact');
  if (amount) {
    const body: TableCellBody =
      amount.codePlace === 'before'
        ? { kind: 'coded', sign: amount.minus, currency: amount.code, rest: `${amount.whole}${amount.fraction}`, amount }
        : { kind: 'symbol', text: amount.text, amount };
    return { working: taken.working, body };
  }
  const symbol = symbolFigure(taken.text);
  if (symbol) return { working: taken.working, body: { kind: 'symbol', text: symbol } };
  const coded = leadingCode(taken.text);
  if (coded) return { working: taken.working, body: { kind: 'coded', ...coded } };
  /* A DAY IN THE READER'S YEAR WITHOUT THE YEAR (P22), "2 Sep" on People where it said "2 Sep 2026", where the host
     hands its clock. */
  return { working: taken.working, body: { kind: 'text', text: now === undefined ? taken.text : dayThisYear(taken.text, now) } };
}
