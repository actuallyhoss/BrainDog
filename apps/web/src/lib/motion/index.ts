/**
 * THE RECORD FORMING: the motion for the moments the record itself changes (1 Nov, "add satisfying animations to the
 * way your braindog forms and evolves"). A card, a widget, a person, a line or a place arrives; a draft is kept and
 * settles, or is thrown away; a question is answered and leaves while the rest close the gap; a figure counts to its new
 * value and a bar grows to it.
 *
 * It sits on the answering motion of 20 October (`$lib/ui/motion.ts`: rows opening, the page's cross-fade, a figure's
 * roll) and on its own five tokens in the skin (`--form-in`, `--form-out`, `--form-settle`, `--form-count`,
 * `--form-gap`, with `--ease-spring`), so a skin or `a11y.css` that changes them changes this too.
 *
 *   {#each cards as c (c.key)}
 *     <li in:arrive out:depart animate:flip={springy()}>…</li>
 *   {/each}
 *
 * THREE RULES HOLD EVERYWHERE:
 *   - Transform and opacity only, and FLIP for what moves; the one size that animates is a row's height closing, which
 *     is the gap itself (`dismiss`).
 *   - Only a real arrival or change. Svelte plays a local `in:` only for an item added after its list first drew, and a
 *     screen's first second (`calm`) draws still, so a record that already existed is simply there when it opens, and a
 *     list that fills from the record a moment after the screen opened does not fly in.
 *   - Never in the way: nothing here waits on a press, and under `prefers-reduced-motion` an arrival or a leaving is a
 *     short fade and everything else is at once.
 */

import { cubicIn } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

import { FADE, ms, rowIn, rowOut, still } from '../ui/motion.ts';

export { ms, still };

import { spring } from './spring.ts';

export { spring };

/* ── the first second of a screen ────────────────────────────────────────── */

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** How long a screen draws still after it opens, while its first answers land. */
export const CALM_MS = 900;

let calmUntil = CALM_MS;

/** A screen opened: what it draws for the next `CALM_MS` is the screen settling, not the record changing. */
export function hush(forMs = CALM_MS): void {
  calmUntil = now() + forMs;
}

/**
 * Whether what is drawn now is the screen settling rather than the record changing: within a screen's first second, or
 * while the work has not yet said it has drawn (`data-screen` on `#main`, `ui/screen.svelte.ts`).
 */
export function calm(): boolean {
  if (now() < calmUntil) return true;
  if (typeof document === 'undefined') return true;
  const main = document.getElementById('main');
  return main !== null && !main.hasAttribute('data-screen');
}

/* ── arriving and leaving ────────────────────────────────────────────────── */

const NONE: TransitionConfig = { duration: 0 };
const fadeIn = (delay = 0): TransitionConfig => ({ delay, duration: FADE, css: (t) => `opacity:${t}` });

/**
 * A THING ARRIVING: a card, a widget, a person, a line. It rises `rise` pixels and grows from 97% on the spring over
 * `--form-in`, its opacity in over the first part. `delay` staggers a group (`staggered`). Still in a screen's first
 * second; a fade under reduced motion.
 */
export function arrive(_node: Element, { delay = 0, rise = 10, from = 0.97 }: { delay?: number; rise?: number; from?: number } = {}): TransitionConfig {
  if (calm()) return NONE;
  if (still()) return fadeIn();
  return {
    delay,
    duration: ms('--form-in', 320),
    easing: spring,
    css: (t, u) => `opacity:${Math.min(1, t * 2.5)};transform:translateY(${(u * rise).toFixed(2)}px) scale(${(1 - u * (1 - from)).toFixed(4)})`,
  };
}

/**
 * A LINE ARRIVING IN A LIST: a payment, a person, a to-do. Its row opens, so the lines under it glide down to make room,
 * while it rises into place on the spring and fades in (`ui/motion.ts` `rowIn`, which every list shares). A fade under
 * reduced motion; still in a screen's first second.
 */
export function lineIn(node: Element, { delay = 0 }: { delay?: number } = {}): TransitionConfig {
  return calm() ? NONE : { ...rowIn(node), delay };
}

/** A THING THROWN AWAY: it sinks to 97% and fades over `--form-out`, accelerating away. */
export function depart(_node: Element): TransitionConfig {
  if (still()) return { duration: FADE, css: (t) => `opacity:${t}` };
  return { duration: ms('--form-out', 180), easing: cubicIn, css: (t, u) => `opacity:${t};transform:scale(${(1 - u * 0.03).toFixed(4)})` };
}

/**
 * A THING ANSWERED, LEAVING ITS PLACE IN A LIST: it lets go first (sinks and fades), then the gap it held closes on the
 * spring, so what is under it rises into the room smoothly rather than jumping (`ui/motion.ts` `rowOut`). The one size
 * that animates, because the closing gap is the point. A fade under reduced motion, and the gap simply gone.
 */
export const dismiss = rowOut;

