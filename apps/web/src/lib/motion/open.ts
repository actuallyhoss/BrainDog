/**
 * TWO SMALL MOTIONS THE SETTINGS PASS OF 2 NOVEMBER NEEDED, on the answering scale (`tokens.css`), in a file of their own
 * so the shared `index.ts` stays the motion lane's.
 *
 *   {#if open}<ul in:opens out:shuts>…</ul>{/if}         a part opened under its button, as a `<details>` opens
 *   {#key on}<p in:handOver>{said(on)}</p>{/key}          a line that says what a switch now means, changed in place
 *
 * `opens` grows the part from nothing to its own height over `--d-rows` (180) on the emphasis curve and `shuts` takes it
 * back over `--d-exit` (90), accelerating away: the same steps `motion.css` gives every `<details>`, so a button that
 * opens a part reads like a disclosure. `handOver` is the new words fading up with a 2px settle over `--d-swap` (160);
 * the old ones are simply gone, so two sentences never cross. Nothing in a screen's first second (`calm`), and under
 * reduced motion everything is at once.
 */

import { cubicIn, cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

import { calm, ms, still } from './index.ts';

const NONE: TransitionConfig = { duration: 0 };

/** The height a part takes, as CSS, at `t` of the way open. */
const heightAt = (h: number, t: number): string => `block-size:${(h * t).toFixed(1)}px;overflow:clip;opacity:${Math.min(1, t * 1.5).toFixed(3)}`;

/** A PART OPENING under the button that opened it: its height from nothing over `--d-rows`, the emphasis curve. */
export function opens(node: Element): TransitionConfig {
  if (calm() || still()) return NONE;
  const h = (node as HTMLElement).offsetHeight;
  return { duration: ms('--d-rows', 180), easing: cubicOut, css: (t) => heightAt(h, t) };
}

/** A PART CLOSING: back to nothing over `--d-exit`, accelerating away. */
export function shuts(node: Element): TransitionConfig {
  if (still()) return NONE;
  const h = (node as HTMLElement).offsetHeight;
  return { duration: ms('--d-exit', 90), easing: cubicIn, css: (t) => heightAt(h, t) };
}

/** NEW WORDS IN PLACE: they fade up with a 2px settle over `--d-swap`; nothing in a screen's first second. */
export function handOver(_node: Element): TransitionConfig {
  if (calm() || still()) return NONE;
  return { duration: ms('--d-swap', 160), easing: cubicOut, css: (t, u) => `opacity:${t.toFixed(3)};transform:translateY(${(u * 2).toFixed(2)}px)` };
}
