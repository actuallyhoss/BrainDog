/**
 * THE FIRST FRAME'S OTHER END. `app.html` draws the shell and the page's kept outline behind everything before the app has
 * run (`#ff`); this is what takes it away and keeps it true.
 *
 * WHILE THE PAGE LANDS the outline stands behind it. A tile that lands covers its own outline, since a tile is solid, so a
 * card that comes early is simply there and the rest still stand. What stands on the ground has nothing to cover it, so
 * each such box goes the moment something of the page is over it (`cover`).
 *
 * WHEN THE SCREEN SAYS IT HAS DRAWN (`data-screen`) the outline goes, and at rest the page is read for next time
 * (`page-trace.ts`, its own chunk, so nothing on the way to the first screen pays for it).
 *
 * A PAGE WITH NOTHING KEPT draws the shape a typical record's page has (`first-traces.json`, its own chunk).
 */
import { firstTrace } from './first-trace-key.ts';

type FrameDoor = {
  /** Draws a kept trace for an address (the app's move), or says there is none. */
  draw(address: string): boolean;
  /** Draws a trace handed over. */
  put(trace: unknown): boolean;
  /** Takes the page's outline away. */
  clear(): void;
  /** Takes the whole frame away. */
  gone(): void;
};

const door = (): FrameDoor | undefined => (globalThis as { __bdFrame?: FrameDoor }).__bdFrame;

/** Nothing of the shell or the page's outline: a screen that draws none (sign-in, a shared page, access ended). */
export function frameGone(): void {
  door()?.gone();
}

const MAIN_DRAWN = 'main#main[data-screen]';
const WAITS = 'main#main :is(.waiting, .skel-board, .pw, .sk, .sk-group, [data-standing], [data-board-reading])';
/** Quiet before reading: what a screen fills in just after it says it has drawn (a side tile, the name's banner). */
const REST_MS = 1500;
/** What arrives fades up (`data-arrive`, `--d-swap`): the outline stands under it until that has played. */
const FADE_MS = 240;
/** A screen that said it has drawn and whose page differs from its outline: this long, then the outline goes anyway. */
const SAID_MS = 1200;

let watcher: MutationObserver | null = null;
let readTimer: ReturnType<typeof setTimeout> | undefined;
let queued = false;

const px = (v: string): number => Number.parseFloat(v) || 0;

/** A wait still standing, the frame itself, or the page's bare box: none of them is the page having landed. */
const notPage = (el: Element): boolean => el.matches('main#main, html, body, #ff, #ff *') || el.closest('main#main') === null || el.closest('.waiting, .sk, .sk-group, .pw, [role="status"], [data-standing], [data-board-reading]') !== null;

/** Whether words or a picture of the page are at this point. A wrapper with nothing of its own there is not the page yet. */
function wordsAt(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y);
  if (el === null || notPage(el)) return false;
  return el.matches('svg, svg *, img, input, textarea, select, button') || [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
}

/** Whether a solid surface of the page is at this point: a tile that has landed, which hides its outline. */
function tileAt(x: number, y: number): boolean {
  let el = document.elementFromPoint(x, y);
  if (el === null || notPage(el)) return false;
  for (; el !== null && !el.matches('main#main'); el = el.parentElement) {
    const c = getComputedStyle(el).backgroundColor;
    /* WITH SOMETHING IN IT: a slot standing empty for its board to come is the page's box and not the page. */
    if (!/(?:, 0(?:\.\d+)?\)|\/ 0?\.\d+\)|transparent)$/u.test(c)) return (el.textContent ?? '').trim() !== '';
  }
  return false;
}

/**
 * Each box on the ground with something of the page over it goes. Its place is read from its own style and it goes after
 * every look, so this asks the browser for layout once and not once a box.
 */
function cover(): void {
  const ground = document.querySelectorAll<HTMLElement>('#ff .ffg');
  if (ground.length === 0) return;
  const gone = [...ground].filter((g) => wordsAt(px(g.style.left) + px(g.style.width) / 2, px(g.style.top) + px(g.style.height) / 2));
  for (const g of gone) g.remove();
}

