/**
 * TODAY AS THIS DEVICE LAST LAID IT OUT, kept so its skeleton is the board it will be (ui-perfect, 3 Nov).
 *
 * The owner, 3 Nov: "I want proper skeleton loading, it feels inaccurate. Make sure the layouts are accurate and cached, and
 * have loading on the cards themselves." Today waited in a list's bars (`ui/Waiting.svelte`), a shape no board has, and
 * then every card came in at once where the bars had been. Now, once the board has drawn from the record and rested,
 * each card's cell, height, kind and how many lines it held are kept here per record and per board width (four
 * columns or two), and the next open with nothing to draw yet stands a card of bars in each of those cells at that
 * height (`TodaySkeleton.svelte`). When the record answers, each card fills its own cell and nothing moves.
 *
 * NO WORD OR FIGURE OF THE RECORD IS KEPT, only boxes: a key, a grid area, a height and a count. Kept in the shared
 * store of page shapes (`ui/shape.ts`, finish 3 Nov: one way to keep a page's shape), and a shape that does not read
 * back whole is no shape. Kept for 30 days at most. Its cards are drawn by the shared `ui/SkeletonCard.svelte`.
 *
 * PURE ENOUGH FOR NODE but for `shapeOf`, which reads the board's own boxes.
 */

import { keepPage, pageShape } from '../ui/shape.ts';

/** What a card's inside looks like, so its bars stand where its lines will. */
export type SkelKind = 'ask' | 'late' | 'faces' | 'cash' | 'feed' | 'figures' | 'figure' | 'list' | 'dates' | 'projects';

/** One card as it was last laid out: its cell, its height in px, its kind and its lines. */
export type ShapeCard = { key: string; area: string; h: number; kind: SkelKind; rows: number };

export type TodayShape = { v: 1; cols: number; at: number; cards: ShapeCard[] };

const VERSION = 1;
const MOST_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** More than a board ever holds: a shape past it is not Today's. */
const MOST_CARDS = 40;
const KINDS: ReadonlySet<string> = new Set(['ask', 'late', 'faces', 'cash', 'feed', 'figures', 'figure', 'list', 'dates', 'projects']);

/** Where it was kept before the shared store (`ui/shape.ts`), read once so a device keeps the shape it had. */
const oldKeyOf = (base: string, cols: number): string => `bd_today_shape:${base}:${cols}`;
/** Its page in the shared store of kept shapes (`ui/shape.ts`, `bd_shapes`), per record and board width. */
const keyOf = (base: string, cols: number): string => `today|${base}|${cols}`;

/** A grid area as the board writes it ("1 / 1 / span 2 / span 2", "3 / 1 / 4 / 5"): numbers, spans and slashes only. */
const AREA = /^(?:span )?\d{1,3}(?: \/ (?:span )?\d{1,3}){0,3}$/u;

function cardOf(x: unknown): ShapeCard | null {
  if (x === null || typeof x !== 'object') return null;
  const c = x as Record<string, unknown>;
  if (typeof c.key !== 'string' || c.key.length === 0 || c.key.length > 80) return null;
  if (typeof c.area !== 'string' || !AREA.test(c.area.trim())) return null;
  if (typeof c.h !== 'number' || !Number.isFinite(c.h) || c.h < 40 || c.h > 2000) return null;
  if (typeof c.kind !== 'string' || !KINDS.has(c.kind)) return null;
  const rows = typeof c.rows === 'number' && Number.isFinite(c.rows) ? Math.max(0, Math.min(12, Math.round(c.rows))) : 1;
  return { key: c.key, area: c.area.trim(), h: Math.round(c.h), kind: c.kind as SkelKind, rows };
}

/** The shape this device last kept for this record at this many columns, or `null` (none, too old, or not whole). */
export function readShape(base: string, cols: number, now = Date.now(), store: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): TodayShape | null {
  /* THE SHARED STORE FIRST (finish 3 Nov): one way to keep a page's shape (`ui/shape.ts`). */
  const kept = pageShape(keyOf(base, cols));
  if (kept !== null) return shapeFrom({ v: VERSION, cols, at: kept.at, cards: (kept.order ?? Object.keys(kept.cards)).map((key) => ({ key, ...kept.cards[key] }) as unknown as ShapeCard) }, cols, now);
  try {
    const raw = store?.getItem(oldKeyOf(base, cols));
    return raw ? shapeFrom(JSON.parse(raw) as Partial<TodayShape> | null, cols, now) : null;
  } catch {
    return null;
  }
}

/** A kept shape read back whole, or `null`: every card checked, nothing past 30 days. */
function shapeFrom(got: Partial<TodayShape> | null, cols: number, now: number): TodayShape | null {
  if (got === null || got.v !== VERSION || got.cols !== cols || typeof got.at !== 'number' || now - got.at > MOST_AGE_MS || !Array.isArray(got.cards)) return null;
  if (got.cards.length === 0 || got.cards.length > MOST_CARDS) return null;
  const cards = got.cards.map(cardOf);
  if (cards.some((c) => c === null)) return null;
  return { v: VERSION, cols, at: got.at, cards: cards as ShapeCard[] };
}

