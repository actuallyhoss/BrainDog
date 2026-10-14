/**
 * ACTIVITY AS A PAGE THE RECORD COMPOSES (PGS-C24 job 8, its safe half), and which of the two a visit draws.
 *
 * THE SCREEN AS IT WAS STAYS WHERE IT IS UNTIL HIS YES, as a list's does (PGS-A23, `r/[register]/declared.ts`). Until
 * then the record's page is reached by one key in the address, `/audit?declared`, beside whatever else it holds: a
 * filter chosen on one side (`?who=`, `?kind=`) is still in the address on the other, so the way back lands where the
 * reader left.
 *
 * WHAT IS DRAWN IS THE RECORD'S, NOT THIS SCREEN'S: the page `activity` every record with People gets (the seed's
 * `BASE_PAGES`), read and drawn as any installed page is (`DeclaredActivity.svelte`). Nothing here knows a line of it.
 *
 * NOT `r/[register]/declared.ts` IMPORTED: that module brings the kernel's `listPage` with it, and this one is loaded
 * with the screen as it was, whose first paint must not grow.
 *
 * Pure, so plain Node reaches it (`declared.test.ts`).
 */

import type { Opened } from '$lib/record/page-live.ts';

/** The address's one word for the composed page. */
const KEY = 'declared';

/** The record's page this screen is drawn as: its address under `/p/`. */
export const PAGE = 'activity';

/** What a read of the page came back as: the record's answer, or `none` where no record could be asked. */
export type Drawn = Opened | { from: 'none' };

/** Whether the address asks for the composed page: the key is there, whatever stands beside it. */
export function wantsDeclared(url: URL): boolean {
  return url.searchParams.has(KEY);
}

/** The address with every part as it was but the one key, which is `on` or gone. */
function keyed(url: URL, on: boolean): string {
  const rest = new URLSearchParams(url.search);
  rest.delete(KEY);
  const others = rest.toString();
  /* THE KEY IS WRITTEN BARE AND FIRST, as it is typed: `?declared&who=p_1`, never `?declared=`. */
  const search = on ? `?${KEY}${others ? `&${others}` : ''}` : others ? `?${others}` : '';
  return `${url.pathname}${search}${url.hash}`;
}

/** The same address on the screen as it was. */
export function classicHref(url: URL): string {
  return keyed(url, false);
}

/** The same address on the composed page. */
export function declaredHref(url: URL): string {
  return keyed(url, true);
}

/** What the two screens say of each other. The record's refusal is said in the record's sentence, never one of these. */
export const words = {
  /** The quiet link under the screen as it was. */
  asPage: 'See it as a page',
  /** The quiet link under the composed page, and after the sentence that says why it was not drawn. */
  back: 'Back to the list',
  /** Said before the link under the page, so the line reads as a sentence. */
  trying: 'This is the new page for Activity.',
  /** A record without the page: no People, or People from before it shipped the page. */
  missing: 'This record has no Activity page yet.',
  /** A record that could not be asked, or answered nothing a page is drawn from. */
  none: 'This record cannot draw the Activity page yet.',
  /** While the record draws it. */
  drawing: 'Drawing the page',
} as const;

/**
 * THE ONE SENTENCE SAID IN PLACE OF THE PAGE, or `null` where the record drew it. A refusal is the record's own
 * sentence, word for word; a page the record does not have, or a record that could not be reached, is said here. The
 * link back (`words.back`) is drawn after it, so the screen that works is one press away.
 */
export function declaredSays(result: Drawn | null): string | null {
  if (result === null || result.from === 'live') return null;
  if (result.from === 'refused') return result.fix.trim() || words.none;
  if (result.from === 'missing') return words.missing;
  return words.none;
}