function stop(): void {
  watcher?.disconnect();
  watcher = null;
  queued = false;
}

/** Whether the page's tiles are over most of their outlines: the page has landed, not only said it has. */
function landed(): boolean {
  const tiles = document.querySelectorAll<HTMLElement>('#ff .ff0');
  if (tiles.length === 0) return document.querySelector('#ff .ffg') === null;
  let over = 0;
  for (const t of tiles) {
    if (tileAt(px(t.style.left) + Math.min(px(t.style.width) / 2, 24), px(t.style.top) + Math.min(px(t.style.height) / 2, 24))) over++;
  }
  return over * 2 >= tiles.length;
}

function settle(address: string): void {
  stop();
  door()?.clear();
  clearTimeout(readTimer);
  readTimer = setTimeout(() => {
    const read = () => void readPage(address);
    if (typeof requestIdleCallback === 'function') requestIdleCallback(read, { timeout: 1500 });
    else read();
  }, REST_MS);
}

async function readPage(address: string): Promise<void> {
  const main = document.querySelector('main#main');
  if (main === null || addressNow() !== address) return;
  /* ONLY A PAGE THAT DREW: a refusal or an error is not its shape, and a page read offline may be a part of itself. */
  if (main.getAttribute('data-screen') === 'refused' || document.querySelector('.offline-line') !== null) return;
  /* NOR WHILE SEEING THE RECORD AS SOMEBODY ELSE: nothing kept is drawn or kept then (`+layout.ts`). */
  try {
    if (sessionStorage.getItem('braindog.see-as') !== null) return;
  } catch {
    return;
  }
  const { keepTrace, traceNow } = await import('./page-trace.ts');
  if (addressNow() !== address) return;
  const trace = traceNow();
  if (trace !== null && trace.r.length > 0) keepTrace(address, trace);
}

/** With no frame to stand, the page is still read at rest. */
function settleOnly(address: string): void {
  const wait = (): void => {
    if (document.querySelector(MAIN_DRAWN) !== null) return settle(address);
    readTimer = setTimeout(wait, 500);
  };
  wait();
}

const addressNow = (): string => location.pathname.replace(/\/$/u, '') + location.search;

/**
 * A page has opened at this address: on the app's first run and on every move inside it. On a move the outline is drawn
 * here, and only if the new page has not already drawn; on the first run `app.html` already drew it.
 */
export function pageOpened(first: boolean): void {
  const address = addressNow();
  clearTimeout(readTimer);
  stop();
  const f = door();
  /* A FRAME THAT HAS GONE (a page with no shell came first) draws nothing, and a page's waits are its own again. */
  if (f === undefined || document.getElementById('ff') === null) return settleOnly(address);
  if (first === false && document.querySelector(MAIN_DRAWN) !== null) return settle(address);
  const has = first ? document.querySelector('#ff .ff-page > * > *') !== null : f.draw(address);
  if (!has) {
    /* NOTHING KEPT: THE SHAPE A TYPICAL PAGE OF THIS KIND HAS, once its chunk is here and only if the page has not landed. */
    void firstTrace(address).then((t) => {
      if (t !== null && addressNow() === address && document.querySelector(MAIN_DRAWN) === null) f.put(t);
      else if (t === null) f.clear();
    });
  }
  let said: ReturnType<typeof setTimeout> | undefined;
  let leaving = false;
  const look = (): void => {
    queued = false;
    if (leaving) return;
    cover();
    /* A SCREEN SAYS IT HAS DRAWN WHILE A PART OF IT STILL WAITS (Projects' board): the outline stands until no wait does, or for
       its 8 s in `app.html`. Its own bars came up for half a second in the outline's place. */
    if (document.querySelector(MAIN_DRAWN) === null || document.querySelector(WAITS) !== null) return;
    if (landed()) {
      leaving = true;
      clearTimeout(said);
      setTimeout(() => settle(address), FADE_MS);
    } else if (said === undefined) {
      said = setTimeout(() => settle(address), SAID_MS);
    }
  };
  watcher = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(look);
  });
  watcher.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-screen'] });
  requestAnimationFrame(look);
}
