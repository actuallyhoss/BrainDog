/**
 * THE PACKER: a board's widgets, an order and a size each, laid on the grid (the widgets plan of 29 October, §3.2).
 *
 * NO COORDINATES ARE STORED. A board is its widgets in an order, each with a size; this lays them row by row, left to
 * right, each at the first cell it fits from where the last one went, and a hole that the next widget cannot fill is
 * filled by the first one after it that can. So a board never ends a row on a gap it could have closed, and the same
 * order and sizes always lay out the same way on every screen.
 *
 * THE ORDER IT ANSWERS IS THE ORDER THE SCREEN IS READ IN: top to bottom, left to right. Home writes the widgets into the
 * document in that order, so a keyboard and a screen reader walk what the eye sees (Call 4).
 *
 * PURE, AND NO SVELTE, so `node --test` reads it, and fast enough to run on every frame of a drag: sixteen widgets on
 * four columns is a few hundred cell checks.
 */

import { SIZE_CELLS, type WidgetSize } from 'braindog-render';

/** One widget as the packer takes it: its key and its frame. */
/** `grow`: rows a widget takes past its size, a draft's on the phone, so its Keep bar sits under it and not over it. */
export type Item = { key: string; size: WidgetSize; grow?: number };

/** One widget laid: its cell from the top left, and its cells across and down. */
export type Laid = { key: string; size: WidgetSize; x: number; y: number; w: number; h: number };

/** The board laid: each widget in reading order, and how many rows it takes. */
export type Packed = { laid: Laid[]; rows: number };

/** A frame's cells on a board of `cols` columns: the phone's two map a full to a wide (`SIZE_CELLS`). */
export function cellsOf(size: WidgetSize, cols: number): { w: number; h: number } {
  const c = cols <= 2 ? SIZE_CELLS[size].phone : SIZE_CELLS[size];
  return { w: Math.min(c.w, cols), h: c.h };
}

/**
 * Lay `items` on `cols` columns. Each takes the first free cell, reading row by row from the cursor, where its whole
 * frame is free; a cell nothing in the order can take before the board would grow past it is left empty.
 */
export function pack(items: readonly Item[], cols: number): Packed {
  const taken: boolean[][] = [];
  const free = (x: number, y: number, w: number, h: number): boolean => {
    if (x + w > cols) return false;
    for (let r = y; r < y + h; r += 1) for (let c = x; c < x + w; c += 1) if (taken[r]?.[c]) return false;
    return true;
  };
  const take = (x: number, y: number, w: number, h: number): void => {
    for (let r = y; r < y + h; r += 1) {
      const row = (taken[r] ??= []);
      for (let c = x; c < x + w; c += 1) row[c] = true;
    }
  };
  const left = items.map((it) => ((c) => ({ ...it, w: c.w, h: c.h + Math.max(0, it.grow ?? 0) }))(cellsOf(it.size, cols)));
  const laid: Laid[] = [];
  let cx = 0;
  let cy = 0;
  /* THE CURSOR WALKS THE GRID ROW BY ROW. At each free cell the first widget in the order that fits there takes it; if
     none of them does, the cell is a hole and the cursor moves on. Every widget fits somewhere further on, so this ends. */
  while (left.length > 0) {
    if (taken[cy]?.[cx]) {
      cx += 1;
      if (cx >= cols) (cx = 0), (cy += 1);
      continue;
    }
    const at = left.findIndex((it) => free(cx, cy, it.w, it.h));
    if (at >= 0) {
      const it = left.splice(at, 1)[0]!;
      take(cx, cy, it.w, it.h);
      laid.push({ key: it.key, size: it.size, x: cx, y: cy, w: it.w, h: it.h });
    }
    cx += 1;
    if (cx >= cols) (cx = 0), (cy += 1);
  }
  laid.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = laid.reduce((most, l) => Math.max(most, l.y + l.h), 0);
  return { laid, rows };
}

/** A grid area for a laid widget, as `grid-area` takes it: row start, column start, row end, column end (1-based). */
/**
 * NO HOLE AT REST (recheck 15, and the low "holes" note): where nothing left in the order fits a gap, the widget beside it
 * is drawn across it, so the board after Done has none. Each widget grows right into empty cells as tall as it is, then
 * down into empty cells as wide as it is, then left. Its size is unchanged (what it shows, what is kept); only its frame
 * is drawn larger. The editor shows the packed board, holes and all, so he sees where they would be.
 */
/**
 * THE ROOM GOES TO WHAT HOLDS MORE (polish, 1 Nov): on Today as the record lays it out, People with four faces took the
 * half of the board a hole left at its foot while Coming up, nine bills deep, stayed a narrow column beside it. Where
 * `weight` is given, a hole at the end of a row of widgets the same height is handed to the one in that row that holds
 * the most, and the widgets after it move along; the order read is the same and no size changes. Without `weight` (a
 * board he arranged himself) the widget beside the hole takes it, as before.
 */
