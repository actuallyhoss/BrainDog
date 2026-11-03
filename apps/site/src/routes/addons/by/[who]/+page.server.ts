/**
 * `/addons/by/<who>`: every public listing one author has, prerendered for every author with one (`entries`).
 *
 * WHO AN AUTHOR IS comes from the catalogue (`publisher`, its kind and id), never from a name typed in a file: two
 * publishers who both call themselves "Ada" get two pages (`authorsOf`).
 *
 * HELD WITH THE STORE (`HELD` in `launch.ts`): no page is prerendered while `/addons` is held.
 */
import { error } from '@sveltejs/kit';
import { held } from '$lib/launch.ts';
import { authorsOf, cardOf, isPublic, publisherKeyOf, type Card } from '$lib/packs/catalogue.ts';
import { readCounts, readEntries, readPreview } from '$lib/packs/read.server.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

const listed = async () => (await readEntries()).filter(isPublic);

export const entries: EntryGenerator = async () => (held() ? [] : authorsOf(await listed()).map((a) => ({ who: a.slug })));

export const load: PageServerLoad = async ({ params }) => {
  const all = await listed();
  const author = authorsOf(all).find((a) => a.slug === params.who);
  if (!author) error(404, 'Not found');
  const counts = await readCounts();
  const theirs = all.filter((e) => publisherKeyOf(e) === author.key);
  const cards = (await Promise.all(theirs.map(async (e) => cardOf(e, counts, (await readPreview(e))?.pages[0]?.icon ?? null, author.slug)))).filter(
    (c): c is Card => c !== null,
  );
  return { name: author.name, ours: author.ours, slug: author.slug, cards };
};
