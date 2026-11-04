/**
 * The rows an @ offers, read the way the panel's search reads them (`search-kept.ts`): what this device holds answers at
 * once, in the same order, and the record's answer replaces it a beat later with the rows already drawn left where they
 * are. Nothing typed yet is the rows touched last.
 */
import { refOfHref } from '../send/send.ts';
import type { SearchHit, SearchResult } from '../record/api.ts';
import type { Reader } from '../record/palette-live.ts';
import { factsOf } from '../record/told-apart.ts';

export type Offer = { ref: string; label: string; list: string; icon: string; told?: string | undefined };

/** The most rows the list holds. */
export const OFFERS_MOST = 8;

/** ONE READER A RECORD, whichever field asks, so what one read is kept for the other. */
let reading: { base: string; r: Promise<Reader> } | null = null;
export function readerFor(base: string): Promise<Reader> {
  if (reading?.base !== base) reading = { base, r: import('../record/palette-live.ts').then((m) => m.paletteReader(base)) };
  return reading.r;
}

/** The rows touched last, kept for the tab, so a second @ draws them at once and the read only freshens them. */
const lately = new Map<string, Offer[]>();
export const lastLately = (base: string): Offer[] | null => lately.get(base) ?? null;
export async function readLately(base: string, lists: readonly { id: string; name: string; icon: string }[]): Promise<Offer[]> {
  const r = await readerFor(base);
  const recent = await r.recent(lists as never, OFFERS_MOST).catch(() => []);
  const out = recent.map((x) => ({ ref: x.target, label: x.title, list: x.list, icon: String(x.icon ?? 'rows') }));
  lately.set(base, out);
  return tell(out);
}

/** ROWS OF ONE NAME ARE TOLD APART, by their day and amount where they have them, else by their number. */
export function tell(rows: readonly (Offer & { hit?: SearchHit })[]): Offer[] {
  const names = new Map<string, number>();
  for (const r of rows) names.set(r.label.toLocaleLowerCase(), (names.get(r.label.toLocaleLowerCase()) ?? 0) + 1);
  return rows.map(({ hit, ...r }) => {
    if ((names.get(r.label.toLocaleLowerCase()) ?? 0) < 2) return r;
    const told = (hit && factsOf(hit)) || `#${r.ref.split('#')[1] ?? ''}`;
    return { ...r, told };
  });
}

/** What a search found, as offers: rows only, since a row is what a mention can be. */
export function offersOf(value: SearchResult, listOf: (ref: string) => string): Offer[] {
  const seen = new Set<string>();
  const rows = value.hits.flatMap((hit) => {
    const ref = refOfHref(hit.href);
    if (!ref || seen.has(ref)) return [];
    seen.add(ref);
    return [{ ref, label: hit.title, list: listOf(ref) || hit.kind, icon: String(hit.icon ?? 'rows'), hit }];
  });
  return tell(rows.slice(0, OFFERS_MOST));
}
