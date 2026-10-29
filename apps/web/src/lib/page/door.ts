/**
 * WHERE A BLOCK'S ROWS COME FROM, as an address in the app: what `o` opens from a block or from a row in it.
 *
 * A LIST IS OPENED AT THE BLOCK'S OWN PREDICATE (`registerHref`). A BLOCK OVER NO LIST HAS A HOME TOO, and `o` on it
 * was silent: Kiln's page is worked row by row and its rows are its questions and what changed, so the key the sheet
 * prints there did nothing on any row. A question comes from Decide, and what changed from Activity. A source with no
 * screen of its own (a figure, a forecast) has no door, and `o` stays silent there, which is the honest answer.
 *
 * PURE, AND NODE LOADS IT.
 */

import { WORK } from '../nav.ts';
import { registerHref } from '../record/where.ts';

export function doorOf(b: { register?: string | undefined; where?: string | undefined; source?: string | undefined }): string | null {
  /* WHAT FALLS DUE ACROSS THE LISTS (Today's Coming up) opens Work, where the rest of it is (VERIFY P1). Its live
     block names `deadlines` as its list, which is no list: `/r/deadlines` opened nothing. */
  /* WHAT FALLS DUE WITH MONEY ON IT (`amount is set`, Money's and Today's Coming up) opens Money's Coming up page, which
     holds the rest of that same list; Work holds what falls due without money (30 October: "30 more" opened Work). */
  if ((b.source === 'deadlines' || b.register === 'deadlines') && /\bamount is set\b/u.test(b.where ?? '')) return '/p/money-coming';
  if (b.source === 'deadlines' || b.register === 'deadlines') return WORK;
  if (b.register) return registerHref(b.register, b.where);
  if (b.source?.startsWith('governance.')) return '/decide';
  if (b.source === 'activity') return '/audit';
  return null;
}
