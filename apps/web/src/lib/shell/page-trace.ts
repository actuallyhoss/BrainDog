/**
 * WHERE EVERYTHING STOOD WHEN THIS PAGE LAST LANDED, kept so its skeleton is the page itself (the owner, 4 Nov: "the current
 * skeleton loading is super fake").
 *
 * Generic bars never match a page, and no hand-drawn skeleton keeps up with one. So once a page has drawn and rested, its
 * own boxes are read off the screen: every tile, every line of words (each line, at its width and height), every icon,
 * well, capsule and hairline, down to the fold. `app.html` draws them behind the page the next time it opens, before any
 * of the app has run, and the page lands on its own outline: a tile lands exactly on its tile.
 *
 * ONLY BOXES, NEVER A WORD OF THE RECORD: numbers, nothing else, in this browser's storage. Kept per address and per
 * phone or desk (`bd_tr:<band>:<address>`), the newest sixty, for 30 days (`app.html` holds the age).
 *
 * READ BY A SCRIPT WITH NO MODULE TO SHARE (`app.html`, `__bdFrame`), so the row's shape is spelled here and there:
 * `[kind, x, y, w, h, radius]`, x from the work's start edge, y from the window's top, and the `G` flag on what stands on
 * the ground and not on a tile. Bump `VERSION` with it.
 *
 * LOADED AT REST, never on the way to the first screen (`first-frame.ts`), and it writes nothing to the page.
 */

export const VERSION = 1;

/** What a row draws: a tile, a filled box, words (strong, plain, quiet), a hairline, a glyph, the lit row. */
const SURFACE = 0, FILL = 1, STRONG = 2, TEXT = 3, QUIET = 4, LINE = 5, GLYPH = 6, LIT = 7;
/** Added to a kind for a box on the ground, which the words landing over it take away (`first-frame.ts`). */
const G = 10;

/** More than a first screen holds, and what keeps a page's entry to a few KB. */
const MOST_ROWS = 320;
const MOST_PAGES = 60;
const INDEX = 'bd_tr_i';

export type Row = [number, number, number, number, number, number];
export type Trace = {
  v: number;
  at: number;
  /** Text size and density, as `app.html` sets them: another look is another layout. */
  look: string;
  /** The work's width when it was read, so a window a little wider or narrower draws it to scale. */
  m: number;
  /** How wide the page's name was in the top bar. */
  t: number;
  /** The page's boxes. */
  r: Row[];
  /** The sidebar's or the tab bar's boxes on this page (y under 0 counts from the foot), with its mode. */
  e: Row[];
  /** `full`, `rail`, `tabs` or `none`. */
  mode: string;
  /** The navigation's shape, `bar` or `menu`. */
  shape: string;
};

/** Never read as part of a page: what floats over it, what is hidden, and any skeleton still standing. */
const SKIP = 'script,style,template,dialog,[popover],[data-kept-skip],.sr-only,.said,.skip,.waiting,.sk,.sk-group,.pw,.toasts-at,[data-board-reading]';

type Box = { l: number; r: number };

const clear = (colour: string): boolean => colour === 'transparent' || /(?:, 0\)|\/ 0\))$/u.test(colour) || colour === 'rgba(0, 0, 0, 0)';
const solid = (colour: string): boolean => !clear(colour) && !/\/ 0?\.\d+\)$/u.test(colour) && !/, 0?\.\d+\)$/u.test(colour);
const px = (v: string): number => Number.parseFloat(v) || 0;

/** A box's corner, as a number: a pill's huge radius comes back as half its height when drawn. */
function radius(c: CSSStyleDeclaration, h: number): number {
  return Math.min(px(c.borderStartStartRadius), Math.ceil(h / 2));
}

type Scope = {
  rows: Row[];
  /** The start edge x is read from. */
  x0: number;
  /** Added to y: the scroller's scroll, so a page read while scrolled is read at its top. */
  dy: number;
  /** The fold: nothing below it is drawn. */
  fold: number;
  ink: string;
  /** Whether this is the sidebar or tab bar, whose rows keep no fill but the lit one. */
  chrome: boolean;
  /** The colour of the tile being read: a box inside it in the same colour draws nothing. */
  tile?: string;
};

