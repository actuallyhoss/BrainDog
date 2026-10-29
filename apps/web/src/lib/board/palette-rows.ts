/**
 * The palette's widget rows (widgets plan §6.3): typing "add", "widget" or "/w" shows Add a widget, and the top widget
 * Slash would add to Today with its reason ("You've asked this 3 times").
 *
 * EACH ROW IS AN ADDRESS: Today with `?widgets`, which the widget sheet on Today opens on (`offer.svelte.ts`), so the
 * palette needs no new verb and a board that holds the sheet answers it. The offer is the one Today's own read carried,
 * so drawing these rows asks nothing.
 *
 * PLAIN TYPESCRIPT, so a test can load it in Node.
 */

import type { WidgetOffer } from 'braindog-render';

import { askedSaid, sheetHref } from './sheet-address.ts';

/** The rows' own words. */
export const rowWords = {
  sheet: 'Add a widget',
  sheetLine: 'Widgets drawn on your own data, for Today',
  offer: (title: string) => `Add to Today: ${title}`,
} as const;

/** What a query must be for the widget rows: "/w", or words that start "add a widget", "widget" or "new widget". */
const ASKS = /^\s*(?:\/w\w*|add(?:\s+a)?(?:\s+w\w*)?|w(?:i(?:d(?:g(?:e(?:t(?:s)?)?)?)?)?)?|new\s+widgets?|add\s+to\s+today|today\s+widgets?)\s*$/iu;

/** Whether a query asks for the widget rows. "add" alone is enough, since Add a widget starts with it. */
export const asksWidgets = (q: string): boolean => q.trim().length >= 2 && ASKS.test(q);

export type WidgetRow = { id: string; title: string; detail: string; href: string; icon: 'grid' | 'plus' };

/** The palette's widget rows for a query, or none. `today` is Today's address on this record. */
export function widgetRows(q: string, offer: WidgetOffer | null, today: string): WidgetRow[] {
  if (!asksWidgets(q)) return [];
  const rows: WidgetRow[] = [{ id: 'widget-sheet', title: rowWords.sheet, detail: rowWords.sheetLine, href: sheetHref(today), icon: 'grid' }];
  if (offer !== null && offer.remove === undefined)
    rows.push({ id: 'widget-offer', title: rowWords.offer(offer.title), detail: askedSaid(offer) ?? offer.why, href: sheetHref(today, offer.key), icon: 'plus' });
  return rows;
}