/**
 * A PLACE COMING INTO THE SIDEBAR or the tab bar (an add-on turned on, a list that now has something): it slides in from
 * the rail's edge and fades in, at its own height from the first frame. Its row opening by `block-size` laid the rail
 * out again every frame and shifted it (audit 11-01, AP14); the places under it now glide down to make room on
 * transform alone (`glide`, which the rail runs round every change of what it holds). `hold` is its owner saying it is
 * still filling in as it opens, which is no arrival.
 */
export function placeIn(_node: Element, { hold = false }: { hold?: boolean } = {}): TransitionConfig {
  if (hold || calm()) return NONE;
  if (still()) return fadeIn();
  return {
    duration: ms('--form-in', 320),
    easing: spring,
    css: (t, u) => `opacity:${Math.min(1, t * 2)};transform:translateX(${(-12 * u).toFixed(2)}px)`,
  };
}

/**
 * WHAT MAKES ROOM, GLIDING: measures every element of `box` that `match` names, and returns the function that, once the
 * change is drawn, plays each one that moved from where it stood to where it is now, on the spring and on transform
 * alone (FLIP), so nothing is laid out twice and the rail never shifts under the reader. One inside another that moved
 * plays only its own share of the move. A new element is not here: it arrives by its own `in:` (`placeIn`). Nothing in
 * a screen's first second, nothing under reduced motion.
 */
export function glide(box: HTMLElement | null | undefined, match: string): () => void {
  if (!box || calm() || still() || typeof box.animate !== 'function') return () => {};
  const was = new Map<Element, number>();
  for (const el of box.querySelectorAll(match)) was.set(el, el.getBoundingClientRect().top);
  return () => {
    if (!box.isConnected) return;
    const moved = new Map<Element, number>();
    for (const el of box.querySelectorAll<HTMLElement>(match)) {
      const top = was.get(el);
      if (top === undefined) continue;
      /* A GLIDE STILL PLAYING ENDS HERE, from where it was drawn, so the next one starts from the reader's picture. */
      for (const a of el.getAnimations()) if (a.id === 'glide') a.cancel();
      const dy = top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) moved.set(el, dy);
    }
    for (const [el, dy] of moved) {
      const up = el.parentElement?.closest(match);
      const own = dy - (up && box.contains(up) ? (moved.get(up) ?? 0) : 0);
      if (Math.abs(own) <= 0.5) continue;
      const a = play(el as HTMLElement, { transform: [`translateY(${own.toFixed(2)}px)`, 'none'] }, { duration: ms('--form-settle', 380) });
      if (a) a.id = 'glide';
    }
  };
}

/** One of a group arriving together: the `i`th, `--form-gap` after the one before, the sixth and on together. */
export const staggered = (i: number): { delay: number } => ({ delay: Math.min(Math.max(0, i), 5) * ms('--form-gap', 40) });

/** What stays, sliding into its new place: pass to `animate:flip`. The spring over `--form-settle`; at once under reduced motion. */
export const springy = (): { duration: number; easing: (t: number) => number } => ({ duration: still() ? 0 : ms('--form-settle', 380), easing: spring });

/* ── settling in place ───────────────────────────────────────────────────── */

/**
 * A THING THAT SETTLES WHERE IT IS: a draft kept, a project formed from one, an answer taken. It gives a little (98.5%)
 * and comes back on the spring, so the change is felt where it happened and nothing about it moves elsewhere. Nothing
 * under reduced motion: the change itself says it.
 */
export function settleHere(node: Element | null | undefined): void {
  if (!node || still() || typeof (node as HTMLElement).animate !== 'function') return;
  play(node as HTMLElement, { transform: ['scale(0.985)', 'none'], opacity: [0.7, 1] }, { duration: ms('--form-settle', 380) });
}

/**
 * Plays keyframes on the spring the skin writes (`--ease-spring`, a `linear()` curve), or on the emphasis curve in a
 * browser that cannot read one: the animation is the same, only less springy.
 */