/** Every box under `el`, in paint order. */
function walk(el: Element, s: Scope, clip: Box | null, ground: boolean): void {
  if (s.rows.length >= MOST_ROWS || el.matches(SKIP)) return;
  const c = getComputedStyle(el);
  if (c.display === 'none' || c.visibility === 'hidden' || c.position === 'fixed' || c.opacity === '0') return;
  if (c.display === 'contents') {
    for (const k of el.children) walk(k, s, clip, ground);
    return;
  }
  const b = el.getBoundingClientRect();
  const top = b.top + s.dy;
  if (top > s.fold) return;
  const add = (kind: number, x: number, y: number, w: number, h: number, r: number): void => {
    const lx = clip ? Math.max(x, clip.l) : x;
    const rx = clip ? Math.min(x + w, clip.r) : x + w;
    if (rx - lx < 2 || h < 0.5 || y > s.fold || y + h < 0) return;
    s.rows.push([ground && kind !== SURFACE ? kind + G : kind, Math.round(lx - s.x0), Math.round(y), Math.round(rx - lx), Math.max(1, Math.round(h)), Math.round(r)]);
  };
  const tag = el.tagName;
  const big = b.width >= 2 && b.height >= 2;

  /* A PICTURE OR A GLYPH IS ONE BOX, whatever it holds. A chart is a quiet block where it stands. */
  if (tag === 'svg' || tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'PICTURE') {
    if (big) add(b.width > 48 ? FILL : GLYPH, b.left, top, b.width, b.height, b.width > 48 ? 8 : Math.max(radius(c, b.height), Math.min(5, b.height / 3)));
    return;
  }
  /* A FIELD IS ITS BOX. */
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    if (big) add(FILL, b.left, top, b.width, b.height, radius(c, b.height));
    return;
  }

  let inner = clip;
  if (c.overflowX !== 'visible' && b.width > 0) inner = { l: clip ? Math.max(clip.l, b.left) : b.left, r: clip ? Math.min(clip.r, b.right) : b.right };
  let on = ground;

  const fill = !clear(c.backgroundColor) || c.backgroundImage !== 'none';
  if (big && s.chrome) {
    if (el.getAttribute('aria-current') === 'page') add(LIT, b.left, top, b.width, b.height, radius(c, b.height));
    else if (fill && b.height <= 24) {
      add(FILL, b.left, top, b.width, b.height, radius(c, b.height));
      return;
    }
  } else if (big) {
    const tile = (el.matches('.tile, .surface-card') && ground) || (ground && solid(c.backgroundColor) && c.boxShadow !== 'none' && b.height >= 48 && b.width >= 80);
    if (tile) {
      add(SURFACE, b.left, top, b.width, b.height, radius(c, b.height));
      s.tile = c.backgroundColor;
      on = false;
      inner = { l: b.left, r: b.right };
    } else if (fill && c.backgroundColor !== s.tile && (ground || b.height < 56 || !solid(c.backgroundColor))) {
      add(FILL, b.left, top, b.width, b.height, radius(c, b.height));
      /* A SMALL FILLED THING (a press, a chip, a well, a meter) IS ONE SHAPE; a larger one holds rows of its own. */
      if (b.height < 56) return;
    }
    if (b.width >= 40) {
      if (px(c.borderBlockEndWidth) >= 1 && c.borderBlockEndStyle !== 'none' && !clear(c.borderBlockEndColor)) add(LINE, b.left, top + b.height - 1, b.width, 1, 0);
      if (px(c.borderBlockStartWidth) >= 1 && c.borderBlockStartStyle !== 'none' && !clear(c.borderBlockStartColor)) add(LINE, b.left, top, b.width, 1, 0);
    }
  }

  for (const node of el.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      walk(node as Element, s, inner, on);
    } else if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') {
      const range = document.createRange();
      range.selectNodeContents(node);
      const size = px(c.fontSize);
      const bar = Math.max(6, Math.round(size * 0.62));
      const weight = px(c.fontWeight);
      const kind = weight >= 600 || size >= 20 ? STRONG : c.color !== s.ink || size <= 12 ? QUIET : TEXT;
      for (const line of range.getClientRects()) {
        if (line.width < 2) continue;
        const y = line.top + s.dy + (line.height - bar) / 2;
        const lx = inner ? Math.max(line.left, inner.l) : line.left;
        const rx = inner ? Math.min(line.right, inner.r) : line.right;
        if (rx - lx >= 2 && y <= s.fold && y + bar >= 0 && s.rows.length < MOST_ROWS) s.rows.push([on ? kind + G : kind, Math.round(lx - s.x0), Math.round(y), Math.round(rx - lx), bar, 3]);
      }
    }
  }
}

