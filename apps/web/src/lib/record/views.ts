/**
 * Saved views on a live record.
 *
 * ON A RECORD A SAVED VIEW IS A PAGE. `rows-write.ts` saves the list's filter, search, order and columns as a page
 * declaration under the Views section, because a register predicate is what `02 §5` calls a view and the kernel still
 * refuses one. So a live record's views are the pages `boot` places under that section, each at `/p/<slug>`, and the
 * rail already lists them there.
 *
 * PURE, so `node --test` imports it: the shell is handed in.
 */

import { copy } from '../copy.ts';

type Shelled = { live: boolean; nav: readonly { id: string; title: string; href: string; section: string }[] };

export type SavedView = { key: string; name: string; href: string; register: string | null };

/** The views this shell can open, with the address each one lives at. */
export function savedViews(shell: Pick<Shelled, 'nav'>): SavedView[] {
  return shell.nav.filter((n) => n.section === copy.viewsSection).map((n) => ({ key: n.id, name: n.title, href: n.href, register: null }));
}

/**
 * Where `/v/<key>` should go instead, or `null` to draw it.
 *
 * A LIVE RECORD KEEPS ITS VIEWS AS PAGES, so an old link to a view goes to the page of that name, which says so itself
 * when there is none, rather than to the sample's view of the same key.
 */
export const viewMovedTo = (shell: Pick<Shelled, 'live'>, key: string): string | null =>
  shell.live ? `/p/${encodeURIComponent(key)}` : null;
