/**
 * A page recomposing in place: when its answer changes (a poll, a write, a headline written again), each block moves
 * from where it was to where it is, a new one fades and rises in, and one that left fades out where it stood
 * (DIRECTION §38: "the page recomposes live and the change animates in place, without a reload or a jump").
 *
 * FLIP, ON THE BLOCKS AS DRAWN. `PageBody` measures every block before the page draws the new answer and again after,
 * and each block that moved is played from its old place to its new one on transform alone, so nothing is laid out
 * twice. The old content stays on screen until the new answer is drawn, because the caller keeps it (`reread`), so
 * there is no blank frame to animate over.
 *
 * A BLOCK IS KNOWN BY WHAT IT IS, NOT BY ITS PLACE. The page keys every id and write by a block's declared index, so a
 * page written again with a block put in at the top would have "block 3" be another block; following the index would
 * slide the wrong tile. `blockKeys` names each block by its kind, its source and its heading, which a regenerated page
 * keeps for the block that is the same block.
 *
 * WITHIN THE SKIN'S MOTION AND UNDER 300ms. A reader who asked for less motion sees only opacity: a new block fades in,
 * one that left fades out, and one that moved is simply where it is.
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
  /** Blocks only in the new answer. */
  enters: string[];
  /** Blocks only in the old answer, with the place each held. */
  leaves: { key: string; box: Box }[];
};

/** Under a pixel is no move at all: a re-read that changed nothing must play nothing. */
const STILL = 0.5;

/**
 * Each block's key, by index: its kind, its source or list, and its heading, with a count where two blocks on one page
 * would share them. Every block is named, drawn or not, so a block that comes back keeps the name it had.
 */
export function blockKeys(blocks: readonly { kind: string; source?: string | undefined; register?: string | undefined; heading?: string | undefined; lead?: unknown }[]): string[] {
  const seen = new Map<string, number>();
  return blocks.map((b) => {
    const base = [b.kind, b.lead === true ? 'lead' : '', b.source ?? b.register ?? '', (b.heading ?? '').trim().toLowerCase()].join('|');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** Which blocks moved, which came and which went, between two measures of the page. */
export function planOf(before: ReadonlyMap<string, Box>, after: ReadonlyMap<string, Box>): Plan {
  const moves: Plan['moves'] = [];
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
    if (Math.abs(dx) >= STILL || Math.abs(dy) >= STILL) moves.push({ key, dx, dy });
  }
  for (const [key, box] of before) if (!after.has(key)) leaves.push({ key, box });
  return { moves, enters, leaves };
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

/** Each drawn block's element and box, by key, measured against the page's own box. */
function measure(page: HTMLElement): Map<string, { el: HTMLElement; box: Box }> {
  const origin = page.getBoundingClientRect();
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

/** Whether this reader asked for less motion. */
const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One recomposition, begun before the page draws the new answer: `before()` is called then, and the function it returns
 * is called once the page has drawn, and plays the change. `false` from `before` is no recomposition (nothing measured
 * yet, a page that is another page, a tab nobody is looking at), and the new answer is simply drawn.
 *
 * A LEAVING BLOCK IS ITS OWN ELEMENT, COPIED BEFORE IT GOES, laid over the place it held, out of the flow so nothing
 * moves under it, and taken away once it has faded. A copy and not the element itself, because the page keys its
 * elements by place and may already have drawn another block into the one that held it.
 */
export function recomposer(): { before: (page: HTMLElement, next: ReadonlySet<string>) => (() => void) | null; stop: () => void } {
  let running: Animation[] = [];
  let ghosts: HTMLElement[] = [];

  function stop() {
    for (const a of running.splice(0)) a.cancel();
    for (const g of ghosts.splice(0)) g.remove();
  }

  function before(page: HTMLElement, next: ReadonlySet<string>): (() => void) | null {
    /* A CHANGE STILL PLAYING ENDS HERE, so the next one starts from the page and not from its middle. */
    stop();
    if (typeof document !== 'undefined' && document.hidden) return null;
    if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return null;
    const was = measure(page);
    if (was.size === 0) return null;
    /* THE BLOCKS THAT ARE LEAVING, copied while they are still drawn as they were. */
    const copies = new Map<string, { node: HTMLElement; style: Partial<CSSStyleDeclaration> }>();
    for (const [key, { el }] of was) {
      if (next.has(key)) continue;
      const s = getComputedStyle(el);
      copies.set(key, {
        node: el.cloneNode(true) as HTMLElement,
        style: { padding: s.padding, background: s.background, borderRadius: s.borderRadius, boxShadow: s.boxShadow },
      });
    }
    return () => {
      const now = measure(page);
      const plan = planOf(boxes(was), boxes(now));
      const style = getComputedStyle(page);
      const less = still();
      const ease = (token: string, fallback: string) => style.getPropertyValue(token).trim() || fallback;
      const move = { duration: ms(style, '--d-move', 240), easing: ease('--ease-out', 'ease-out') };
      const enter = { duration: ms(style, '--d-page', 200), easing: ease('--ease-out', 'ease-out') };
      const leave = { duration: ms(style, '--d-rows', 180), easing: ease('--ease-in', 'ease-in') };
      try {
        if (!less)
          for (const { key, dx, dy } of plan.moves) {
            const el = now.get(key)?.el;
            if (el) running.push(el.animate({ transform: [`translate(${dx}px, ${dy}px)`, 'none'] }, move));
          }
        for (const key of plan.enters) {
          const el = now.get(key)?.el;
          if (!el) continue;
          running.push(el.animate(less ? { opacity: [0, 1] } : { opacity: [0, 1], transform: ['translateY(8px)', 'none'] }, { ...enter, fill: 'backwards' }));
        }
        for (const { key, box } of plan.leaves) {
          const copy = copies.get(key);
          if (!copy) continue;
          const g = copy.node;
          /* NOTHING IN A GHOST IS THE PAGE'S: no id twice in the document, nothing to focus or press, nothing read out. */
          for (const n of [g, ...g.querySelectorAll('[id]')]) n.removeAttribute('id');
          for (const n of g.querySelectorAll('[data-row]')) n.removeAttribute('data-row');
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
            zIndex: '0',
          });
          page.append(g);
          ghosts.push(g);
          const a = g.animate({ opacity: [1, 0] }, { ...leave, fill: 'forwards' });
          running.push(a);
          void a.finished.then(
            () => g.remove(),
            () => g.remove(),
          );
        }
      } catch {
        /* A timing a browser cannot read is a page that changes in one frame, which is what it did before. */
        stop();
      }
    };
  }

  return { before, stop };
}