export function filled(packed: Packed, cols: number, short: ReadonlySet<string> = new Set(), weight?: ReadonlyMap<string, number>): Laid[] {
  const rows = packed.rows;
  const grid: (string | null)[][] = Array.from({ length: rows }, () => Array<string | null>(cols).fill(null));
  const out = packed.laid.map((l) => ({ ...l }));
  for (const l of out) for (let r = l.y; r < l.y + l.h; r += 1) for (let c = l.x; c < l.x + l.w; c += 1) grid[r]![c] = l.key;
  const empty = (x: number, y: number, w: number, h: number): boolean => {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let r = y; r < y + h; r += 1) for (let c = x; c < x + w; c += 1) if (grid[r]![c] !== null) return false;
    return true;
  };
  const claim = (l: Laid, x: number, y: number, w: number, h: number): void => {
    for (let r = y; r < y + h; r += 1) for (let c = x; c < x + w; c += 1) grid[r]![c] = l.key;
  };
  const clear = (o: Laid): void => {
    for (let r = o.y; r < o.y + o.h; r += 1) for (let c = o.x; c < o.x + o.w; c += 1) grid[r]![c] = null;
  };
  if (weight !== undefined && weight.size > 0) {
    for (const l of out) {
      let gap = 0;
      while (empty(l.x + l.w + gap, l.y, 1, l.h)) gap += 1;
      if (gap === 0) continue;
      /* THE ROW ENDING AT THE HOLE: the widgets the same height that touch, each at the end of the one before. */
      const run = [l];
      for (;;) {
        const first = run[0]!;
        const before = out.find((o) => o.y === first.y && o.h === first.h && o.x + o.w === first.x);
        if (before === undefined) break;
        run.unshift(before);
      }
      const most = (o: Laid): number => weight.get(o.key) ?? 0;
      /* THE ONE HOLDING THE MOST, and on a tie the last, the widget beside the hole, as without weights. */
      const to = run.reduce((best, o) => (most(o) > most(best) ? o : best), l);
      if (to === l) continue;
      for (const o of run) clear(o);
      let x = run[0]!.x;
      for (const o of run) {
        o.x = x;
        if (o === to) o.w += gap;
        claim(o, o.x, o.y, o.w, o.h);
        x += o.w;
      }
    }
  }
  for (const l of out) {
    while (empty(l.x + l.w, l.y, 1, l.h)) claim(l, l.x + l.w, l.y, 1, l.h), (l.w += 1);
  }
  /* NEVER DOWN FOR A TILE LAID SHORT AT REST (`short`, first hour audit AH19): Needs you, made one row tall because it
     holds one line, was drawn down the hole beside a tall Arrivals, its heading in the middle of 380px. */
  for (const l of out) {
    if (short.has(l.key)) continue;
    while (empty(l.x, l.y + l.h, l.w, 1)) claim(l, l.x, l.y + l.h, l.w, 1), (l.h += 1);
  }
  for (const l of out) {
    while (empty(l.x - 1, l.y, 1, l.h)) claim(l, l.x - 1, l.y, 1, l.h), (l.x -= 1), (l.w += 1);
  }
  return out;
}

export const areaOf = (l: Pick<Laid, 'x' | 'y' | 'w' | 'h'>): string => `${l.y + 1} / ${l.x + 1} / ${l.y + l.h + 1} / ${l.x + l.w + 1}`;

/**
 * Where in the order a widget held at cell (`x`, `y`) goes, in cells and fractions of one from the board's top left:
 * over another widget, before it while in its first half and after it in its second; over a hole, before the first
 * widget that starts after that cell in reading order. The place is among the others, the held one left out.
 */
export function dropIndex(packed: Packed, key: string, x: number, y: number): number {
  const others = packed.laid.filter((l) => l.key !== key);
  const inside = others.findIndex((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h);
  if (inside >= 0) {
    const l = others[inside]!;
    return x < l.x + l.w / 2 ? inside : inside + 1;
  }
  const after = others.findIndex((l) => l.y > y || (l.y <= y && y < l.y + l.h && l.x > x));
  return after < 0 ? others.length : after;
}

/** A frame on the screen, as `getBoundingClientRect` gives it. */
export type Frame = { left: number; top: number; width: number; height: number };

/**
 * WHERE A WIDGET IS HELD, from its top left, once its frame has changed at pickup (review 30 Oct, R9). At rest a widget
 * beside a hole is drawn across it; held, it is drawn at its own size. The point under the pointer is kept as the same
 * share of the widget across and down, so the widget stays under the finger and does not jump away from it.
 */
export function heldAt(was: Frame, now: Frame, x: number, y: number): { dx: number; dy: number } {
  const share = (at: number, from: number, size: number): number => (size > 0 ? Math.max(0, Math.min(1, (at - from) / size)) : 0);
  return { dx: share(x, was.left, was.width) * now.width, dy: share(y, was.top, was.height) * now.height };
}

/** `order` with `key` moved to `to` among the others. */
export function moved(order: readonly string[], key: string, to: number): string[] {
  const rest = order.filter((k) => k !== key);
  const at = Math.max(0, Math.min(rest.length, to));
  return [...rest.slice(0, at), key, ...rest.slice(at)];
}
