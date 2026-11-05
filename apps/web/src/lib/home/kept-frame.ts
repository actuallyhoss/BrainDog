/**
 * Today as this phone last drew it, kept as a picture the next open paints before any of the app's code has run.
 *
 * WHY. Opened again from the home screen, the app's shell and files come from the worker's copy at once, but Today drew
 * only once the app's code had loaded and run and the local copy had been read: about 0.65 s on a phone's slower CPU,
 * with nothing but the ground and the bar before it. So when Today has drawn from the record, its markup and the styles
 * it was drawn with are kept here, and `app.html` lays them over the page the moment the shell parses, inert, until the
 * app's own Today says it has drawn (`main#main[data-screen]`), which replaces it in the same place.
 *
 * KEPT IN THE WORKER'S COPY (`COPY`), so it goes wherever that copy goes: on a 401, a refusal that access ended, a
 * sign-out (the worker and `forget`), a move to another record (`keep`), and after a week (`sweep`). And only on a page
 * the worker controls, so the worker that deletes it is there. `app.html` draws it only on the address it was taken on,
 * at the same width, scheme, text size and density, never while seeing the record as somebody else, and for a week at
 * most.
 *
 * IT SAYS WHEN IT IS FROM. Money in it is as the record last answered: older than `KEPT_SAY_MS`, the line Today draws
 * over a copy (`words.updating`) is laid in where Today draws it, with the time it was taken, so a figure is never shown
 * old without saying so. The words are made here, from the copy's own, because `app.html` holds no words.
 *
 * IT NEVER DRAWS BACK WHAT THIS BROWSER JUST CLOSED. An answer since it was taken is taken out of it as it is painted, and a
 * row moved since it was taken leaves it unpainted that once (`record/answers-out.ts`, `record/wrote-mark.ts`, `app.html`).
 *
 * NOTHING IN IT RUNS OR LOADS: scripts, frames and media are left out, every `id` is renamed so nothing finds the
 * picture for the screen, and `data-screen` is dropped so nothing reads it as drawn. AND `app.html` DOES NOT TAKE THIS ON
 * TRUST: it parses the markup apart and drops script, frame, meta, base and link before the picture lands, since a meta
 * refresh written into the cache by anything on this origin goes wherever it says on every open, and no policy holds one.
 */

import { apiBase, BASE } from '../at.ts';
import { COPY, FRAME_PATH, guestHere, KEPT, when, words } from '../data/offline.ts';
import { closedIds } from '../record/answers-out.ts';

/** Where in the copy the picture is kept: one, the last Today drawn. `app.html` spells the same address. */
export { FRAME_PATH };
/** Bump with the shape below; `app.html` draws only this one. */
export const FRAME_VERSION = 1;
/** How old a picture may be before it says when it is from. Today's own line over a copy keeps the same rule. */
export const KEPT_SAY_MS = 60_000;

/** What Today says over a copy kept at `at`, or `null` while it is younger than `KEPT_SAY_MS`. */
export function keptLineOf(at: number, now: number): string | null {
  return now - at >= KEPT_SAY_MS ? words.updating(when(at, now)) : null;
}

export type Frame = {
  v: number;
  /** The address it was taken on. */
  path: string;
  /** The width and the scheme it was laid out at. */
  w: number;
  /** The scheme, text size, density and contrast it was drawn in, as `app.html` sets them from the device's choice. */
  look: string;
  dark: boolean;
  at: number;
  html: string;
  /** The record it is of, as `apiBase()` says it, and the answers its counts already leave out (`answers-out.ts`). */
  base: string;
  gone: string[];
  /** The rules on the root and the body, and faces; and every other rule, which `app.html` scopes to the picture. */
  root: string;
  css: string;
  /** "Updating · from 14:02", for an open the same day, and with the weekday for a later one. */
  today: string;
  other: string;
};

const LEFT_OUT = 'script, iframe, video, audio, object, embed, canvas, dialog, [popover], [data-kept-skip], noscript, xmp, noembed, noframes, plaintext';

