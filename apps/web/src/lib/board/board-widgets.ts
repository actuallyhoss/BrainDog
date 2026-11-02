/**
 * A BOARD'S WIDGETS, read off the blocks the record drew (the widgets plan of 29 October, §3 and §4.4).
 *
 * WHICH BLOCKS ARE WIDGETS: every block of a board but its head (the page's line and the line a task is typed into), by
 * its key, at its size, or the size its kind takes first (`defaultSize`). The phone follows the laptop until somebody
 * arranges it there: its own order, its own sizes (a full is a wide anyway), and what it leaves out.
 *
 * AND HOW EACH IS DRAWN TO FIT ITS FRAME (§3.3): a widget shows what its size shows and says how many more, never
 * scrolling inside. The read is already cut by the record (`kinds/sizes.ts`); this cuts what is drawn to the frame.
 *
 * PURE, AND NO SVELTE.
 */

import { defaultSize, isWidgetSize, nearestSize, sizeShows, sizesOf, type WidgetSize } from 'braindog-render';

/** A board's phone arrangement, as the page declares it. */
export type Phone = { order?: readonly string[]; sizes?: Readonly<Record<string, WidgetSize>>; hidden?: readonly string[] };

/** One widget of the board: its key, its kind and its size on the laptop. */
export type Widget = { key: string; kind: string; size: WidgetSize; draft?: { by: string; why?: string } };

/** Whether a block is the board's head and never a widget (`packages/kernel/src/board.ts` `headOfBoard`). */
export const headOfBoard = (b: { kind?: unknown; lead?: unknown }): boolean => b.kind === 'capture' || (b.kind === 'note' && b.lead === true);

/** A block's size on the laptop: the one it declares if its kind takes it, else the nearest it takes. */
export function sizeOf(b: { kind: string; size?: unknown }): WidgetSize {
  return isWidgetSize(b.size) ? nearestSize(b.kind, b.size) : defaultSize(b.kind);
}

/** The board's widgets in the order declared, each named by its key and framed by its size. */
export function widgetsOf(blocks: readonly { kind: string; key?: string | undefined; size?: unknown; lead?: unknown; draft?: unknown }[]): Widget[] {
  return blocks.flatMap((b) => {
    /* A WIDGET IS A BLOCK WITH A SIZE (`board.ts`): a block a widget stands in for (the late money under Late) is not one. */
    if (headOfBoard(b) || typeof b.key !== 'string' || b.key === '' || b.size === undefined) return [];
    const d = b.draft as { by?: unknown; why?: unknown } | undefined;
    const draft = d && typeof d.by === 'string' ? { draft: { by: d.by, ...(typeof d.why === 'string' ? { why: d.why } : {}) } } : {};
    return [{ key: b.key, kind: b.kind, size: sizeOf(b), ...draft }];
  });
}

/** The phone's widgets: in its own order (any it does not name after, in the laptop's), at its sizes, less the hidden. */
/**
 * A WIDGET'S SIZE ON THE PHONE where the phone names none: the laptop's, but a Tall takes the phone's whole width, since
 * half of a phone cut a table's payee to one letter (audit 30 Oct, item 8). A table keeps its height too (Large); a list
 * of lines is Wide, so one line is not left in a tall empty box, and its "more" link says the rest.
 */
const WIDE_ROWS = new Set(['table']);

export function phoneSizeOf(w: Widget, named?: unknown): WidgetSize {
  if (isWidgetSize(named)) return nearestSize(w.kind, named);
  if (w.size !== 'tall') return w.size;
  const sizes = sizesOf(w.kind);
  const order: WidgetSize[] = WIDE_ROWS.has(w.kind) ? ['large', 'wide'] : ['wide', 'large'];
  return order.find((s) => sizes.includes(s)) ?? w.size;
}

export function phoneWidgets(laptop: readonly Widget[], phone: Phone | null | undefined): Widget[] {
  if (!phone) return laptop.map((w) => ({ ...w, size: phoneSizeOf(w) }));
  const by = new Map(laptop.map((w) => [w.key, w]));
  const named = (phone.order ?? []).filter((k) => by.has(k));
  const rest = laptop.map((w) => w.key).filter((k) => !named.includes(k));
  const hidden = new Set(phone.hidden ?? []);
  return [...named, ...rest]
    .filter((k) => !hidden.has(k))
    .map((k) => {
      const w = by.get(k)!;
      return { ...w, size: phoneSizeOf(w, phone.sizes?.[k]) };
    });
}

/** The kinds whose rows are drawn one a line, so a frame cuts them to what it shows. */
const LINES = new Set(['todo', 'timeline', 'table', 'spec', 'steps', 'link', 'feed', 'agents']);

type Fits = { kind: string; shown?: number | undefined; rows?: readonly unknown[]; entries?: readonly unknown[]; queue?: readonly unknown[] | undefined; kpis?: readonly unknown[] | undefined; most?: number | undefined; metrics?: readonly unknown[] | undefined };

/**
 * A block cut to what its frame shows (§3.3): its lines, its questions, its key numbers. What it held past that stays its
 * count (`matched`), which the block says as "N more". A NEW OBJECT ONLY WHERE SOMETHING IS CUT.
 */
export function fitted<B extends Fits>(b: B, size: WidgetSize, phone = false): B {
  const shows = sizeShows(b.kind, size);
  if (shows === null) return b;
  /* A PHONE'S QUESTION WRAPS TO THREE LINES, its answers under it, so a phone's frame holds one fewer. */
  const n = phone && b.queue && shows > 1 ? shows - 1 : shows;
  if (b.queue && b.queue.length > n) return { ...b, queue: b.queue.slice(0, n), most: n };
  if (b.kind === 'kpis' && b.kpis && b.kpis.length > n) return { ...b, kpis: b.kpis.slice(0, n) };
  /* AND THE BLOCK SAYS IT SHOWS `n` (`shown`), so its foot says what was left out: the week's weather laid wide drew 2
     of its 3 days on a laptop and no "1 more", since its count still said all 3 were shown (add-ons pass 3, 2 Nov). */
  if (LINES.has(b.kind) && b.rows && b.rows.length > n)
    return { ...b, rows: b.rows.slice(0, n), ...(b.entries ? { entries: b.entries.slice(0, n) } : {}), ...(typeof b.shown === 'number' && b.shown > n ? { shown: n } : {}) };
  return b;
}
