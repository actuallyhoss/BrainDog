/**
 * A LIST AS A PAGE THE RECORD COMPOSES (PGS-A23), and which of the two a visit draws.
 *
 * THE SCREEN AS IT WAS STAYS WHERE IT IS UNTIL THE LIST BOARD IS SIGNED OFF. Until then the composed page is reached
 * by its address and by nothing else: `/r/<list>?declared`. One key, beside whatever else the address holds, so a row
 * open in the panel (`?row=7`) is the same row on either side and a link to one is a link to that one.
 *
 * WHAT IS DRAWN IS THE KERNEL'S, NOT THIS SCREEN'S: `listPage` composes the body from the list's own declaration, the
 * same for every list of every record, and the record draws it (`DeclaredList.svelte`). Nothing here knows a list.
 *
 * Pure, so plain Node reaches it (`declared.test.ts`).
 */

import { listPage } from '@braindog/kernel';

import type { Entry, RegisterDecl } from '$lib/record/schema.ts';

/** The address's one word for the composed page. */
const KEY = 'declared';

/** The page body the kernel composes for a list. */
export type ListBody = ReturnType<typeof listPage>;

/** Whether the address asks for the composed page: the key is there, whatever stands beside it. */
export function wantsDeclared(url: URL): boolean {
  return url.searchParams.has(KEY);
}

/**
 * The list's page as the kernel composes it, or `null` while its declaration has not been read. `count` is how many the
 * list holds where the screen has read it, which the page's opening line then says; with none it says no number.
 */
export function bodyFor(decl: RegisterDecl | null | undefined, count?: number | null): ListBody | null {
  if (!decl) return null;
  /* THE DECLARATION AS THE RECORD ANSWERED IT, whole: the web's type names the keys its own screens read. */
  const shape = decl as unknown as Parameters<typeof listPage>[0];
  return typeof count === 'number' ? listPage(shape, { count }) : listPage(shape);
}

/** The address with every part as it was but the one key, which is `on` or gone. */
function keyed(url: URL, on: boolean): string {
  const rest = new URLSearchParams(url.search);
  rest.delete(KEY);
  const others = rest.toString();
  /* THE KEY IS WRITTEN BARE AND FIRST, as it is typed: `?declared&row=3`, never `?declared=`. */
  const search = on ? `?${KEY}${others ? `&${others}` : ''}` : others ? `?${others}` : '';
  return `${url.pathname}${search}${url.hash}`;
}

/** The same address on the screen as it was. */
export function classicHref(url: URL): string {
  return keyed(url, false);
}

/** The same address on the composed page. Not linked from the screen as it was: until it is signed off it is typed. */
export function declaredHref(url: URL): string {
  return keyed(url, true);
}

/**
 * THE LIST'S ROWS AS THE PAGE DREW THEM, which the panel opens and walks: every block over this list, in the page's
 * order, each row once. A block over another list is that list's, and its rows open on their own screen.
 */
export function drawnRows(blocks: readonly { register?: string | undefined; entries?: readonly Entry[] | undefined }[], register: string): Entry[] {
  const seen = new Set<number>();
  const rows: Entry[] = [];
  for (const b of blocks) {
    if (b.register !== register) continue;
    for (const e of b.entries ?? []) {
      if (seen.has(e.seq)) continue;
      seen.add(e.seq);
      rows.push(e);
    }
  }
  return rows;
}

/** What the composed page says of itself. The record's refusal is said in the record's sentence, never one of these. */
export const words = {
  /** The one quiet line under the page: the way back to the screen as it was. */
  back: 'Back to the list as it was',
  /** Said before the link, so the line reads as a sentence. */
  trying: 'This is the new page for this list.',
  /** A record that cannot draw a page before it is kept (an older host, or none behind the tab). */
  none: 'This record cannot draw the new page yet. The list as it was still works.',
  /** While the record draws it. */
  drawing: 'Drawing the page',
} as const;
