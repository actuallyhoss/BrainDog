/** The address that opens the widget sheet, and the words an offer resting on questions says. Plain, for Node tests. */

import type { WidgetOffer } from 'braindog-render';

/** The address that opens the widget sheet on Today, with one offer picked when one is named. */
export const WIDGETS_PARAM = 'widgets';
export const sheetHref = (today: string, key: string | null = null): string => `${today}?${WIDGETS_PARAM}${key === null ? '' : `=${encodeURIComponent(key)}`}`;

/** What the address asks of the sheet: open, and which offer to open on, or nothing. */
export function sheetAsked(url: URL): { open: boolean; key: string | null } {
  if (!url.searchParams.has(WIDGETS_PARAM)) return { open: false, key: null };
  const key = url.searchParams.get(WIDGETS_PARAM);
  return { open: true, key: key === null || key === '' ? null : key };
}

/** "You've asked this 3 times", for an offer that rests on questions asked again. */
export const askedSaid = (o: Pick<WidgetOffer, 'asked'>): string | null => (o.asked !== undefined && o.asked >= 2 ? `You’ve asked this ${o.asked} times` : null);