/** Keep the board's shape, unless it is the same as the one kept (a write a rest is a write too many). */
export function keepShape(base: string, shape: TodayShape): void {
  if (shape.cards.length === 0) return;
  const was = readShape(base, shape.cols, shape.at);
  if (was && JSON.stringify(was.cards) === JSON.stringify(shape.cards)) return;
  keepPage(keyOf(base, shape.cols), {
    cards: Object.fromEntries(shape.cards.map((c) => [c.key, { h: c.h, rows: c.rows, kind: c.kind, area: c.area }])),
    order: shape.cards.map((c) => c.key),
  });
}

/** A card's kind, by its key first (Today's own cards) and else by the block kind it draws. */
export function kindOf(key: string, blockKind: string | null): SkelKind {
  if (key === 'needs-you') return 'ask';
  if (key === 'late') return 'late';
  if (key === 'working' || key === 'faces') return 'faces';
  if (key === 'cash') return 'cash';
  if (key === 'arrivals') return 'feed';
  if (key === 'projects') return 'projects';
  if (key === 'numbers' || blockKind === 'kpis') return 'figures';
  if (key === 'coming-up' || blockKind === 'timeline') return 'dates';
  if (blockKind === 'stat') return 'figure';
  if (blockKind === 'cards') return 'faces';
  return 'list';
}

/** The lines a card of each kind holds, as its own boxes say. */
const LINES: Record<SkelKind, string> = {
  ask: '.qa',
  late: 'li',
  faces: '.run, .cards-item',
  cash: '.grid > .cell',
  feed: '.l-row',
  figures: '.kpi-row',
  figure: '.grid > .cell',
  list: '.list > .item',
  dates: '.hd-line',
  projects: '.pcard',
};

/**
 * A CARD'S KIND BY WHAT IT DRAWS, and else by its key: a widget added from the sheet has a key of its own ("w-projects",
 * "w-owedtoyo"), so the key alone stood a list of bars where project cards were.
 */
export function kindIn(el: Element, key: string): SkelKind {
  if (key === 'needs-you' || el.querySelector('.qa')) return 'ask';
  if (key === 'late' || el.querySelector('[data-desk="late"]')) return 'late';
  if (key === 'cash') return 'cash';
  if (el.querySelector('.pcard')) return 'projects';
  if (el.querySelector('.kpi-row')) return 'figures';
  if (key === 'arrivals' || el.querySelector('.l-row')) return 'feed';
  if (el.querySelector('.run, .cards-item')) return 'faces';
  if (el.querySelector('.hd-line')) return 'dates';
  if (el.querySelector('[data-kind="stat"]')) return 'figure';
  return kindOf(key, el.querySelector<HTMLElement>('[data-kind]')?.dataset.kind ?? null);
}

/**
 * THE BOARD AS IT STANDS, read off its own boxes: every card the board placed, by its key, cell and height. `null`
 * while it holds nothing, or while a card has no cell of its own (the board is between two packings).
 */
export function shapeOf(board: Element, cols: number, now = Date.now()): TodayShape | null {
  const cards: ShapeCard[] = [];
  const seen = new Set<string>();
  for (const el of board.querySelectorAll<HTMLElement>('[data-board-key]')) {
    const key = el.dataset.boardKey ?? '';
    if (!key || seen.has(key)) continue;
    const area = el.style.gridArea.trim();
    const h = el.getBoundingClientRect().height;
    if (!AREA.test(area) || !(h >= 40)) return null;
    seen.add(key);
    const kind = kindIn(el, key);
    /* THE LINES IT SHOWS, not those its frame cut (`fit.ts` hides them). */
    const rows = [...el.querySelectorAll<HTMLElement>(LINES[kind])].filter((x) => x.offsetParent !== null).length;
    cards.push({ key, area, h: Math.round(h), kind, rows: Math.max(1, Math.min(12, rows)) });
    if (cards.length > MOST_CARDS) return null;
  }
  return cards.length > 0 ? { v: VERSION, cols, at: now, cards } : null;
}

/**
 * THE SHAPE FOR A DEVICE THAT HAS NEVER DRAWN TODAY: Today's own first cards where the record lays them by default
 * (Needs you large at the left, Late and Cash ahead beside it, a list under), so the first wait is a board and not a
 * list. It is a guess, and the first rest keeps the real one.
 */
export function firstShape(cols: number): TodayShape {
  const at = 0;
  if (cols === 2)
    return {
      v: VERSION,
      cols,
      at,
      cards: [
        { key: 'needs-you', area: '1 / 1 / 2 / 3', h: 168, kind: 'ask', rows: 1 },
        { key: 'late', area: '2 / 1 / 3 / 3', h: 128, kind: 'late', rows: 1 },
        { key: 'cash', area: '3 / 1 / 4 / 3', h: 296, kind: 'cash', rows: 3 },
        { key: 'list', area: '4 / 1 / 5 / 3', h: 220, kind: 'list', rows: 3 },
      ],
    };
  return {
    v: VERSION,
    cols,
    at,
    cards: [
      { key: 'needs-you', area: '1 / 1 / 2 / 3', h: 168, kind: 'ask', rows: 1 },
      { key: 'late', area: '1 / 3 / 2 / 5', h: 120, kind: 'late', rows: 1 },
      { key: 'working', area: '2 / 1 / 3 / 3', h: 184, kind: 'faces', rows: 2 },
      { key: 'cash', area: '2 / 3 / 3 / 5', h: 144, kind: 'cash', rows: 3 },
      { key: 'list', area: '3 / 1 / 4 / 5', h: 168, kind: 'figures', rows: 4 },
    ],
  };
}
