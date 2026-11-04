/**
 * A FIGURE COUNTING TO ITS NEW VALUE: "£1,240" becoming "£1,310" passes through the numbers between, over
 * `--form-count`, easing out. Pure here (`shapeOf`, `between`), so a figure that cannot count (a word, a date, a sign
 * that flipped, another currency) is told apart from one that can before anything moves; `countText` is the half that
 * writes to the page.
 */

import { ms, still } from '../ui/motion.ts';

/** What surrounds a figure's number, the number, and how it is written. */
export type Shape = { pre: string; n: number; post: string; places: number; grouped: boolean };

const FIGURE = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)([^\d]*)$/u;

/** A figure's shape, or `null` for text that is not one figure (a word, a range, a date, two numbers). */
export function shapeOf(text: string): Shape | null {
  const m = FIGURE.exec(text.trim());
  if (!m) return null;
  const digits = m[2]!;
  if (digits.includes(',') && !/^\d{1,3}(,\d{3})*(\.\d+)?$/u.test(digits)) return null;
  const n = Number.parseFloat(digits.replaceAll(',', ''));
  if (!Number.isFinite(n)) return null;
  const dot = digits.indexOf('.');
  return { pre: m[1]!, n, post: m[3]!, places: dot === -1 ? 0 : digits.length - dot - 1, grouped: digits.includes(',') };
}

/**
 * Whether `from` can count to `to`: both one figure with the same words round it (so the currency, the sign and the
 * unit hold), and a different number. Anything else changes as it always did.
 */
export function counts(from: string, to: string): [Shape, Shape] | null {
  const a = shapeOf(from);
  const b = shapeOf(to);
  if (!a || !b || a.pre !== b.pre || a.post !== b.post || a.n === b.n) return null;
  return [a, b];
}

/** The figure `t` of the way from `a` to `b`, written as `b` is written. */
export function between(a: Shape, b: Shape, t: number): string {
  const n = a.n + (b.n - a.n) * t;
  const said = n.toLocaleString('en-GB', { minimumFractionDigits: b.places, maximumFractionDigits: b.places, useGrouping: a.grouped || b.grouped });
  return `${b.pre}${said}${b.post}`;
}

/* A STRONG EASE-OUT, cubic-bezier(0.22, 1, 0.36, 1) (leftovers9, the owner: "the animation of the numbers moving too slowly
   is shit, make it faster and smoother"). Over 420ms on a cubic, a figure crawled through its last digits for the second
   half of the count; now it covers about nine tenths of the way in the first third of `--form-count`, 300ms, and
   settles without a step. The curve's x is solved for each frame's share of the time (Newton's method, then halving
   where it stalls), and its y is how far along the figure is. */
const BEZIER = [0.22, 1, 0.36, 1] as const;
const axis = (p1: number, p2: number) => (u: number): number => 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3;
const slope = (p1: number, p2: number) => (u: number): number => 3 * (1 - u) ** 2 * p1 + 6 * (1 - u) * u * (p2 - p1) + 3 * u ** 2 * (1 - p2);
const bx = axis(BEZIER[0], BEZIER[2]);
const by = axis(BEZIER[1], BEZIER[3]);
const dx = slope(BEZIER[0], BEZIER[2]);
export const easeOut = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const err = bx(u) - t;
    if (Math.abs(err) < 1e-5) return by(u);
    const d = dx(u);
    if (Math.abs(d) < 1e-6) break;
    u -= err / d;
  }
  let lo = 0;
  let hi = 1;
  u = t;
  for (let i = 0; i < 30; i++) {
    if (bx(u) < t) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return by(u);
};

const running = new WeakMap<Text, number>();
/** Whether a text is still counting: what it says now is a figure on its way, not the one it will stay at. */
export const counting = (text: Node): boolean => running.has(text as Text);
/** What this module last wrote into each text, so its own writes are not taken for the record's. */
export const wrote = new WeakMap<Text, string>();

/**
 * Counts a text from `from` to what it says now, writing each frame into the text itself, and leaves it saying exactly
 * what it said. A count still running on the same text is taken over from where it stands. Nothing under reduced
 * motion, and nothing for a change that cannot count.
 */
export function countText(text: Text, from: string, to: string): boolean {
  const pair = counts(from, to);
  if (!pair || still() || typeof requestAnimationFrame !== 'function') return false;
  const [a, b] = pair;
  const prior = running.get(text);
  if (prior !== undefined) cancelAnimationFrame(prior);
  const long = ms('--form-count', 300);
  if (long <= 0) return false;
  const start = performance.now();
  const step = (at: number) => {
    const t = Math.min(1, (at - start) / long);
    const said = t >= 1 ? to : between(a, b, easeOut(t));
    wrote.set(text, said);
    text.nodeValue = said;
    if (t < 1) running.set(text, requestAnimationFrame(step));
    else running.delete(text);
  };
  wrote.set(text, from);
  text.nodeValue = from;
  running.set(text, requestAnimationFrame(step));
  return true;
}
