/**
 * WHICH ROWS OF A LONG TABLE ARE DRAWN: the ones on screen and a few either side, between two spacers that hold the
 * rest of the height.
 *
 * `Table.svelte` builds every row it is handed, and its own header says why that was the call: a virtualised scroll
 * breaks find-in-page and the scrollbar as a position cue. That held while a table took a page of 200. A list of 2,527
 * entries read a page at a time is 2,527 rows of controls by the end, and Ledger at 200 was already 9,212 pixels and
 * 1,529 buttons (`evidence-screens.md`). So past `ROWS_WINDOW_FROM` a table is drawn through
 * `svelte/p/RowsWindow.svelte`, which asks this file what to draw. The scrollbar stays honest, because the spacers add up
 * to the height every row would have taken; the screen reader's count stays honest, because every drawn row keeps its
 * own `aria-rowindex` and the grid keeps the whole `aria-rowcount`.
 *
 * PURE, AND IN PIXELS. Nothing here reads the DOM: the component measures a row and its scroller and hands the numbers
 * over, so the arithmetic can be held by a test without a browser.
 */

/**
 * HOW MANY ROWS A TABLE HOLDS BEFORE IT IS DRAWN THROUGH THE WINDOW. About four screens at the comfortable row height:
 * under it, every row is drawn as it always was and find-in-page reaches all of them; over it, building every row is
 * the cost the window exists to stop paying.
 */
export const ROWS_WINDOW_FROM = 120;

/** The rows drawn past each edge of the screen, so a quick scroll meets rows already there rather than a blank. */
export const ROWS_OVERSCAN = 3;

/** The height a row is taken to have before one has been measured: the comfortable density's (`ROW_H` in the app). */
export const ROW_PX = 44;

export type RowsWindowAsk = {
  /** How many rows (and group headings) there are in all. */
  count: number;
  /** One row's height in pixels. */
  rowPx: number;
  /** How far the first row's top is above the top of the screen, in pixels; 0 or less while the table starts below it. */
  top: number;
  /** The screen's height in pixels. */
  height: number;
  /** Rows drawn past each edge; `ROWS_OVERSCAN` when absent. */
  overscan?: number | undefined;
};

/** Draw rows `from` up to but not including `to`; `before` and `after` are the spacers' heights in pixels. */
export type RowsWindow = { from: number; to: number; before: number; after: number };

/* A WHOLE NUMBER AT OR OVER ZERO, whatever arrived. A count or a height is measured from a live page, and a NaN that got
   through would be a window that draws nothing and a spacer of NaN pixels. */
const whole = (n: number, fallback = 0): number => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback);

/**
 * The rows to draw for a screen at `top`, `height` tall: the ones it shows, `overscan` more either side, and never past
 * either end. A screen scrolled past the last row (the list grew shorter under it) draws the last screenful rather than
 * nothing, so the reader is never left looking at a spacer.
 */
export function windowOf(ask: RowsWindowAsk): RowsWindow {
  const count = whole(ask.count);
  const rowPx = Number.isFinite(ask.rowPx) && ask.rowPx > 0 ? ask.rowPx : ROW_PX;
  const overscan = ask.overscan === undefined ? ROWS_OVERSCAN : whole(ask.overscan);
  const height = Number.isFinite(ask.height) ? Math.max(0, ask.height) : 0;
  const top = Number.isFinite(ask.top) ? Math.max(0, ask.top) : 0;
  const shown = Math.max(1, Math.ceil(height / rowPx));
  const first = Math.min(Math.floor(top / rowPx), Math.max(0, count - shown));
  const from = Math.max(0, first - overscan);
  const to = Math.min(count, first + shown + 1 + overscan);
  return { from, to, before: from * rowPx, after: (count - to) * rowPx };
}

/**
 * Where to scroll so that row `index` is on screen, as a new `top`, or `null` when it already is. A caret moved by an
 * arrow key onto a row the window has not drawn asks this first, and the cell is focused once the row is there. The
 * row is brought to the nearer edge, as the browser's own `scrollIntoView({ block: 'nearest' })` does.
 *
 * `top` IS SIGNED HERE, unlike the window's: below zero while the table starts below the top of the screen, and the
 * answer is in the same terms, so `answer - top` is the scroll. Taken as 0, a table under a page's header would be
 * scrolled short by the header's height and its caret's row left below the screen.
 */
export function revealTop(ask: { index: number; rowPx: number; top: number; height: number }): number | null {
  const rowPx = Number.isFinite(ask.rowPx) && ask.rowPx > 0 ? ask.rowPx : ROW_PX;
  const index = whole(ask.index);
  const top = Number.isFinite(ask.top) ? ask.top : 0;
  const height = Number.isFinite(ask.height) ? Math.max(rowPx, ask.height) : rowPx;
  const start = index * rowPx;
  if (start < top) return start;
  if (start + rowPx > top + height) return start + rowPx - height;
  return null;
}

/**
 * WHETHER A TABLE OF `count` ROWS IS DRAWN THROUGH THE WINDOW: past `ROWS_WINDOW_FROM`. A list that pages crosses it as
 * it reads, and the host switches then. Exported so the host and the test say the same count.
 */
export const windowed = (count: number): boolean => whole(count) > ROWS_WINDOW_FROM;
