/**
 * A page recomposing in place: when its answer changes (a poll, a write, a headline written again), each block moves
 * from where it was to where it is, a new one fades and rises in, and one that left fades out where it stood
 * ("the page recomposes live and the change animates in place, without a reload or a jump").
 *
 * FLIP, ON THE BLOCKS AS DRAWN. `PageBody` measures every block before the page draws the new answer and again after,
 * and each block that moved is played from its old place to its new one on transform alone, so nothing is laid out
 * twice. The old content stays on screen until the new answer is drawn, because the caller keeps it (`reread`), so
 * there is no blank frame to animate over.
 *
 * A BLOCK IS KNOWN BY WHAT IT IS, NOT BY ITS PLACE. The page keys every id and write by a block's declared index, so a
 * page written again with a block put in at the top would have "block 3" be another block; following the index would
 * slide the wrong tile. `blockKeys` names each block by the `key` the record answered for it (its declared key, or the
 * record's hash of its kind, source and heading), and works the same name out where a record older than the look
 * overlay sent none, so a regenerated or rearranged page keeps each block's name for the block that is the same block.
 * The page keys its elements by it too (`PageBody.svelte`), so a block the look moves is the same element moving, with
 * what it holds (a fold opened, a length picked) going with it.
 *
 * A BLOCK THAT CANNOT SLIDE INSIDE THE PAGE FADES IN WHERE IT IS (`redrawn`). Played from its old place at its new
 * width, a half that took the whole row as a panel docked beside the page stood out past the page's end for the length
 * of the move, under the panel, and the work scrolled sideways while it went. A block whose old place at its new width
 * is inside the page still slides, whatever its width did: faded from nothing, a block the reader was just looking at
 * blinks out and back, and every block on the page did that when a scrollbar came or went and took 15px off them all.
 *
 * A BLOCK MOVES A SHORT WAY, AND ONCE (`slideOf`, audit 11-01 AP4). One that changed place by more than `SLIDE_MAX`
 * glides the last `GLIDE` pixels and fades in rather than crossing the board, and two answers drawn in one breath are
 * one recomposition from what the reader last saw, so no block is ever given two animations at once.
 *
 * A HEADLINE WRITTEN AGAIN HANDS OVER (`swap`): the block stays where it is, its old words go and the new ones come up
 * as they are gone, rather than changing in one frame under the reader's eye or crossing each other.
 *
 * WITHIN THE SKIN'S MOTION AND UNDER 300ms, ON ITS OWN TWO STEPS: a block that moves, arrives or leaves takes
 * `--d-recompose` (220) and a headline written again `--d-exit` out then `--d-enter` in (90 + 110), so a skin or `a11y.css` that changes the scale
 * changes this with it. Where the skin has its spring (`--ease-spring`), a block arriving and the blocks moving for it
 * take the record-forming steps instead (`--form-in` 320, `--form-settle` 380, held under 420). A reader who asked for less motion sees only opacity: a new block fades in, one that left fades
 * out, and one that moved is simply where it is.
 *
 * THE PLAN IS PURE (`planOf`), so `recompose.test.ts` holds which block does what; `recompose` is the half that touches
 * the page.
 */

/** A block's place on the page, relative to the page's own box, in CSS pixels. */
export type Box = { x: number; y: number; w: number; h: number };

/** What one recomposition does to each block. */
export type Plan = {
  /** Blocks in both answers whose place changed: where each was, less where it is. */
  moves: { key: string; dx: number; dy: number }[];
  /** Blocks in both answers that moved and cannot slide there inside the page: drawn anew where they are. */
  redrawn: string[];
  /** Blocks only in the new answer. */
  enters: string[];
  /** Blocks only in the old answer, with the place each held. */
  leaves: { key: string; box: Box }[];
};

/** Under a pixel is no move at all: a re-read that changed nothing must play nothing. */
const STILL = 0.5;

/**
 * THE FURTHEST A BLOCK SLIDES, in CSS pixels. A tile that changed place by more than this (a board packed again, its
 * neighbour now a column over) flew 600 to 900px across Today under the reader's eye (audit 11-01, AP4). Past it, a
 * block is drawn near its new place instead and glides the last `GLIDE` pixels in from the side it came from, fading
 * in as it does: the direction of the change is felt, and nothing crosses the board.
 */
