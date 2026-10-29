/**
 * The widget Slash would add to Today, as Today's own read carried it (`today` answers `widget`, `today.ts` in the
 * record), held for the tab so the board's last cell, the palette and the widget sheet say the same one.
 *
 * NO REQUEST OF ITS OWN: it is heard where Today is read (`home/today-read.ts`, through `offer-heard.ts`). The palette's "Add a
 * widget" and the Slash answer's "you've asked this 3 times" read it here, and ask `widgetSuggest` only when they need
 * more than the one.
 */

import type { WidgetOffer, WidgetSize } from 'braindog-render';
import { isWidgetSize } from 'braindog-render';

import { onOfferHeard } from './offer-heard.ts';

export { WIDGETS_PARAM, askedSaid, sheetAsked, sheetHref } from './sheet-address.ts';

const isBag = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** An offer as the record sent it, held to the shape the cell draws, or `null`. */
export function offerOf(v: unknown): WidgetOffer | null {
  if (!isBag(v) || typeof v.key !== 'string' || typeof v.widget !== 'string' || typeof v.title !== 'string' || typeof v.why !== 'string') return null;
  if (!isWidgetSize(v.size) || !isBag(v.block)) return null;
  return v as unknown as WidgetOffer;
}

/** The tab's one offer for Today, and every offer read since (for the palette). */
export const todayOffer = $state<{ offer: WidgetOffer | null; all: WidgetOffer[]; readAt: number }>({ offer: null, all: [], readAt: 0 });

/** Heard in Today's answer. */
export function heardOffer(v: unknown): void {
  todayOffer.offer = offerOf(v);
}
onOfferHeard(heardOffer);

/** How long the palette keeps the offers it read before it asks again. */
const OFFERS_HELD_MS = 5 * 60_000;

/** Every offer that adds a widget, asked of the record at most every five minutes, for the palette and Slash's answers. */
export async function offersNow(base: string): Promise<WidgetOffer[]> {
  if (Date.now() - todayOffer.readAt < OFFERS_HELD_MS) return todayOffer.all;
  todayOffer.readAt = Date.now();
  try {
    const { createClient } = await import('@braindog/client');
    const out = await createClient({ base }).call<{ offers?: unknown[] }>('widgetSuggest', {});
    todayOffer.all = out.ok && Array.isArray(out.value.offers) ? out.value.offers.map(offerOf).filter((o): o is WidgetOffer => o !== null && o.remove === undefined) : [];
  } catch {
    todayOffer.all = [];
  }
  return todayOffer.all;
}

/** The size an offer comes at, for a caller that only has the offer. */
export const offerSize = (o: Pick<WidgetOffer, 'size'>): WidgetSize => o.size;
