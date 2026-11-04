/**
 * THE SHAPE A PAGE LAST HAD, kept per record, page and width, so a page that is loading draws its real cards at their
 * real sizes before a word of the record has arrived (ui-perfect, 3 Nov; the owner: "proper skeleton loading ... accurate and
 * cached ... loading on the cards themselves").
 *
 * WHAT IS KEPT IS GEOMETRY, NEVER CONTENT: for each card its id, its height, how many rows it drew, the kind of
 * skeleton it wants and (for a page that keeps its layout, `ShapedPage.svelte`) where it stood. No title, no figure, no
 * name, so a shared device keeps nothing anybody could read. One localStorage entry, `bd_shapes`, at most 60 pages,
 * the oldest dropped first; every read and write is in a `try`, and a browser that keeps nothing draws the default
 * shape instead.
 *
 * Readers: `Loads.svelte` (one card's body), `ShapedPage.svelte` (a page's whole layout), `Tile` (`ready`).
 */

/** The skeleton a card wants while it loads: list rows, lines of text, a big figure, a row of chips, or a table. */
export type SkeletonKind = 'rows' | 'lines' | 'figure' | 'chips' | 'table';

/** One card as it was last drawn. `x`, `y`, `w` are kept only by a page that keeps its layout (`ShapedPage`). */
export type CardShape = {
  h: number;
  rows?: number | undefined;
  /** A shared kind (`SkeletonKind`), or a card's own (Today's `ask`, `cash`, ... drawn by `SkeletonCard.svelte`). */
  kind?: SkeletonKind | (string & {}) | undefined;
  x?: number | undefined;
  y?: number | undefined;
  w?: number | undefined;
  head?: boolean | undefined;
  /** The card's cell on a board's grid ("1 / 1 / 2 / 3"), for a board that keeps its cells (Today, `today-shape.ts`). */
  area?: string | undefined;
};

/** A page as it was last drawn: its cards, and for a kept layout the box's own width and height. */
export type PageShape = { at: number; w?: number | undefined; h?: number | undefined; cards: Record<string, CardShape>; order?: string[] | undefined };

const KEY = 'bd_shapes';
const VERSION = 1;
const MOST = 60;

type Store = { v: number; pages: Record<string, PageShape> };

let store: Store | null = null;
let dirty = false;
let writing: ReturnType<typeof setTimeout> | null = null;

function load(): Store {
  if (store) return store;
  try {
    const got = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null;
    store = got && got.v === VERSION && typeof got.pages === 'object' && got.pages !== null ? got : { v: VERSION, pages: {} };
  } catch {
    store = { v: VERSION, pages: {} };
  }
  return store;
}

function save(): void {
  dirty = true;
  if (writing !== null) return;
  /* ONE WRITE A SECOND AT MOST, AND WHEN THE BROWSER IS IDLE: a page that settles writes once, not once a card. */
  writing = setTimeout(() => {
    writing = null;
    if (!dirty || !store) return;
    dirty = false;
    const write = (): void => {
      try {
        const pages = Object.entries(store!.pages).sort((a, b) => b[1].at - a[1].at).slice(0, MOST);
        localStorage.setItem(KEY, JSON.stringify({ v: VERSION, pages: Object.fromEntries(pages) }));
      } catch {
        /* Full or blocked: the next load draws the default shape. */
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(write, { timeout: 2000 });
    else write();
  }, 1000);
}

/** The width band a shape is kept for: a card is not the same height on a phone and at a desk. */
export function band(width: number = typeof innerWidth === 'number' ? innerWidth : 1440): 'phone' | 'mid' | 'desk' {
  return width < 640 ? 'phone' : width < 1200 ? 'mid' : 'desk';
}

/**
 * The key a page's shape is kept under: the address's path (which carries the record's name where it has one) and the
 * width band. `id` names a part of a page that keeps its own shape (two `ShapedPage`s on one page).
 */
export function shapeKey(id = '', path: string = typeof location === 'undefined' ? '/' : location.pathname): string {
  return `${path.replace(/\/+$/u, '') || '/'}|${band()}${id ? `|${id}` : ''}`;
}

/** The page's last shape, or `null` when this device never drew it at this width. */
export function pageShape(key: string): PageShape | null {
  return load().pages[key] ?? null;
}

/** One card's last shape on the page `key`, or `null`. */
export function cardShape(key: string, id: string): CardShape | null {
  return load().pages[key]?.cards[id] ?? null;
}

const near = (a: number | undefined, b: number | undefined): boolean => (a ?? -1) === (b ?? -1) || (a !== undefined && b !== undefined && Math.abs(a - b) < 1);

/** Keeps one card's shape. A shape within a pixel of the kept one writes nothing. */
export function keepCard(key: string, id: string, shape: CardShape): void {
  const s = load();
  const page = (s.pages[key] ??= { at: Date.now(), cards: {} });
  const was = page.cards[id];
  if (was && near(was.h, shape.h) && was.rows === shape.rows && was.kind === shape.kind && near(was.x, shape.x) && near(was.y, shape.y) && near(was.w, shape.w)) return;
  page.cards[id] = shape;
  page.at = Date.now();
  save();
}

/** Keeps a whole page's layout at once (`ShapedPage`): its box, every card and their order. */
export function keepPage(key: string, shape: Omit<PageShape, 'at'>): void {
  const s = load();
  const was = s.pages[key];
  if (was && near(was.w, shape.w) && near(was.h, shape.h) && JSON.stringify(was.order) === JSON.stringify(shape.order) && JSON.stringify(was.cards) === JSON.stringify(shape.cards)) return;
  s.pages[key] = { ...shape, at: Date.now() };
  save();
}

/** Forgets every kept shape: a device handed to somebody else, or a sign-out. */
export function forgetShapes(): void {
  store = { v: VERSION, pages: {} };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing kept. */
  }
}

/**
 * HOW MANY ROWS A CARD DREW: the elements marked `data-row`, else the items of its first list or table. Capped at 12,
 * which is more than any card shows before its "more".
 */
export function rowsIn(el: Element): number | undefined {
  const marked = el.querySelectorAll('[data-row]').length;
  if (marked > 0) return Math.min(marked, 12);
  const list = el.querySelector('ul, ol, tbody');
  return list ? Math.min(list.children.length, 12) || undefined : undefined;
}

/**
 * THE LAST ANSWER THAT WAS THERE, while the next one is out: a screen that empties its value to `null` as it reads again
 * would draw its skeleton over content it already had. `const shown = $derived.by(keep(() => data.cash))`: `shown` is
 * the newest value that was not `null` or `undefined`, and stays it until another comes.
 */
export function keep<T>(read: () => T | null | undefined): () => T | null {
  let last: T | null = null;
  return () => {
    const now = read();
    if (now !== null && now !== undefined) last = now;
    return last;
  };
}
