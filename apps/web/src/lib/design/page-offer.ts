/**
 * The week offer on a declared page (use case 6, step 7: "later, Slash offers a page for her pattern", drawn where she
 * is). Her Orders place opens the shop's Orders page, `/p/orders`, and not the list's own screen, so the card the list's
 * screen draws (`offerFor`, offer-card-46) was never seen by the person it was for.
 *
 * THE LIST IS THE FIRST ONE THE PAGE'S BLOCKS READ, in the page's order: a block's `register`, else its
 * `register.<list>` source. A page reading no list has no offer. The offer itself is `offerFor`'s, unchanged, so the
 * pen's switch, a dismissal and the record's day-14 rule hold here exactly as on the list's screen.
 *
 * NONE ON THE PAGE THE OFFER MADE. Made, the page reads the same list, and until `boot` is read again the pen still
 * holds the offer: it would offer her the page she is reading.
 *
 * PURE, AND NODE LOADS IT, so `page-offer.test.ts` holds the rule without a component.
 */
import { offerFor, slugOfDraft, type OfferHeld, type PenItem } from './pen.ts';

/** What the rule reads of a page: its address and its blocks, as the record answered them. */
export type OfferedPage = { slug: string; blocks: readonly { register?: string | undefined; source?: string | undefined }[] };

/** The list a block reads, by id, or `null` for a block that reads none (a note, a figure). */
function listOf(block: OfferedPage['blocks'][number]): string | null {
  if (typeof block.register === 'string' && block.register !== '') return block.register;
  const source = block.source;
  return typeof source === 'string' && source.startsWith('register.') && source.length > 'register.'.length ? source.slice('register.'.length) : null;
}

/** The first list a page's blocks read, or `null`. */
export function firstList(page: OfferedPage): string | null {
  for (const block of page.blocks) {
    const list = listOf(block);
    if (list !== null) return list;
  }
  return null;
}

/** The one offer to draw above this page, or `null`: the week offer for its first list, unless it made this page. */
export function pageOffer(pen: readonly PenItem[], page: OfferedPage, held: OfferHeld): PenItem | null {
  const list = firstList(page);
  if (list === null) return null;
  const offer = offerFor(pen, list, held);
  return offer === null || slugOfDraft(offer) === page.slug ? null : offer;
}