/** How wide an element's words are drawn. */
function textWidth(el: Element): number {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}

/** The address a trace is kept under: a list's filters are the list's, so `app.html` falls back on the bare address. */
export const keyOf = (band: string, address: string): string => `bd_tr:${band}:${address}`;
export const bandNow = (): string => (innerWidth < 900 ? 'p' : 'w');
export const lookNow = (): string => {
  const h = document.documentElement;
  return `${h.getAttribute('data-text') ?? ''} ${h.getAttribute('data-density') ?? ''}`;
};

/** The page on screen, read. `null` when there is no shell to read it in. */
export function traceNow(): Trace | null {
  const main = document.querySelector<HTMLElement>('main#main');
  if (main === null) return null;
  const box = main.getBoundingClientRect();
  const fold = innerHeight;
  const rows: Row[] = [];
  const ink = getComputedStyle(main).color;
  for (const k of main.children) walk(k, { rows, x0: box.left, dy: main.scrollTop, fold, ink, chrome: false }, { l: box.left, r: box.right }, true);

  /* THE SIDEBAR OR THE TAB BAR AS IT STOOD HERE, foot rows counted from the foot so another window's height still holds. */
  const edge: Row[] = [];
  const chrome = document.querySelector('.s-side, .s-rail') ?? document.querySelector('.tabs');
  let mode = 'none';
  if (chrome !== null && chrome.getBoundingClientRect().width > 0) {
    mode = chrome.matches('.s-side') ? 'full' : chrome.matches('.s-rail') ? 'rail' : 'tabs';
    const scope = { rows: edge, x0: 0, dy: 0, fold, ink: getComputedStyle(chrome).color, chrome: true };
    for (const k of chrome.children) walk(k, scope, null, false);
    for (const r of edge) if (r[2] > fold / 2) r[2] -= fold;
  }
  const crumb = document.querySelector('.bar-slot .crumb li:last-child');
  return {
    v: VERSION,
    at: Date.now(),
    look: lookNow(),
    m: Math.round(box.width),
    t: crumb === null ? 0 : Math.round(textWidth(crumb)),
    r: rows,
    e: edge,
    mode,
    shape: document.querySelector('.shell')?.getAttribute('data-shape') ?? 'bar',
  };
}

/** Kept, newest first, the oldest going past `MOST_PAGES`. A full store gives up its oldest half and tries once more. */
export function keepTrace(address: string, trace: Trace): void {
  const key = keyOf(bandNow(), address);
  const text = JSON.stringify(trace);
  try {
    const was = JSON.parse(localStorage.getItem(INDEX) ?? '[]') as string[];
    const list = [key, ...was.filter((k) => k !== key)];
    for (const old of list.splice(MOST_PAGES)) localStorage.removeItem(old);
    try {
      localStorage.setItem(key, text);
    } catch {
      for (const old of list.splice(Math.ceil(list.length / 2))) localStorage.removeItem(old);
      localStorage.setItem(key, text);
    }
    localStorage.setItem(INDEX, JSON.stringify(list));
    /* AND AS THE SHELL A PAGE NEVER OPENED HERE STANDS IN: its sidebar, shape and mode. */
    localStorage.setItem(`bd_tr_shell:${bandNow()}`, JSON.stringify({ v: VERSION, e: trace.e, mode: trace.mode, shape: trace.shape }));
  } catch {
    /* Storage blocked or full: the next open draws the default shape. */
  }
}