export function play(el: HTMLElement, frames: Keyframe[] | PropertyIndexedKeyframes, opts: KeyframeAnimationOptions): Animation | null {
  const curve = typeof getComputedStyle === 'function' ? getComputedStyle(el).getPropertyValue('--ease-spring').trim() : '';
  try {
    return el.animate(frames, { easing: curve || 'cubic-bezier(0.16, 1, 0.3, 1)', ...opts });
  } catch {
    try {
      return el.animate(frames, { ...opts, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    } catch {
      return null;
    }
  }
}

/**
 * A THING LETTING GO WHERE IT IS before the record takes it away: thrown away, it sinks and fades at once on the press,
 * and is marked leaving (`data-leaving`) so the page's recomposition (`page/recompose.ts`) does not draw a copy of it
 * fading again when the record's answer comes. The press is never held for it. What it returns puts the element back.
 */
export function letGo(node: Element | null | undefined): () => void {
  if (!node || typeof (node as HTMLElement).animate !== 'function') return () => {};
  const el = node as HTMLElement;
  el.setAttribute('data-leaving', '');
  const a = el.animate(still() ? { opacity: [1, 0] } : { opacity: [1, 0], transform: ['none', 'scale(0.96)'] }, { duration: still() ? FADE : ms('--form-out', 180), easing: 'cubic-bezier(0.4, 0, 1, 0.5)', fill: 'forwards' });
  /* PUT BACK, for a throw the record did not take. */
  return () => {
    a.cancel();
    el.removeAttribute('data-leaving');
    settleHere(el);
  };
}

/**
 * Settles the element when `key` changes after its first draw, as an attachment: `{@attach settleOn(card.draft)}` plays
 * `settleHere` the moment a draft becomes the project it was, and never on the first draw.
 */
const lastKey = new WeakMap<Element, unknown>();
export const settleOn =
  (key: unknown) =>
  (node: Element): void => {
    const had = lastKey.has(node);
    const was = lastKey.get(node);
    lastKey.set(node, key);
    if (had && was !== key && !calm()) settleHere(node);
  };

/* ── a list Svelte cannot animate ────────────────────────────────────────── */

/**
 * A LIST WHOSE ITEMS ARRIVE AND LEAVE WITH MOTION, watched from the list itself, as an attachment:
 * `<div {@attach listMotion('.qa')}>`. For a list whose items sit inside an `{#if}` in their `{#each}`, where a local
 * `in:` or `out:` never plays (Svelte plays one only for the block the element is in, and the `{#if}` is that block).
 *
 * AN ITEM THAT ARRIVES rises into place as `arrive` does. AN ITEM THAT GOES is put back where it stood for a moment, out
 * of reach (`inert`, hidden from a reader, `data-leaving`), lets go (sinks and fades), and then the room it held closes,
 * gap and all, so the items under it rise into place instead of jumping. Nothing in a screen's first second; under
 * reduced motion an arrival fades and a leaving item is simply gone.
 */
export const listMotion =
  (match: string, { leave = true }: { leave?: boolean } = {}) =>
  (box: HTMLElement): (() => void) | void => {
    if (typeof MutationObserver === 'undefined') return;
    const seen = new MutationObserver((records) => {
      if (calm()) return;
      const out = new Set<Node>();
      for (const r of records) for (const n of r.removedNodes) out.add(n);
      for (const r of records) {
        for (const n of r.addedNodes) if (n instanceof HTMLElement && !out.has(n) && n.matches(match) && !n.hasAttribute('data-leaving')) arriveNow(n);
        if (leave)
          for (const n of r.removedNodes)
            if (n instanceof HTMLElement && !n.isConnected && !n.inert && n.matches(match) && !n.hasAttribute('data-leaving')) leaveFrom(box, n, r.nextSibling, r.previousSibling);
      }
    });
    seen.observe(box, { childList: true });
    return () => seen.disconnect();
  };

function arriveNow(el: HTMLElement): void {
  if (still()) return void play(el, { opacity: [0, 1] }, { duration: FADE });
  const h = el.offsetHeight;
  const long = ms('--form-in', 320);
  /* ITS ROOM OPENS while it rises, so what is under it glides down rather than jumping. */
  el.animate({ blockSize: ['0px', `${h}px`], overflow: ['clip', 'clip'] }, { duration: long * 0.6, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  play(el, { opacity: [0, 1], transform: ['translateY(10px) scale(0.97)', 'none'] }, { duration: long });
}

function leaveFrom(box: HTMLElement, el: HTMLElement, next: Node | null, prev: Node | null): void {
  if (still() || typeof el.animate !== 'function') return;
  const before = next && next.parentNode === box ? next : prev && prev.parentNode === box ? prev.nextSibling : null;
  el.setAttribute('data-leaving', '');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  box.insertBefore(el, before);
  const h = el.offsetHeight;
  const gap = Number.parseFloat(getComputedStyle(box).rowGap) || 0;
  const last = el.nextElementSibling === null;
  const room = last ? 'marginBlockStart' : 'marginBlockEnd';
  el.style.overflow = 'clip';
  el.style.pointerEvents = 'none';
  const a = el.animate(
    [
      { opacity: 1, transform: 'none', blockSize: `${h}px`, [room]: '0px', offset: 0, easing: 'cubic-bezier(0.4, 0, 1, 0.5)' },
      { opacity: 0, transform: 'scale(0.97)', blockSize: `${h}px`, [room]: '0px', offset: 0.4, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      { opacity: 0, transform: 'scale(0.97)', blockSize: '0px', [room]: `${-gap}px`, offset: 1 },
    ],
    { duration: ms('--form-out', 180) + ms('--form-settle', 380) * 0.75, fill: 'forwards' },
  );
  const gone = () => el.remove();
  void a.finished.then(gone, gone);
}

/** An element's place in a group assembling (`[data-forming]` in `app.css`): `style="--form-i: …"` in one word. */
export const forming = (i: number): string => `--form-i: ${Math.max(0, Math.min(i, 8))}`;
