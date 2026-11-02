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

/* A STRONG EASE-OUT, A QUARTIC (leftovers9, Sam: "the animation of the numbers moving too slowly is shit, make it faster
   and smoother"). Over 420ms on a cubic, a figure crawled through its last digits for the second half of the count; now
   it covers nine tenths of the way in the first third of `--form-count`, 300ms, and settles. */
const easeOut = (t: number): number => 1 - (1 - t) ** 4;

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
