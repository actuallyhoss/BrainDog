/**
 * What a `link` block decides, as functions both drawers call: which addresses are links, and the line each one draws.
 *
 * Kept out of the markup for the reason `path.ts` is: an answer here can be tested without a DOM, and two drawers
 * that each worked it out would be two answers.
 *
 * A ROW IS `title | url | note`, the note optional. Over a list, the block's `columns:` name the three fields.
 *
 * THREE KINDS OF ADDRESS, AND ONLY THREE: an `https:` address, a `mailto:` and a path of this BrainDog. It is the rule
 * `safeHref` already keeps for a link inside a sentence, less the `#anchor`, which on a list of links points at
 * nothing a reader can name. Anything else is a fault the parser shows as the author's fence, because a row of a
 * list of links that quietly stopped being a link is the one failure this kind exists to prevent.
 *
 * NOTHING IS FETCHED. No favicon, no preview, no title read from the page: a list that asked each address for its
 * picture would tell every one of them who is reading and when, which is why `06 §7` refuses a remote image on a page.
 * What is drawn under the title is the address's own host, read off the text.
 */

import { safeHref } from './inline.ts';

/** The sentence the parser degrades a block with when a row's address is none of the three. */
export const LINK_ADDRESS = 'A link is an https address, a mailto or a path of this BrainDog.';

/** The words the drawers write that no author did, here because this package cannot import the app's copy. */
export const LINKS_NONE = 'Nothing to show.';

/** Where a row's address goes, or null when it is none of the three sorts of address a link may be. */
export function linkHref(url: string): string | null {
  const href = safeHref(url);
  return href === null || href.startsWith('#') ? null : href;
}

/**
 * What is wrong with a link block's rows, as the sentence a reader sees above the fence, or null when nothing is.
 *
 * AN EMPTY ADDRESS IS NOT A FAULT: the row draws its title as words, which is what a bookmark nobody has filled in
 * yet is.
 */
export function linkFault(rows: readonly (readonly string[])[]): string | null {
  for (const cells of rows) {
    const url = (cells[1] ?? '').trim();
    if (url !== '' && linkHref(url) === null) return `"${url}" is not a link here. ${LINK_ADDRESS}`;
  }
  return null;
}

/**
 * The words drawn under a link's title: the host of an https address without its `www.`, the address of a mailto, and
 * nothing for a path of this BrainDog, whose own words are its title.
 */
export function linkHost(href: string): string {
  if (/^mailto:/iu.test(href)) {
    const address = href.slice('mailto:'.length).split('?')[0] ?? '';
    try {
      return decodeURIComponent(address);
    } catch {
      return address;
    }
  }
  if (!/^https:\/\//iu.test(href)) return '';
  try {
    return new URL(href).hostname.replace(/^www\./iu, '');
  } catch {
    return '';
  }
}

/** One row as it is drawn: its words, where it goes, what is said under it, and whether it leaves this BrainDog. */
export type LinkLine<R> = { row: R; title: string; href: string | null; host: string; note: string; away: boolean };

/**
 * Every row as a line, in the order the rows came.
 *
 * Lenient where `linkFault` is strict: an address that is not a link is drawn as words with no anchor, because `Block`
 * is a public type a host can build by hand. A row with no title is titled by its address, so no link is ever drawn
 * with nothing to press.
 */
export function linkPlan<R extends { cells: readonly string[] }>(rows: readonly R[]): LinkLine<R>[] {
  return rows.map((row) => {
    const url = (row.cells[1] ?? '').trim();
    const href = url === '' ? null : linkHref(url);
    const title = (row.cells[0] ?? '').trim();
    return {
      row,
      title: title || url,
      href,
      host: href ? linkHost(href) : '',
      note: (row.cells[2] ?? '').trim(),
      away: href !== null && /^https:\/\//iu.test(href),
    };
  });
}