/** A selector that names the page's root or body and nothing under them: drawn outside the picture's scope. */
const ROOTISH = /^\s*(?::root|html|body)(?:[.:[#][^\s>+~]*)?\s*$/u;

type Parts = { root: string[]; scoped: string[] };

/**
 * Sort a rule into the picture's two parts, or leave it out. EVERY STYLESHEET THE TAB HAS LOADED was about 560 KB of
 * text, thirteen times the markup, so a rule whose selector matches nothing drawn now is left out (a hover, another
 * screen's), and so are keyframes, since nothing in the picture moves. A selector the query cannot take (a
 * pseudo-element) is kept.
 *
 * TWO PARTS, because `app.html` scopes the picture's rules to the picture (`@scope`): laid over the whole page they
 * doubled every rule the app's own screen was styled by while it was drawn underneath, and the app drew later for it.
 * Rules on the root and the body (the house's and the accent's colours, the text size) and the at-rules that are not
 * styles (faces, properties) are the part left unscoped, since inside the picture they would match nothing.
 */
function sortRule(doc: Document, rule: CSSRule, into: Parts): void {
  if (rule instanceof CSSStyleRule) {
    let hit = true;
    try {
      hit = doc.querySelector(rule.selectorText) !== null;
    } catch {
      hit = true;
    }
    if (hit) (rule.selectorText.split(',').every((one) => ROOTISH.test(one)) ? into.root : into.scoped).push(rule.cssText);
    return;
  }
  if (rule instanceof CSSKeyframesRule || rule instanceof CSSImportRule) return;
  if (rule instanceof CSSGroupingRule) {
    const inner: Parts = { root: [], scoped: [] };
    for (const r of rule.cssRules) sortRule(doc, r, inner);
    const head = rule.cssText.slice(0, rule.cssText.indexOf('{'));
    if (inner.root.length > 0) into.root.push(`${head}{${inner.root.join('\n')}}`);
    if (inner.scoped.length > 0) into.scoped.push(`${head}{${inner.scoped.join('\n')}}`);
    return;
  }
  into.root.push(rule.cssText);
}

/** The picture of the app as drawn now, or `null` when there is nothing settled to keep. */
export function frameOf(doc: Document, now: number): Frame | null {
  /* THE APP'S OWN ROOT, THE BODY'S ONE DIV: the first frame (`#ff` in `app.html`) stands before it, and is no picture of Today. */
  const root = doc.querySelector('body > div') ?? doc.body.firstElementChild;
  const main = doc.querySelector('main#main[data-screen]');
  if (root === null || main === null || doc.getElementById('kept-frame') !== null) return null;
  /* NOTHING OPEN OVER IT: a sheet or a menu in the picture would be drawn over the next open with nothing behind it. */
  if (doc.querySelector('dialog[open], [aria-modal="true"], [role="menu"]') !== null) return null;
  const copy = root.cloneNode(true) as Element;
  for (const el of copy.querySelectorAll(LEFT_OUT)) el.remove();
  /* A QUESTION ANSWERED IS NOT KEPT, not as its card and not as the answered line standing in its place, and the counts
     drawn now already leave it out, which `gone` tells `app.html` (`answers-out.ts`). */
  const base = apiBase();
  const gone = [...closedIds(base, true, now, true)];
  for (const id of gone) for (const el of copy.querySelectorAll(`[data-row="q:${id}"]`)) el.remove();
  for (const el of copy.querySelectorAll('[id]')) {
    el.setAttribute('data-kept-id', el.id);
    el.removeAttribute('id');
  }
  for (const el of copy.querySelectorAll('[data-screen], [autofocus]')) {
    el.removeAttribute('data-screen');
    el.removeAttribute('autofocus');
  }
  const rules: Parts = { root: [], scoped: [] };
  const sheets = [...doc.styleSheets, ...(doc.adoptedStyleSheets ?? [])];
  for (const sheet of sheets) {
    try {
      for (const rule of sheet.cssRules) sortRule(doc, rule, rules);
    } catch {
      /* A sheet of another origin cannot be read; the app loads none. */
    }
  }
  const html = doc.documentElement;
  const time = when(now, now);
  return {
    v: FRAME_VERSION,
    /* WITHOUT A LAST SLASH: the app writes the address without it, and the home screen opens it with one. */
    path: location.pathname.replace(/\/$/u, ''),
    w: innerWidth,
    look: ['scheme', 'text', 'density', 'theme'].map((a) => html.getAttribute(`data-${a}`) ?? '').join(' '),
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    at: now,
    base,
    gone,
    html: copy.innerHTML,
    root: rules.root.join('\n'),
    css: rules.scoped.join('\n'),
    today: words.updating(time),
    other: words.updating(when(now, now + 86_400_000)),
  };
}

const frameKey = (): string => new URL(FRAME_PATH, `${location.origin}${BASE}/`).href;

/**
 * Keep Today as drawn now, for the next open. Only on a page the worker controls (see above), and never while seeing
 * the record as somebody else, whose Today is not this phone's to keep, nor for a guest (`markGuest`).
 */
export async function keepFrame(now: number = Date.now()): Promise<void> {
  if (typeof caches === 'undefined' || typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  try {
    if (sessionStorage.getItem('braindog.see-as') !== null) return;
  } catch {
    return;
  }
  if (await guestHere()) return;
  const frame = frameOf(document, now);
  if (frame === null) return;
  const box = await caches.open(COPY);
  await box.put(frameKey(), new Response(JSON.stringify(frame), { headers: { 'content-type': 'application/json', [KEPT]: String(now) } }));
}

/** Drop the picture: Today drew something it must not open on again (a refusal, an empty record). */
export async function dropFrame(): Promise<void> {
  if (typeof caches === 'undefined') return;
  await (await caches.open(COPY)).delete(frameKey());
}
