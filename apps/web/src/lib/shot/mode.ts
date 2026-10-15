/**
 * Screenshot mode, turned on and off on a screen: the one door to `plate.ts` the rest of the app uses.
 *
 * IT IS A DISPLAY MODE FOR A SHOULDER, not a redaction of the payload. What is sent to the device does not change; what
 * the record holds is plated on the screen while the buttons and headings the product typed still read.
 *
 * LOADED ONLY WHEN THE MODE GOES ON. Whoever turns it on imports this file then (`await import('$lib/shot/mode.ts')`),
 * and this file imports the two heavy parts only inside `applyShot`: the own words (`virtual:own-words`, about 39 KB) and
 * the plate's sheet (`@braindog/skin/kinds/shot.css`). So a screen with the mode off carries none of it.
 *
 * ONE SESSION A TAB. The layout turns it on from the person's `look.shot`, and the palette and Settings turn
 * it on and off as they are pressed, so a second `on` hands back the stop already running and an `off` ends it whoever
 * started it. A stop that is no longer the running one does nothing.
 *
 * WHILE IT IS ON `<html>` CARRIES `data-shot`, which is how a screen asks whether it is on without loading this file.
 *
 * A SHARED PAGE FOR A STRANGER (`/s/<token>`) NEVER TAKES IT: it is somebody else's screen, and the mode is the
 * person's own setting.
 */

import { here } from '../at.ts';
import { plate, watch } from './plate.ts';

/** The mark on `<html>` while the mode is on. */
export const SHOT_MARK = 'data-shot';

/** The page this runs on: the members of `document` it reads, so a test can hand it a stand-in. */
export type Page = Pick<Document, 'title' | 'documentElement' | 'querySelector'>;

/** What the mode reads beside the screen. Each is the real one unless a test hands its own. */
export type Parts = {
  words: () => Promise<ReadonlySet<string>>;
  sheet: () => Promise<unknown>;
  path: string;
  page: Page | null;
};

const NONE: ReadonlySet<string> = new Set();
const nothing = (): void => undefined;

/** Whether this address is a shared page, inside a record or not. */
export const shared = (pathname: string): boolean => {
  const at = here(pathname);
  return at === '/s' || at.startsWith('/s/');
};

/** `titleOf`'s separator (`lib/title.ts`). */
const PART = ' · ';

/**
 * The tab's title with only the page's own name left: each part the copy files typed whole, and the product's name,
 * which `titleOf` always puts last. `Lease renewal · Money · BrainDog` is `Money · BrainDog`.
 */
export function titleIn(title: string, own: ReadonlySet<string>): string {
  const parts = title.split(PART);
  if (parts.length < 2) return title;
  const product = parts.pop() as string;
  return [...parts.filter((p) => own.has(p.trim())), product].join(PART);
}

/** Keep the tab's title to the page's own name as the app retitles the tab, and put the real one back at the end. */
function keepTitle(page: Page, own: ReadonlySet<string>): () => void {
  let real = page.title;
  let shown = titleIn(real, own);
  page.title = shown;
  /* READ AFTER THE WRITE, since a page with no `<title>` gets one from it. */
  const tag = page.querySelector('title');
  const back = () => {
    if (page.title === shown) page.title = real;
  };
  if (!tag || typeof MutationObserver === 'undefined') return back;
  const seen = new MutationObserver(() => {
    if (page.title === shown) return;
    real = page.title;
    shown = titleIn(real, own);
    page.title = shown;
    seen.takeRecords();
  });
  seen.observe(tag, { childList: true, characterData: true, subtree: true });
  return () => {
    seen.disconnect();
    back();
  };
}

let running: (() => void) | null = null;
let starting: Promise<() => void> | null = null;
/* HOW MANY TIMES IT WAS TURNED OFF, so an `on` still loading its words when an `off` arrives starts nothing. */
let offs = 0;

/**
 * Turn the mode on under `root`, or off. On answers the stop, which takes every mark away; off ends whatever is running
 * and takes every mark under `root` away, and answers a stop that does nothing.
 */
export async function applyShot(on: boolean, root: Element, parts: Partial<Parts> = {}): Promise<() => void> {
  const path = parts.path ?? (typeof location === 'undefined' ? '' : location.pathname);
  if (!on || shared(path)) {
    offs += 1;
    running?.();
    plate(root, NONE, 'off');
    return nothing;
  }
  if (running) return running;
  if (starting) return starting;
  const page = parts.page !== undefined ? parts.page : typeof document === 'undefined' ? null : document;
  const words = parts.words ?? (() => import('virtual:own-words').then((m) => m.default));
  const sheet = parts.sheet ?? (() => import('@braindog/skin/kinds/shot.css'));
  const mine = offs;
  starting = Promise.all([words(), sheet()]).then(([own]) => {
    starting = null;
    if (offs !== mine) return nothing;
    const unwatch = watch(root, own);
    const untitle = page ? keepTitle(page, own) : nothing;
    page?.documentElement.setAttribute(SHOT_MARK, '');
    const stop = () => {
      if (running !== stop) return;
      running = null;
      unwatch();
      untitle();
      page?.documentElement.removeAttribute(SHOT_MARK);
    };
    running = stop;
    return stop;
  }, (failed: unknown) => {
    /* A PART THAT DID NOT LOAD leaves the mode off and the next press free to try again. */
    starting = null;
    throw failed;
  });
  return starting;
}
