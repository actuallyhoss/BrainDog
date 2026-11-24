/**
 * THE DRAWERS FEW PAGES HOLD, FETCHED WHEN A PAGE HOLDS ONE, IN THE APP. Every kind's drawer was in the one chunk every
 * declared page and Today wait on, so a page of cards and a note downloaded the forecast, the calendar, the form and
 * nine more (about three quarters of that chunk went unused on Today, measured with Lighthouse on 24 Nov). In the app
 * each kind named here is its own chunk: `Lazy.svelte` draws it once it has landed, and `preloadKinds` lets a host ask
 * for a page's drawers the moment it knows the page's kinds, so the block does not wait a round trip of its own.
 *
 * HELD FROM THE START EVERYWHERE ELSE. `#drawers` is `drawers-held.ts`, every drawer imported as before, and the app's
 * build resolves it to `drawers-fetched.ts` (`apps/web/vite.config.ts`). The site's pages are finished HTML on disk and
 * the tests render a block to a string: neither can wait for a chunk, and the site would hydrate over a body it did
 * not have yet. So only the app changes, and a host that says nothing draws every kind in its first frame.
 */
import type { Component } from 'svelte';
import { fetched, held } from '#drawers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Drawer = Component<any>;

export const LAZY_KINDS = ['forecast', 'series', 'lines', 'split', 'bridge', 'calendar', 'form', 'lanes', 'gallery', 'embed', 'inputs', 'feed', 'agents'] as const;
export type LazyKind = (typeof LAZY_KINDS)[number];
const LAZY: ReadonlySet<string> = new Set(LAZY_KINDS);

/** What `#drawers` hands over: the drawers in hand, and how to fetch the rest. */
export type Drawers = {
  held: Readonly<Partial<Record<LazyKind, Drawer>>>;
  fetched: Readonly<Partial<Record<LazyKind, () => Promise<{ default: Drawer }>>>>;
};

const landed = new Map<LazyKind, Drawer>(Object.entries(held) as [LazyKind, Drawer][]);
const asked = new Map<LazyKind, Promise<Drawer>>();
/** Kinds whose fetch failed: a host does not hold a page for them again, and their block asks once more itself. */
const missed = new Set<LazyKind>();

/** The drawer if it has landed, else `null`; `Lazy.svelte` draws at once when it has. */
export const drawerNow = (kind: LazyKind): Drawer | null => landed.get(kind) ?? null;

/** The drawer, fetched once however many blocks ask. */
export function drawer(kind: LazyKind): Promise<Drawer> {
  const now = landed.get(kind);
  if (now !== undefined) return Promise.resolve(now);
  let p = asked.get(kind);
  if (p === undefined) {
    const load = fetched[kind];
    if (load === undefined) return Promise.reject(new Error(`No drawer for "${kind}": #drawers neither holds nor fetches it.`));
    p = load().then((m) => {
      landed.set(kind, m.default);
      missed.delete(kind);
      return m.default;
    });
    p.catch(() => {
      asked.delete(kind);
      missed.add(kind);
    });
    asked.set(kind, p);
  }
  return p;
}

/**
 * Ask for the drawers these block kinds need, before their blocks draw. `null` when every one has landed (or none is
 * needed, or its fetch already failed once), so a host can draw at once; else a promise that settles when they have,
 * failed or not. A host holds the page's body until then, so a block's body never arrives after the blocks under it
 * and pushes them down. A failed one is not waited for again: a page that answers again while offline would otherwise
 * go back to its loading state on every answer.
 */
export function preloadKinds(kinds: Iterable<string>): Promise<void> | null {
  const waits: Promise<unknown>[] = [];
  for (const k of new Set(kinds)) {
    if (!LAZY.has(k) || landed.has(k as LazyKind) || missed.has(k as LazyKind)) continue;
    waits.push(drawer(k as LazyKind).catch(() => undefined));
  }
  return waits.length === 0 ? null : Promise.all(waits).then(() => undefined);
}
