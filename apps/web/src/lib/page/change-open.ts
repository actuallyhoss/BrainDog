/**
 * A page that opens on "Describe it" (ENG-B11 with PGS-C30).
 *
 * A NEW PAGE IS EMPTY, and the field that fills it from one sentence sat two presses away, inside the page's menu. So
 * the palette opens a page it has just made at `?describe=1`, and the page's own menu (`ChangePage.svelte`) reads the
 * mark, opens its sheet and takes the mark out of the address.
 *
 * THE MARK IS READ ONCE AND REMOVED, with the address replaced and not pushed, so Back, a reload and a copied link all
 * open the page as it is and never the sheet again.
 *
 * PURE, so the three answers are tested without a browser; the component only obeys them.
 */

/** The mark's name in the address. `palette/new-page.ts` spells it too, and `change-open.test.ts` holds the two together. */
export const DESCRIBE = 'describe';
/** The words the sheet opens on and sends at once, beside the mark: "a page that shows my late invoices" from the bar. */
export const SAID = 'said';

/** An address, as far as this file reads it: a `URL`, or the router's. */
type Address = { pathname: string; search: string; hash: string };

/** The parts of a query, as they were typed, with no leading `?`. */
const parts = (search: string): string[] => search.replace(/^\?/u, '').split('&').filter((part) => part !== '');

/** Whether one part of a query is the mark or its words, whatever it is set to. */
const isMark = (part: string): boolean => part === DESCRIBE || part.startsWith(`${DESCRIBE}=`) || part === SAID || part.startsWith(`${SAID}=`);

/** Whether the address asks for the page to open on its describe field. Only `describe=1` asks. */
export const describeAsked = (url: Pick<Address, 'search'>): boolean => parts(url.search).includes(`${DESCRIBE}=1`);

/** The words the address hands the sheet with the mark, or `undefined` for none. */
export function describedLine(url: Pick<Address, 'search'>): string | undefined {
  if (!describeAsked(url)) return undefined;
  const said = new URLSearchParams(url.search).get(SAID)?.trim();
  return said === undefined || said === '' ? undefined : said.slice(0, 1_000);
}

/**
 * The same address with the mark gone. EVERY OTHER PART IS KEPT AS IT WAS TYPED, in its order and its own encoding:
 * the page drawn as its source (`?src=1`), a tab, a hash.
 */
export function withoutDescribe(url: Address): string {
  const kept = parts(url.search).filter((part) => !isMark(part));
  return `${url.pathname}${kept.length > 0 ? `?${kept.join('&')}` : ''}${url.hash}`;
}

/**
 * Whether the sheet opens by itself. ALL THREE, OR IT STAYS SHUT: the address asks, this reader may change the page,
 * and the host has a model for Slash to draft with. With no model the page opens exactly as it always did, so a record
 * whose rules do the work is not shown a field that cannot answer.
 */
export const opensDescribe = (on: { asked: boolean; mayChange: boolean; model: boolean }): boolean =>
  on.asked && on.mayChange && on.model;
