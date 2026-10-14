/**
 * THE LAST ANSWER OF EACH PAGE THIS TAB DREW, so a page opened again draws at once as it last was, marked as being
 * read, and the new answer replaces it when it lands (EXP-D04, "no blank flash, no spinner where a skeleton or the old
 * content can stay"). Going Money, then a project, then back to Money drew bars for the whole of each read, head
 * included, for a page this tab had drawn a minute before.
 *
 * ONLY A LIVE ANSWER IS KEPT. A page the record does not have, or one it refused, is asked again every time, and the
 * reader drops its key when the record says so, so an answer kept before a refusal is never drawn after it.
 *
 * KEYED BY THE RECORD'S ADDRESS, THE SLUG AND THE CHOICE, so another record or another narrowing of the same page
 * never draws this one. Held for the tab and not by one reader, because Home reads its page through a new reader each
 * time. Cleared on a record switch and a sign-out, where `boot-live.ts` `forget` runs.
 *
 * FOR A MOMENT A KEPT FIGURE MAY BE OLDER THAN THE RECORD. The screen's `aria-busy` and the read that follows bound it.
 */

import type { Opened } from './page-live.ts';

export type KeptPages = {
  get(key: string): Opened | null;
  put(key: string, opened: Opened): void;
  drop(key: string): void;
  clear(): void;
  readonly size: number;
};

/** A store of the `most` pages drawn last. Putting a page again makes it the newest; past `most` the oldest goes. */
export function keptPages(most = 12): KeptPages {
  /* A MAP KEEPS ITS KEYS IN THE ORDER THEY WENT IN, so the first key is the page drawn longest ago. */
  const held = new Map<string, Opened>();
  return {
    get: (key) => held.get(key) ?? null,
    put(key, opened) {
      if (opened.from !== 'live') return;
      held.delete(key);
      held.set(key, opened);
      while (held.size > most) held.delete(held.keys().next().value!);
    },
    drop: (key) => void held.delete(key),
    clear: () => held.clear(),
    get size() {
      return held.size;
    },
  };
}

/**
 * THE KEY OF ONE PAGE AS ONE CHOICE NARROWED IT. `base` is the record's own address (`apiBase()`, which carries the
 * record's slug), and the choice is sorted so `?f.a=1&f.b=2` and `?f.b=2&f.a=1` are the same page. An empty choice is
 * no choice, as the reader asks it.
 */
export function pageKey(base: string, slug: string, filter?: Readonly<Record<string, string>>): string {
  const chosen = Object.entries(filter ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([base, slug, chosen]);
}

/** The tab's one store, which every page reader puts its answers in. */
export const kept: KeptPages = keptPages();
