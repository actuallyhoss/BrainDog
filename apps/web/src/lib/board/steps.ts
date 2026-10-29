/**
 * WHAT THE EDITOR DID, AS STEPS (the widgets plan of 29 October, §5.5): the board it started from and the board it ended
 * on, said as the moves, sizes, adds and removals that turn one into the other, which the record lays on the page as it
 * stands (`packages/record/src/board-steps.ts`). PURE.
 */

import type { WidgetSize } from 'braindog-render';

import type { Phone } from './items.ts';

/** A board's arrangement in the editor: the laptop's order and sizes, and the phone's own, once it has one. */
export type Arranged = {
  order: readonly string[];
  sizes: Readonly<Record<string, WidgetSize>>;
  phone: Phone | null;
};

/** One step, as `boardSteps` takes it. */
export type Step =
  | { move: string; before: string | null }
  | { size: string; to: WidgetSize }
  | { add: Record<string, unknown>; before?: string | null }
  | { remove: string }
  | { keep: string }
  | { set: string; block: Record<string, unknown> }
  | { phone: Phone | null };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The steps from `from` to `to`. `added` are the widgets the sheet added in this edit, each under the key it was drawn
 * with, which `to.order` already places. Removed widgets go first, then the adds, then each size, then the order, last
 * to first, each before the one after it, so the order lands whatever the record's page held besides.
 */
export function stepsBetween(from: Arranged, to: Arranged, added: readonly Record<string, unknown>[] = []): Step[] {
  const steps: Step[] = [];
  const now = new Set(to.order);
  const fresh = new Set(added.map((b) => String(b.key)));
  for (const k of from.order) if (!now.has(k)) steps.push({ remove: k });
  for (const b of added) if (now.has(String(b.key))) steps.push({ add: { ...b, size: to.sizes[String(b.key)] ?? b.size }, before: null });
  for (const k of to.order) if (!fresh.has(k) && from.sizes[k] !== to.sizes[k] && to.sizes[k] !== undefined) steps.push({ size: k, to: to.sizes[k]! });
  const was = from.order.filter((k) => now.has(k));
  const kept = to.order.filter((k) => !fresh.has(k));
  if (added.length > 0 || !same(was, kept)) {
    for (let i = to.order.length - 1; i >= 0; i -= 1) steps.push({ move: to.order[i]!, before: to.order[i + 1] ?? null });
  }
  if (!same(from.phone, to.phone)) steps.push({ phone: to.phone });
  return steps;
}
