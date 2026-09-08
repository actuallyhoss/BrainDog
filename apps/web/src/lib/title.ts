/**
 * The browser tab, which is the only part of this app a person reads while looking at something
 * else.
 *
 * It had none. Every tab said the URL, every bookmark saved as the URL, and every history entry
 * read the same as the last one — and a screen reader announces the document title on EVERY
 * navigation, so a client-side router with no title change tells its user nothing happened. That is
 * WCAG 2.4.2 at level A, and it is the failure people notice without being able to name.
 *
 * MOST SPECIFIC FIRST. A pinned tab shows about a dozen characters and a history search matches from
 * the front, so the product name is the part that gets truncated — which is right, because the
 * reader already knows which app they are in. `Invoice 2026-041 · Obligations · BrainDog`.
 *
 * A TITLE IS STABLE FOR A PAGE. The home surface heads itself with today's date, which is correct on
 * the page and wrong in a tab: a title that changes overnight breaks the pinned tab and the history
 * entry that used to find it. Pages whose heading is a date or a count title themselves with what
 * they ARE.
 */

import { copy } from '$lib/copy.ts';
import { ENV, named } from '$lib/env.ts';

/** One place, because it appears seventeen times and a typo in one of them is invisible. */
export const PRODUCT = 'BrainDog';

/**
 * AND THE DEPLOYMENT IS PART OF THE NAME — `BrainDog Alpha`, in the tab.
 *
 * `EnvBadge`'s header has said "it is also in the tab title, and that is not redundancy" since it
 * was written, and this file had no environment in it at all: no `ENV`, no `named`, nothing. The
 * badge is only drawn where there is chrome to draw it in — `/start` and `/s/<token>` carry no
 * shell (50 §5.13 step 6) — and a tab is read while looking at something else, which is the whole
 * argument for a title in the first place. Two windows side by side, one on alpha and one on the
 * real record, are told apart by their tabs before either is looked at.
 *
 * IT FOLDS. `named` is a `define`d literal, so in the shipped build this whole expression is
 * `'BrainDog'` and the lookup is not in the bundle.
 */
const DEPLOYMENT: Record<string, string> = { alpha: copy.alpha };
const HERE = named ? `${PRODUCT} ${DEPLOYMENT[ENV] ?? ''}`.trim() : PRODUCT;

/**
 * `titleOf('Invoice 2026-041', 'Obligations')` → `Invoice 2026-041 · Obligations · BrainDog`.
 *
 * Falsy parts drop out, so a route can pass a value it may not have without a conditional at the
 * call site. With nothing to say it is just the product, which is the right answer for a shell.
 */
export const titleOf = (...parts: (string | false | null | undefined)[]): string =>
  [...parts.filter((p): p is string => Boolean(p && p.trim())), HERE].join(' · ');
