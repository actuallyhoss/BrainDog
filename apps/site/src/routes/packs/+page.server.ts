/**
 * `/packs`: a card for every public listing, read from the catalogue at build time (`lib/packs/read.server.ts`).
 *
 * A SERVER LOAD, so the cards ride in the prerendered HTML and the page reads whole with scripting off;
 * the search box and the filters only narrow what is already drawn.
 */
import { cardOf, isPublic, type Card } from '$lib/packs/catalogue.ts';
import { readCounts, readEntries, readPreview } from '$lib/packs/read.server.ts';
import type { PageServerLoad } from './$types';

export const prerender = true;

export const load: PageServerLoad = async () => {
  const counts = await readCounts();
  const cards = readEntries()
    .filter(isPublic)
    .map((e) => cardOf(e, counts, readPreview(e)?.pages[0]?.icon ?? null))
    .filter((c): c is Card => c !== null);
  return { cards };
};