export const SLIDE_MAX = 96;
/** How far a block that moved further than `SLIDE_MAX` glides into its new place. */
export const GLIDE = 24;

/**
 * How a block that moved `dx`, `dy` (where it was, less where it is) is played: slid the whole way when that is short,
 * else glided the last `GLIDE` pixels on the same heading and faded in (`fade`), in one animation either way.
 */
export function slideOf(dx: number, dy: number): { dx: number; dy: number; fade: boolean } {
  const far = Math.hypot(dx, dy);
  if (far <= SLIDE_MAX) return { dx, dy, fade: false };
  const k = GLIDE / far;
  return { dx: dx * k, dy: dy * k, fade: true };
}

/**
 * Each block's key, by index: its kind, its source or list, and its heading, with a count where two blocks on one page
 * would share them. Every block is named, drawn or not, so a block that comes back keeps the name it had.
 */
export function blockKeys(
  blocks: readonly { kind: string; key?: string | undefined; source?: string | undefined; register?: string | undefined; heading?: string | undefined; lead?: unknown }[],
): string[] {
  const seen = new Map<string, number>();
  return blocks.map((b) => {
    /* THE RECORD'S KEY WHERE IT SENT ONE, which is the name the look orders, hides and pins by. */
    const base =
      typeof b.key === 'string' && b.key !== ''
        ? b.key
        : [b.kind, b.lead === true ? 'lead' : '', b.source ?? b.register ?? '', (b.heading ?? '').trim().toLowerCase()].join('|');
    /* TWO ALIKE ARE TOLD APART BY THEIR ORDER, so no two elements of the page ever share a key. */
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** Which blocks moved, which came and which went, between two measures of the page `room` wide. */
export function planOf(before: ReadonlyMap<string, Box>, after: ReadonlyMap<string, Box>, room = Infinity): Plan {
  const moves: Plan['moves'] = [];
  const redrawn: string[] = [];
  const enters: string[] = [];
  const leaves: Plan['leaves'] = [];
  for (const [key, now] of after) {
    const was = before.get(key);
    if (!was) {
      enters.push(key);
      continue;
    }
    const dx = was.x - now.x;
    const dy = was.y - now.y;
    if (Math.abs(dx) < STILL && Math.abs(dy) < STILL) continue;
    /* AT ITS NEW WIDTH FROM ITS OLD PLACE, inside the page or not slid at all. */
    const fits = was.x > -1 && was.x + now.w < room + 1;
    if (fits) moves.push({ key, dx, dy });
    else redrawn.push(key);
  }
  for (const [key, box] of before) if (!after.has(key)) leaves.push({ key, box });
  return { moves, enters, redrawn, leaves };
}

/**
 * The headlines written again in place: under a key in both answers, saying something else. Each is crossfaded rather
 * than moved (`recomposer`'s `swap`). A headline that came or went is a block that came or went, and is not here.
 */
export function rewritten(was: ReadonlyMap<string, string>, now: ReadonlyMap<string, string>): Set<string> {
  const out = new Set<string>();
  for (const [key, said] of now) {
    const before = was.get(key);
    if (before !== undefined && before !== said) out.add(key);
  }
  return out;
}

/**
 * Whether a block now drawn stands over the place one that left held, by more than a pixel each way. Such a place is
 * taken, and the one that left goes at once rather than fading under its successor (`recomposer`).
 */
export function covered(box: Box, now: Iterable<Box>): boolean {
  for (const b of now) {
    const w = Math.min(box.x + box.w, b.x + b.w) - Math.max(box.x, b.x);
    const h = Math.min(box.y + box.h, b.y + b.h) - Math.max(box.y, b.y);
    if (w > 1 && h > 1) return true;
  }
  return false;
}

/* ── the page ──────────────────────────────────────────────────────────────── */

/** What a block's element carries its key in. */
export const KEY_ATTR = 'data-key';

const SLOTS = `.block-slot[${KEY_ATTR}]`;

/** A duration token in milliseconds, whichever unit it is written in, held under 300 whatever the skin says. */
function ms(style: CSSStyleDeclaration, token: string, fallback: number): number {
  const raw = style.getPropertyValue(token).trim();
  const n = Number.parseFloat(raw);
  const got = Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : fallback;
  return Math.min(280, Math.max(0, got));
}

/** A forming step in milliseconds, held under half a second whatever the skin says. */
function formMs(style: CSSStyleDeclaration, token: string, fallback: number): number {
  return Math.min(420, readMs(style, token, fallback));
}

function readMs(style: CSSStyleDeclaration, token: string, fallback: number): number {
  const raw = style.getPropertyValue(token).trim();
  const n = Number.parseFloat(raw);
  return Math.max(0, Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : fallback);
}

/** The skin's spring (`--ease-spring`), where this browser can play it, else `null`. */
function springOf(style: CSSStyleDeclaration): string | null {
  const curve = style.getPropertyValue('--ease-spring').trim();
  if (!curve) return null;
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', curve) ? curve : null;
}

/**
 * THE ELEMENT A COPY IS LAID AGAINST: the page itself, or, where the page has no box of its own (`display: contents`, as
 * on Today's desk, where the page's blocks are tiles of the board), the nearest ancestor that is positioned, which is
 * the box an absolutely placed copy is placed in. Measured against the page's empty box a copy stood where the window
 * said, and had to be pinned to the window to look right.
 *
 * AN ANCESTOR WITH NO BOX OF ITS OWN IS PASSED OVER TOO, positioned or not (fluid F8). On the desk the page's reader is
 * `display: contents` as well, and it is positioned, so its 0 by 0 box was the frame: no block fit in no room, every
 * move was planned as a redraw, and the tiles under an answer blinked out and faded back instead of sliding.
 */
export function frameOf(page: HTMLElement): HTMLElement {
  if (typeof getComputedStyle !== 'function' || getComputedStyle(page).display !== 'contents') return page;
  let up = page.parentElement;
  while (up) {
    const style = getComputedStyle(up);
    if (style.position !== 'static' && style.display !== 'contents') break;
    up = up.parentElement;
  }
  return up ?? page;
}

/** Each drawn block's element and box, by key, measured against the page's own box. */
function measure(page: HTMLElement): Map<string, { el: HTMLElement; box: Box }> {
  const origin = frameOf(page).getBoundingClientRect();
  const out = new Map<string, { el: HTMLElement; box: Box }>();
  for (const el of page.querySelectorAll<HTMLElement>(SLOTS)) {
    /* A GHOST STILL FADING is not a block of the page. */
    if (el.hasAttribute('data-leaving')) continue;
    const key = el.getAttribute(KEY_ATTR);
    if (!key || out.has(key)) continue;
    const r = el.getBoundingClientRect();
    out.set(key, { el, box: { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height } });
  }
  return out;
}

const boxes = (m: Map<string, { box: Box }>): Map<string, Box> => new Map([...m].map(([k, v]) => [k, v.box]));

/** The first second of a screen, in which it settles rather than moves (`recomposer`). */
export const SETTLE = 1000;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Whether this reader asked for less motion. */
const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One recomposition, begun before the page draws the new answer: `before()` is called then, and the function it returns
 * is called once the page has drawn, and plays the change. `false` from `before` is no recomposition (nothing measured
 * yet, a page that is another page, a tab nobody is looking at), and the new answer is simply drawn.
 *
 * A LEAVING BLOCK IS ITS OWN ELEMENT, COPIED BEFORE IT GOES, laid over the place it held, out of the flow so nothing
 * moves under it, and taken away once it has faded. A copy and not the element itself, because the page has already
 * taken that element out of the document by the time the change plays.
 *
 * NOTHING MOVES IN THE FIRST SECOND OF A SCREEN (`SETTLE`). A screen opening draws its answer, then its first poll and
 * its first measure land on top of it; played, each of those slid the tiles the reader had only just seen, and on
 * Today the whole board did it twice before it was still. The clock starts when the recomposer is made and again each
 * time its owner stops it, which `PageBody` does for every draw that is not this page changing: a page that is another
 * page, its first measure, the arrange mode opening or shutting.
 */
export function recomposer(): {
  before: (page: HTMLElement, next: ReadonlySet<string>, swap?: ReadonlySet<string>) => (() => void) | null;
  stop: () => void;
} {
  let running: Animation[] = [];
  let ghosts: HTMLElement[] = [];
  let opened = now();
  /**
   * A CHANGE MEASURED AND NOT YET PLAYED: the page as the reader last saw it, and the copies of what was leaving it.
   * Two answers drawn in one breath (a write's answer and the read behind it, two flushes before the next frame) each
   * asked for a recomposition, and the second measured the page with the first's animations already on it: every tile
   * was played twice at once, the second time back the way it came (audit 11-01, AP4). Now the second joins the first,
   * from what the reader last saw, and only the newest plays.
   */
  let pending: { was: Map<string, { el: HTMLElement; box: Box }>; copies: Map<string, Copy>; swaps: Map<string, Copy>; turn: number } | null = null;
  let turns = 0;

  function halt() {
    for (const a of running.splice(0)) a.cancel();
    for (const g of ghosts.splice(0)) g.remove();
  }

  /** Ends what is playing, and starts the screen's first second again: what is drawn next is the screen settling. */
  function stop() {
    halt();
    pending = null;
    turns += 1;
    opened = now();
  }

  /** A copy of a block as it is drawn now, styled to stand where it stood once the page has moved on. */
  function copyOf(el: HTMLElement): Copy {
    const s = getComputedStyle(el);
    return {
      node: el.cloneNode(true) as HTMLElement,
      style: { padding: s.padding, background: s.background, borderRadius: s.borderRadius, boxShadow: s.boxShadow },
    };
  }

  /**
   * Lays a copy over the place a block held and fades it out, then takes it away.
   *
   * A BLOCK THAT LEFT FADES UNDER THE PAGE (`under`), never over it: it goes in as the page's first child at
   * `z-index: 0`, so the blocks drawn after it, which are positioned too, paint over it, and a block that moved into
   * the place it held is read at once rather than through the old one for the length of the fade. It was appended
   * last, and the old content lay over the new block, which under reduced motion does not even move out from under it.
   * A HEADLINE'S OLD WORDS ARE OVER their new ones, which is the crossfade.
   *
   * IT IS PLACED AGAINST THE BOX IT IS POSITIONED IN, its `offsetParent`, which is not always the box the page was
   * measured against: where the page has no box of its own the copy's containing block is further up, and a copy
   * placed by the page's numbers stood off its place by the distance between the two (on Today, by the page's head).
   */
  function ghost(page: HTMLElement, copy: Copy, box: Box, leave: KeyframeAnimationOptions, under: boolean) {
    const g = copy.node;
    /* NOTHING IN A GHOST IS THE PAGE'S: no id twice in the document, nothing to focus or press, nothing read out. */
    for (const n of [g, ...g.querySelectorAll('[id]')]) n.removeAttribute('id');
    for (const n of g.querySelectorAll('[data-row]')) n.removeAttribute('data-row');
    /* NOR THE CURSOR'S RING OR A LANDING LINE (`PageBody.svelte`): a ring round a block that has gone, and a landing
       line raised over the page (`--z-raise`), would both be read as the live page's for the length of the fade. */
    for (const n of [g, ...g.querySelectorAll('[data-cursor], [data-row-cursor], [data-drop]')]) {
      n.removeAttribute('data-cursor');
      n.removeAttribute('data-row-cursor');
      n.removeAttribute('data-drop');
    }
    g.setAttribute('data-leaving', '');
    g.setAttribute('aria-hidden', 'true');
    g.inert = true;
    Object.assign(g.style, copy.style, {
      position: 'absolute',
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.w}px`,
      height: `${box.h}px`,
      margin: '0',
      gridColumn: 'auto',
      gridRow: 'auto',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      zIndex: under ? '0' : '',
    });
    if (under) page.prepend(g);
    else page.append(g);
    /* THE BOX IN THE PAGE'S NUMBERS, moved into its containing block's: the page's box in the window, less the padding
       box of the element the copy is positioned in, plus what that element has scrolled. */
    const host = g.offsetParent;
    if (host instanceof HTMLElement) {
      const frame = frameOf(page).getBoundingClientRect();
      const at = host.getBoundingClientRect();
      g.style.left = `${box.x + frame.left - at.left - host.clientLeft + host.scrollLeft}px`;
      g.style.top = `${box.y + frame.top - at.top - host.clientTop + host.scrollTop}px`;
    }
    ghosts.push(g);
    const a = g.animate({ opacity: [1, 0] }, { ...leave, fill: 'forwards' });
    running.push(a);
    void a.finished.then(
      () => g.remove(),
      () => g.remove(),
    );
  }

  function before(page: HTMLElement, next: ReadonlySet<string>, swap: ReadonlySet<string> = new Set()): (() => void) | null {
    const turn = ++turns;
    /* A CHANGE MEASURED AND NOT YET PLAYED IS JOINED, not measured again: the page is still as the reader last saw it
       less what the first draw already took out, and that is where every block plays from. */
    if (pending) {
      const joined = pending;
      joined.turn = turn;
      for (const [key, { el }] of joined.was) {
        if (!el.isConnected) continue;
        if (!next.has(key) && !joined.copies.has(key)) joined.copies.set(key, copyOf(el));
        else if (next.has(key) && swap.has(key) && !joined.swaps.has(key)) joined.swaps.set(key, copyOf(el));
      }
      return () => play(page, joined, turn);
    }
    /* A CHANGE STILL PLAYING ENDS HERE, so the next one starts from the page and not from its middle. */
    halt();
    if (now() - opened < SETTLE) return null;
    /* NOR ON A BOARD STILL SETTLING (`Board.svelte`'s `data-still`): Today's tiles land where they are, never slid there
       from where the copy drew them (live check of 30 October, item 8). */
    if (typeof page.closest === 'function' && page.closest('[data-still]')) return null;
    if (typeof document !== 'undefined' && document.hidden) return null;
    if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return null;
    const was = measure(page);
    if (was.size === 0) return null;
    /* THE BLOCKS THAT ARE LEAVING, and the ones whose words are written again, copied while they are still drawn as
       they were. */
    const copies = new Map<string, Copy>();
    const swaps = new Map<string, Copy>();
    for (const [key, { el }] of was) {
      if (!next.has(key)) copies.set(key, copyOf(el));
      else if (swap.has(key)) swaps.set(key, copyOf(el));
    }
    const mine = { was, copies, swaps, turn };
    pending = mine;
    return () => play(page, mine, turn);
  }

  /**
   * Plays one recomposition, once the page has drawn: only the newest asked for (`turn`), and once. ONE ANIMATION ON
   * EACH BLOCK: what moved slides, what arrived rises, what is drawn anew fades, and no block is given two.
   */
  function play(page: HTMLElement, change: NonNullable<typeof pending>, turn: number): void {
    if (change.turn !== turn || pending !== change) return;
    pending = null;
    const { was, copies, swaps } = change;
    const now = measure(page);
    const plan = planOf(boxes(was), boxes(now), frameOf(page).getBoundingClientRect().width);
    const style = getComputedStyle(page);
    const less = still();
    const ease = (token: string, fallback: string) => style.getPropertyValue(token).trim() || fallback;
    /* ONE STEP FOR THE PAGE MOVING, `--d-recompose`, on the curves the scale names for it: what changes place rides the
       standard curve, what arrives the emphasised one, and what leaves accelerates away. */
    const recompose = ms(style, '--d-recompose', 220);
    /* THE RECORD FORMING (`$lib/motion`): a block that arrives rises into place on the spring over `--form-in`, and
       the blocks making room for it slide there on the same spring over `--form-settle`, each under half a second.
       A browser that cannot read the spring (`linear()`) is given the curves above, and the old steps. */
    const spring = springOf(style);
    const move = spring ? { duration: formMs(style, '--form-settle', 380), easing: spring } : { duration: recompose, easing: ease('--ease-standard', 'ease-in-out') };
    const enter = spring ? { duration: formMs(style, '--form-in', 320), easing: spring } : { duration: recompose, easing: ease('--ease-emphasis', 'ease-out') };
    /* LEAVING IS SHORTER THAN ARRIVING: the exit step, accelerating away. */
    const leave = { duration: ms(style, '--d-exit', 90), easing: ease('--ease-in', 'ease-in') };
    try {
      /* SHORT, AND ONE ANIMATION A BLOCK: a block that moved further than `SLIDE_MAX` glides the last stretch and
         fades in, in the same animation, rather than crossing the board (`slideOf`). */
      if (!less)
        for (const { key, dx: x, dy: y } of plan.moves) {
          const el = now.get(key)?.el;
          if (!el) continue;
          const { dx, dy, fade } = slideOf(x, y);
          const from = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
          running.push(el.animate(fade ? { opacity: [0, 1], transform: [from, 'none'] } : { transform: [from, 'none'] }, fade ? { ...enter, fill: 'backwards' } : move));
        }
      /* A BLOCK THAT CANNOT SLIDE INSIDE THE PAGE fades in where it now is, on opacity alone: nothing about it stands
         anywhere but its place. For a reader who asked for less motion it is simply there, as a moved block is. */
      if (!less)
        for (const key of plan.redrawn) {
          const el = now.get(key)?.el;
          if (el) running.push(el.animate({ opacity: [0, 1] }, { ...enter, fill: 'backwards' }));
        }
      for (const key of plan.enters) {
        const el = now.get(key)?.el;
        if (!el) continue;
        running.push(el.animate(less ? { opacity: [0, 1] } : { opacity: [0, 1], transform: ['translateY(12px) scale(0.97)', 'none'] }, { ...enter, fill: 'backwards' }));
      }
      /* A PLACE ANOTHER BLOCK NOW TAKES IS LET GO OF QUICKLY. Under it is not enough: a list drawn without a box has
         no ground, so the old block's words read through the new one's for the whole fade. It fades on the shorter
         step and front-loaded, gone before the block moving in has landed; for a reader who asked for less motion,
         where the block is simply there, it is not drawn at all. */
      const drawn = [...now.values()].map((v) => v.box);
      /* ON THE EXIT'S STEP, NOT THE SWAP'S (skills pass 2 Nov): over `--d-swap` a ticked last bill's "Bills and invoices"
         was still a third there when "Repeating, a month" slid into its place, and the two tiles' words read as one. */
      const quick = { duration: leave.duration, easing: ease('--ease-out', 'ease-out') };
      for (const { key, box } of plan.leaves) {
        const copy = copies.get(key);
        if (!copy) continue;
        const taken = covered(box, drawn);
        if (taken && less) continue;
        ghost(page, copy, box, taken ? quick : leave, true);
      }
      /* A HEADLINE WRITTEN AGAIN: its old words fade out where they stood, over the new ones fading in. Opacity only,
         so a reader who asked for less motion sees it too, as the soft change it is. A swap that also moved is laid
         where it was, since that is where the eye still is.

         THE WORDS CROSSFADE AND THE TILE STAYS. The copy carries no surface of its own and the tile is not faded,
         only what is in it: a copy with the tile's ground would dim the tile for the length of the fade and lie over
         the page's head, which rides over the top of the headline's tile (`PageHead`'s `over`).

         AND THEY HAND OVER, THEY NEVER CROSS (Look B's motion rule, skills pass 2 Nov): faded over each other on one
         step, Reports' "Since 1 Aug: $45,862 in…" and "The last 3 months: $33,374 in…" stood at half strength on the
         same line for a moment, two sentences in one. The old words go on the exit's step (`--d-exit`, accelerating
         away), and the new ones come up on the arrival's (`--d-enter`) as the old are gone: 200ms in all. */
      const handOut = { duration: leave.duration, easing: ease('--ease-in', 'ease-in') };
      const handIn = { duration: ms(style, '--d-enter', 110), easing: ease('--ease-out', 'ease-out'), delay: leave.duration };
      /* ONLY THE WORDS HAND OVER. A page's lead slot holds its head's buttons and its filter strip beside the sentence, and
         faded with it the chip just pressed went out and came back; they are the same before and after, so they stand. */
      const wordsOf = (node: Element): Element[] => {
        const all = [...node.children];
        const words = all.filter((c) => c.matches('.block'));
        return words.length > 0 ? words : all;
      };
      for (const [key, copy] of swaps) {
        const el = now.get(key)?.el;
        const box = was.get(key)?.box;
        if (!el || !box) continue;
        const kept = wordsOf(copy.node);
        for (const child of copy.node.children) if (!kept.includes(child)) (child as HTMLElement).style.visibility = 'hidden';
        ghost(page, { node: copy.node, style: { ...copy.style, background: 'transparent', boxShadow: 'none' } }, box, handOut, false);
        for (const child of wordsOf(el)) running.push(child.animate({ opacity: [0, 1] }, { ...handIn, fill: 'backwards' }));
      }
    } catch {
      /* A timing a browser cannot read is a page that changes in one frame, which is what it did before. */
      halt();
    }
  }

  return { before, stop };
}

/** A block's element copied before it goes, with the look it had. */
type Copy = { node: HTMLElement; style: Partial<CSSStyleDeclaration> };
