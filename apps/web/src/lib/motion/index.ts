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

import { cubicIn, cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

import { FADE, ms, rowIn, rowOut, still } from '../ui/motion.ts';

export { ms, still };

import { spring } from './spring.ts';
import { pressedJustNow, washIfGrown } from './grow.ts';

export { spring };
export { growing, moved, wash, washIfGrown } from './grow.ts';

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
export function arrive(node: Element, { delay = 0, rise = 10, from = 0.97 }: { delay?: number; rise?: number; from?: number } = {}): TransitionConfig {
  if (calm()) return NONE;
  /* THE RECORD GREW WHILE HE LOOKED: the card wears the arrival wash as it lands (`grow.ts`). */
  washIfGrown(node);
  if (still()) return fadeIn();
  return {
    delay,
    duration: ms('--form-in', 320),
    easing: spring,
    css: (t, u) => `opacity:${Math.min(1, t * 2.5)};transform:translateY(${(u * rise).toFixed(2)}px) scale(${(1 - u * (1 - from)).toFixed(4)})`,
  };
}

/**
 * A COUNT COMING ON where there was none (Needs you's red capsule, the bell's badge): it swells from 60% to its size on
 * the spring, a little past and back, and fades in, over `--form-in`. Still in a screen's first second; a fade under
 * reduced motion.
 */
export function pop(_node: Element): TransitionConfig {
  if (calm()) return NONE;
  if (still()) return fadeIn();
  return {
    duration: ms('--form-in', 320),
    easing: spring,
    css: (t, u) => `opacity:${Math.min(1, t * 2.5).toFixed(3)};transform:scale(${(1 - u * 0.4).toFixed(4)})`,
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
 * a screen's first second, nothing under reduced motion. `step` is chrome making room for chrome (a fold pressed open):
 * that many milliseconds on the emphasis curve, no spring, so the rows land with what opened.
 */
export function glide(box: HTMLElement | null | undefined, match: string, { step }: { step?: number } = {}): () => void {
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
      const a = play(el as HTMLElement, { transform: [`translateY(${own.toFixed(2)}px)`, 'none'] }, step === undefined ? { duration: ms('--form-settle', 380) } : { duration: step, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      if (a) a.id = 'glide';
    }
  };
}

/* ── a part opening under its button ──────────────────────────────────── */

/**
 * A PART THAT OPENS UNDER ITS BUTTON, inside an `{#if}` (skills pass, 2 Nov): the rail's Parked, Finished and More
 * folds, which popped open and pushed what is under them down in one frame. On transform and opacity alone, as the rail
 * asks (audit 11-01, AP14: a height opening lays the rail out every frame): the part comes down 4px into place and fades
 * in over `--d-rows` on the out curve, while its owner glides what is under it to make room (`glide`, measured before
 * the press changes anything). Shutting is at once, and what was under it glides back up. Nothing on a first draw or
 * in a screen's first second; a fade under reduced motion. `when: false` is its owner saying this change was not a
 * press (a place opening because you went there), which draws still.
 *
 *   function fold(change) { const go = glide(box, ROWS); change(); void tick().then(go); }
 *   {#if open}<ul in:opens>…</ul>{/if}
 */
export function opens(_node: Element, { when = true }: { when?: boolean } = {}): TransitionConfig {
  if (!when || calm()) return NONE;
  if (still()) return fadeIn();
  return {
    duration: ms('--d-rows', 180),
    easing: cubicOut,
    css: (t, u) => `opacity:${t};transform:translateY(${(-4 * u).toFixed(2)}px)`,
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

/**
 * A ROW'S WHOLE ROOM ON THE BLOCK AXIS, as it is drawn: its height and the padding and rules inside it. A row opening or
 * closing by its height alone stopped at its padding, the box being measured border-box, and jumped the last 20px when
 * it was put in or taken out; a row with a least height (`--row-h`) did not open at all.
 */
function roomOf(el: HTMLElement): Record<'blockSize' | 'paddingBlockStart' | 'paddingBlockEnd' | 'borderBlockStartWidth' | 'borderBlockEndWidth', string> {
  const s = getComputedStyle(el);
  return {
    blockSize: `${el.offsetHeight}px`,
    paddingBlockStart: s.paddingBlockStart,
    paddingBlockEnd: s.paddingBlockEnd,
    borderBlockStartWidth: s.borderBlockStartWidth,
    borderBlockEndWidth: s.borderBlockEndWidth,
  };
}

const NO_ROOM = { blockSize: '0px', paddingBlockStart: '0px', paddingBlockEnd: '0px', borderBlockStartWidth: '0px', borderBlockEndWidth: '0px' } as const;

function arriveNow(el: HTMLElement): void {
  /* THE RECORD GREW WHILE HE LOOKED: the row wears the arrival wash as it lands (`grow.ts`). */
  washIfGrown(el);
  if (still()) return void play(el, { opacity: [0, 1] }, { duration: FADE });
  const room = roomOf(el);
  const long = ms('--form-in', 320);
  /* ITS ROOM OPENS while it rises, so what is under it glides down rather than jumping. */
  const opening = el.animate(
    [
      { ...NO_ROOM, minBlockSize: '0px', overflow: 'clip' },
      { ...room, minBlockSize: '0px', overflow: 'clip' },
    ],
    { duration: long * 0.6, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
  /* NAMED, so a board's fit measures the row again once it has opened (`board/fit.ts`). */
  opening.id = 'room';
  play(el, { opacity: [0, 1], transform: ['translateY(10px) scale(0.97)', 'none'] }, { duration: long });
}

function leaveFrom(box: HTMLElement, el: HTMLElement, next: Node | null, prev: Node | null): void {
  if (still() || typeof el.animate !== 'function') return;
  const before = next && next.parentNode === box ? next : prev && prev.parentNode === box ? prev.nextSibling : null;
  el.setAttribute('data-leaving', '');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  box.insertBefore(el, before);
  const room = roomOf(el);
  const gap = Number.parseFloat(getComputedStyle(box).rowGap) || 0;
  const last = el.nextElementSibling === null;
  const side = last ? 'marginBlockStart' : 'marginBlockEnd';
  el.style.overflow = 'clip';
  el.style.pointerEvents = 'none';
  const a = el.animate(
    [
      { opacity: 1, transform: 'none', ...room, minBlockSize: '0px', [side]: '0px', offset: 0, easing: 'cubic-bezier(0.4, 0, 1, 0.5)' },
      { opacity: 0, transform: 'scale(0.97)', ...room, minBlockSize: '0px', [side]: '0px', offset: 0.4, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      { opacity: 0, transform: 'scale(0.97)', ...NO_ROOM, minBlockSize: '0px', [side]: `${-gap}px`, offset: 1 },
    ],
    { duration: ms('--form-out', 180) + ms('--form-settle', 380) * 0.75, fill: 'forwards' },
  );
  a.id = 'leave';
  const gone = () => el.remove();
  void a.finished.then(gone, gone);
}

/* ── the rows of a page, arriving and leaving ────────────────────────────── */

/**
 * One kind of row a page draws, for `rowsMotion`: the list it sits in (`in`), the row itself (`row`, a selector that
 * names the row alone, since a row that has gone has no list round it to match), and whether it is a `line` in a column
 * of them, which opens and closes its room, or a `card` in a grid, which rises in its cell while the cards round it
 * glide to theirs.
 */
export type RowsOf = { in: string; row: string; as: 'line' | 'card' };

/** More rows than this coming or going at once is a new answer (a list drawn again, a page of rows), drawn still. */
export const MOST_AT_ONCE = 4;

/**
 * THE RECORD GROWING INSIDE A PAGE'S BLOCKS (31 Oct, "the way your braindog forms and evolves"), watched from the page
 * itself: `rowsMotion(ROWS)(page)`, which `PageBody` runs on its page (`page/page-rows.ts`). A task an agent added
 * rises into Your work this week, a person met into the people's cards, a line paid elsewhere leaves Late, without a
 * component of the page knowing: the lists only need to be keyed, so a row that arrives is a new element and one that
 * goes is taken out.
 *
 * A LINE THAT ARRIVES opens its room and rises into it, as `lineIn` does, and wears the arrival wash where the record
 * grew while he looked (`grow.ts`); A LINE THAT GOES lets go and its room closes, gap and all (`listMotion`'s two). A CARD
 * THAT ARRIVES rises in its cell while the cards after it glide to theirs (FLIP, measured with the new card out of the
 * flow for one read in the same task, so nothing is painted between); A CARD THAT GOES sinks and fades where it stood,
 * and then the cards after it glide back into the gap.
 *
 * NEVER A FIRST DRAW AND NEVER A NEW ANSWER: nothing in a screen's first second (`calm`), on a board still settling
 * (`data-still`) or being arranged, or in a tab nobody is looking at; a row put in as part of a list drawn whole is not
 * seen at all (only a row put into a list already there is); more than `MOST_AT_ONCE` rows at once is a new answer and
 * is drawn still; and a row that takes another's place, where the other stood, changes there (fluid F9). Under reduced
 * motion an arrival fades and wears the wash held, and a leaving row is simply gone.
 */
export const rowsMotion =
  (kinds: readonly RowsOf[]) =>
  (box: HTMLElement): (() => void) | void => {
    if (typeof MutationObserver === 'undefined') return;
    const kindOf = (el: Node, list: Node | null): RowsOf | null => {
      if (!(el instanceof HTMLElement) || !(list instanceof HTMLElement)) return null;
      /* NOT IN A BLOCK BEING ARRANGED, nor in a copy of one fading out (`recompose.ts`). */
      if (list.closest('[data-arranging], [data-leaving]')) return null;
      for (const k of kinds) if (el.matches(k.row) && list.matches(k.in)) return k;
      return null;
    };
    const seen = new MutationObserver((records) => {
      /* HIS OWN PRESS HAS ITS OWN ANSWER (a tick kept where it was, a card dropped, a fold opened, a line being edited):
         this is for what changes while he only looks. */
      if (calm() || pressedJustNow() || document.hidden || box.closest('[data-still], [data-editing]')) return;
      const out = new Set<Node>();
      for (const r of records) for (const n of r.removedNodes) out.add(n);
      type At = { el: HTMLElement; kind: RowsOf; list: HTMLElement; next: Node | null; prev: Node | null };
      const came: At[] = [];
      const went: At[] = [];
      for (const r of records) {
        if (r.type !== 'childList' || !(r.target instanceof HTMLElement) || !r.target.isConnected) continue;
        for (const n of r.addedNodes) {
          if (out.has(n) || !(n instanceof HTMLElement) || !n.isConnected || n.hasAttribute('data-leaving')) continue;
          const kind = kindOf(n, r.target);
          if (kind) came.push({ el: n, kind, list: r.target, next: r.nextSibling, prev: r.previousSibling });
        }
        for (const n of r.removedNodes) {
          if (!(n instanceof HTMLElement) || n.isConnected || n.inert || n.hasAttribute('data-leaving')) continue;
          const kind = kindOf(n, r.target);
          if (kind) went.push({ el: n, kind, list: r.target, next: r.nextSibling, prev: r.previousSibling });
        }
      }
      if (came.length + went.length === 0 || came.length > MOST_AT_ONCE || went.length > MOST_AT_ONCE) return;
      /* ONE THAT TAKES ANOTHER'S PLACE, WHERE THE OTHER STOOD, CHANGES THERE: a typed line and the record's row for it are
         one row, and one closing while the other opened drew two over each other (fluid F9). */
      const swapped = (a: At, b: At): boolean => a.list === b.list && ((a.next !== null && a.next === b.next) || (a.prev !== null && a.prev === b.prev));
      const coming = came.filter((c) => !went.some((w) => swapped(c, w)));
      const going = went.filter((w) => !came.some((c) => swapped(c, w)));
      for (const c of came) if (!coming.includes(c)) washIfGrown(c.el);
      const cards = coming.filter((c) => c.kind.as === 'card').map((c) => c.el);
      if (cards.length > 0) arriveCards(cards);
      for (const c of coming) if (c.kind.as === 'line') arriveNow(c.el);
      for (const w of going) {
        if (w.kind.as === 'card') leaveCard(w.list, w.el, w.next, w.prev);
        else leaveFrom(w.list, w.el, w.next, w.prev);
      }
    });
    seen.observe(box, { childList: true, subtree: true });
    return () => seen.disconnect();
  };

/**
 * Plays an element from `dx`, `dy` away back to where it is, on transform alone: one glide at a time. A CARD THAT WENT
 * TO ANOTHER LINE OF THE GRID does not cross the board to get there (a whole row's width, the move `recompose.ts` holds
 * to `SLIDE_MAX`): it glides the last 24px on the same heading and fades in, so the way it went is felt.
 */
function glideFrom(el: HTMLElement, dx: number, dy: number, line = Number.POSITIVE_INFINITY): void {
  if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) return;
  const far = Math.hypot(dx, dy);
  const wrapped = Math.abs(dy) > line / 2 && far > 96;
  const k = wrapped ? 24 / far : 1;
  const from = `translate(${(dx * k).toFixed(2)}px, ${(dy * k).toFixed(2)}px)`;
  const a = play(el, wrapped ? { transform: [from, 'none'], opacity: [0, 1] } : { transform: [from, 'none'] }, { duration: ms('--form-settle', 380) });
  if (a) a.id = 'glide';
}

/** The cards beside `except` in the lists that hold them, the ones that may have to make room. */
const cardsBeside = (lists: Iterable<HTMLElement | null>, except: readonly Element[]): HTMLElement[] =>
  [...new Set(lists)].flatMap((l) => (l ? [...l.children] : [])).filter((c): c is HTMLElement => c instanceof HTMLElement && !except.includes(c) && !c.hasAttribute('data-leaving'));

/** Plays `change` between two measures of `cards`, gliding each from where it stood to where it stands now. */
function makeRoom(cards: readonly HTMLElement[], change: () => void): void {
  const was = cards.map((c) => c.getBoundingClientRect());
  /* A GLIDE STILL PLAYING ENDS HERE, from where it was drawn, so the next one starts from the reader's picture. */
  for (const c of cards) for (const a of c.getAnimations()) if (a.id === 'glide') a.cancel();
  change();
  cards.forEach((c, i) => {
    if (!c.isConnected) return;
    const r = c.getBoundingClientRect();
    glideFrom(c, was[i]!.left - r.left, was[i]!.top - r.top, r.height);
  });
}

function arriveCards(els: readonly HTMLElement[]): void {
  for (const el of els) washIfGrown(el);
  if (still()) {
    for (const el of els) play(el, { opacity: [0, 1] }, { duration: FADE });
    return;
  }
  /* WHERE THE CARDS AFTER THEM STOOD: the new ones out of the flow for one measure, then back, in this task. */
  const held = els.map((el) => [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')] as const);
  for (const el of els) el.style.setProperty('display', 'none', 'important');
  makeRoom(cardsBeside(els.map((el) => el.parentElement), els), () =>
    els.forEach((el, i) => {
      const [value, priority] = held[i]!;
      if (value) el.style.setProperty('display', value, priority);
      else el.style.removeProperty('display');
    }),
  );
  for (const el of els) play(el, { opacity: [0, 1], transform: ['translateY(10px) scale(0.97)', 'none'] }, { duration: ms('--form-in', 320) });
}

function leaveCard(list: HTMLElement, el: HTMLElement, next: Node | null, prev: Node | null): void {
  if (still() || typeof el.animate !== 'function') return;
  const before = next && next.parentNode === list ? next : prev && prev.parentNode === list ? prev.nextSibling : null;
  el.setAttribute('data-leaving', '');
  el.setAttribute('aria-hidden', 'true');
  el.inert = true;
  el.style.pointerEvents = 'none';
  list.insertBefore(el, before);
  /* IT LETS GO WHERE IT STOOD, and then the cards after it glide back into the gap. */
  const a = el.animate({ opacity: [1, 0], transform: ['none', 'scale(0.96)'] }, { duration: ms('--form-out', 180), easing: 'cubic-bezier(0.4, 0, 1, 0.5)', fill: 'forwards' });
  a.id = 'leave';
  const gone = () => {
    if (!el.isConnected) return;
    makeRoom(cardsBeside([el.parentElement], [el]), () => el.remove());
  };
  void a.finished.then(gone, () => el.remove());
}

/** An element's place in a group assembling (`[data-forming]` in `app.css`): `style="--form-i: …"` in one word. */
export const forming = (i: number): string => `--form-i: ${Math.max(0, Math.min(i, 8))}`;
