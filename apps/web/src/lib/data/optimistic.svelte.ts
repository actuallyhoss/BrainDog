/**
 * `optimistic.ts`'s overlay and arrivals, each kept in step with a rune so a component that draws from them redraws
 * when they move. The rules are all in `optimistic.ts`; this file only says "something changed" to Svelte.
 *
 * `run` IS THE APP'S: `optimist` over the app's toasts, with the six-second Undo. A screen imports it and hands it a
 * `Change`; nothing else about a write is decided here.
 */

import { untrack } from 'svelte';

import { apiBase } from '../at.ts';
import { undoChange } from '../record/undo-write.ts';
import { toasts } from '../ui/toast.svelte.ts';
import { reread } from './live.svelte.ts';
import { arrivals, optimist, overlay, ARRIVED_MS } from './optimistic.ts';
import { history } from './undo.ts';

export { type Change, type Sent, type Pending, UNDO_MS } from './optimistic.ts';

/**
 * Runs one optimistic change against the app's toasts (`optimist` in `optimistic.ts`). A write that landed under a batch
 * is undone by the record itself (`undoChange`), and the screen's own inverse is the fallback. A change that names no
 * `reread` has every screen read again once the record put it back (`live.svelte.ts` `reread`). Each write that landed
 * under a batch is held on the tab's `history` (`undo.ts`), which ⌘Z reaches back through once its toast is gone.
 */
export const run = optimist(toasts, { undoBatch: (batch) => undoChange(apiBase(), batch), reread, history }).run;

/**
 * An overlay a component draws from. `draw` reads a rune, so a `$derived` over it redraws when a change is added or
 * dropped. Create it while the component initialises, as any rune.
 */
export function liveOverlay<R>(keyOf: (row: R) => string) {
  let beat = $state(0);
  /* UNTRACKED, so a change made inside an effect never makes that effect depend on the overlay it changed. */
  const layer = overlay(keyOf, () => untrack(() => void beat++));
  return {
    get size() {
      void beat;
      return layer.size;
    },
    patch: layer.patch,
    add: layer.add,
    remove: layer.remove,
    drop: layer.drop,
    clear: layer.clear,
    draw(rows: readonly R[]): R[] {
      void beat;
      return layer.draw(rows);
    },
  };
}

/**
 * The rows of each list that arrived since it was last drawn, and a redraw when their tint runs out, so the attribute
 * goes with the colour and a row drawn again later never flashes twice.
 */
export function liveArrivals(ms = ARRIVED_MS) {
  let beat = $state(0);
  const seen = arrivals(Date.now, ms);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const later = () => {
    const at = seen.next();
    if (at === null || timer !== null) return;
    timer = setTimeout(
      () => {
        timer = null;
        beat++;
      },
      Math.max(0, at - Date.now()) + 20,
    );
  };
  return {
    /**
     * The keys of `list` still marked as arrived, noting the ones it draws now. Safe to call while drawing. `answered`
     * is the live read's word on this look (`arrivals` in `optimistic.ts`): true makes an empty look a baseline.
     */
    see(list: string, keys: readonly string[], answered?: boolean): ReadonlySet<string> {
      void beat;
      const out = seen.see(list, keys, answered);
      later();
      return out;
    },
    /** Every list is a baseline again: the screen changed under it. */
    forget(): void {
      seen.forget();
    },
  };
}
