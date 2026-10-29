/**
 * ONE ORDER FOR THE PROJECTS, WHEREVER THEY ARE DRAWN: the sidebar's, pins and then by name (`side.ts` `byWeek`). The sidebar
 * keeps the order it drew on this device, by record, and Today's cards read it (`project-cards.ts` `cardsOf`), so the
 * same projects never stand in two orders side by side. Read safely: a browser that keeps nothing, or a test with no
 * browser, reads no order, and the cards keep their own.
 */

import { apiBase } from '../at.ts';

export const ORDER_KEY = 'bd_side_order';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

const here = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** Keeps the order the sidebar drew for the record at `base`, by each project's key. */
export function keepOrder(base: string, keys: readonly string[], store: Store | null = here()): void {
  if (!store || keys.length === 0) return;
  try {
    const all = JSON.parse(store.getItem(ORDER_KEY) ?? '{}') as Record<string, unknown>;
    all[base] = [...keys];
    store.setItem(ORDER_KEY, JSON.stringify(all));
  } catch {
    /* Kept for nobody: the cards keep their own order. */
  }
}

/** The order last drawn for the record at `base` (the one the address is in, by default), or none. */
export function keptOrder(base: string | null = null, store: Store | null = here()): readonly string[] {
  try {
    const at = base ?? apiBase();
    const v = (JSON.parse(store?.getItem(ORDER_KEY) ?? '{}') as Record<string, unknown>)[at];
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}
