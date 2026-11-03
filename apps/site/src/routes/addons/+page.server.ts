/**
 * `/addons`: a card for every public listing, read at build time from the bundled catalogue and the Kennel's index
 * (`lib/packs/read.server.ts`), so an add-on somebody else published is here the day after it is listed and deployed.
 *
 * A SERVER LOAD, so the cards ride in the prerendered HTML and the page reads whole with scripting off;
 * the search box and the filters only narrow what is already drawn.
 *
 * HELD UNTIL THE SITE IS PUBLIC (`HELD` in `launch.ts`), as `/changelog` is: it answers 404, so the build
 * writes no `addons.html` and the site's own 404 page answers the address. The catalogue is read the day it is shown.
 */
import { error } from '@sveltejs/kit';
import { held } from '$lib/launch.ts';
import { authorsOf, cardOf, isPublic, publisherKeyOf, type Card } from '$lib/packs/catalogue.ts';
import { readCounts, readEntries, readPreview } from '$lib/packs/read.server.ts';
import type { PageServerLoad } from './$types';

export const prerender = true;

export const load: PageServerLoad = async () => {
  if (held()) error(404, 'Not found');
  const counts = await readCounts();
  const listed = (await readEntries()).filter(isPublic);
  const who = new Map(authorsOf(listed).map((a) => [a.key, a.slug]));
  const cards = (
    await Promise.all(listed.map(async (e) => cardOf(e, counts, (await readPreview(e))?.pages[0]?.icon ?? null, who.get(publisherKeyOf(e)))))
  ).filter((c): c is Card => c !== null);
  return { cards };
};
