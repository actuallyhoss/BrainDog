/**
 * THE APP'S MOTION, for the drawings of the app on this site (the redo of 2 November): a row answered on Needs you lets
 * go and its gap closes, a done line arrives, an answer changes in place. The values are the skin's tokens
 * (`--form-in`, `--form-out`, `--form-settle`, `--d-swap`, with the app's spring), read off the page the way the app's
 * `$lib/ui/motion.ts` and `$lib/motion` read them, and the curves are theirs, written again here because the site does
 * not build against the app's source. So a press on the site moves the way the same press moves in the product.
 *
 * Transform, opacity and the one closing height; only on a real change, never on a first draw; under
 * `prefers-reduced-motion` nothing moves or fades, and every change is at once, as the site's CSS motion is.
 */
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/** The app's spring (`apps/web/src/lib/motion/spring.ts`): most of the way in the first third, 2.8% past, back. */
const DAMP = 6.5;
const RING = (DAMP / 0.75) * Math.sqrt(1 - 0.75 * 0.75);
export const spring = (t: number): number =>
  t >= 1 ? 1 : t <= 0 ? 0 : 1 - Math.exp(-DAMP * t) * (Math.cos(RING * t) + (DAMP / RING) * Math.sin(RING * t));

/** Whether the reader asked for less motion. False where there is no `matchMedia`, as in the prerender. */
export const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A duration token in milliseconds, read off the root, or `fallback` where there is no page to read. */
export function ms(name: string, fallback: number): number {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n;
}

/**
 * A LINE ARRIVING IN A LIST (the app's `rowIn`): its row opens, so what is under it glides down to make room, while it
 * rises into place on the spring and fades in. At once under reduced motion.
 */
export function rowIn(node: Element): TransitionConfig {
  if (still()) return { duration: 0 };
  const h = (node as HTMLElement).offsetHeight;
  return {
    duration: ms('--form-in', 320),
    css: (p) => {
      const open = cubicOut(Math.min(1, p / 0.6));
      return `opacity:${Math.min(1, p * 3).toFixed(3)};transform:translateY(${((1 - spring(p)) * 8).toFixed(2)}px);block-size:${(h * open).toFixed(1)}px;overflow:clip`;
    },
  };
}

/**
 * A THING ANSWERED, LEAVING ITS PLACE IN A LIST (the app's `rowOut`): it lets go first (sinks and fades), then the gap
 * it held closes on the spring, so what is under it rises into the room rather than jumping.
 */
export function rowOut(node: Element): TransitionConfig {
  if (still()) return { duration: 0 };
  const h = (node as HTMLElement).offsetHeight;
  return {
    duration: ms('--form-out', 180) + ms('--form-settle', 380) / 2,
    css: (t) => {
      const u = 1 - t;
      const gone = Math.min(1, u / 0.45);
      const close = spring(Math.max(0, (u - 0.3) / 0.7));
      return `opacity:${(1 - cubicOut(gone)).toFixed(3)};transform:scale(${(1 - 0.03 * gone).toFixed(4)});block-size:${(h * (1 - close)).toFixed(1)}px;overflow:clip`;
    },
  };
}

/** A THING ARRIVING where nothing was (an empty state, a done line): it rises a few pixels from 97% on the spring. */
export function arrive(_node: Element): TransitionConfig {
  if (still()) return { duration: 0 };
  return {
    duration: ms('--form-in', 320),
    easing: spring,
    css: (t, u) => `opacity:${Math.min(1, t * 2.5)};transform:translateY(${(u * 6).toFixed(2)}px) scale(${(1 - u * 0.03).toFixed(4)})`,
  };
}
