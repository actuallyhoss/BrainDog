/**
 * `/addons/<id>`: one public listing, prerendered for every one there is (`entries`), so the strict prerender builds
 * each page from the bundled catalogue and the Kennel's index, and an unlisted or withdrawn add-on has no page at all.
 *
 * THE DRAWING IS DIALECT TEXT built here (`previewOf`, or `addsSrc` when no preview was made) and drawn by
 * `lib/app/Page.svelte`, the product's renderer, so the page carries words and never a file path.
 *
 * WHAT IT ASKS FOR OF YOURS is worked out from the version's reach (`asksOf`), the lines the app shows before it
 * installs, never anything the author wrote about it.
 */
import { error } from '@sveltejs/kit';
import { held } from '$lib/launch.ts';
import { APP } from '$lib/links.ts';
import {
  addsSrc,
  asksOf,
  authorsOf,
  cardOf,
  changeOf,
  dayOf,
  installPath,
  isPublic,
  nameOf,
  offered,
  publisherKeyOf,
  slugOf,
} from '$lib/packs/catalogue.ts';
import { readCounts, readEntries, readPreview } from '$lib/packs/read.server.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

const listed = async () => (await readEntries()).filter(isPublic);

/* NO PAGE PER ADD-ON WHILE `/addons` IS HELD (`HELD` in `launch.ts`): none is prerendered, so none is written. */
export const entries: EntryGenerator = async () => (held() ? [] : (await listed()).map((e) => ({ id: slugOf(e) })));

export const load: PageServerLoad = async ({ params }) => {
  const all = await listed();
  const entry = all.find((e) => slugOf(e) === params.id);
  const version = entry ? offered(entry) : null;
  if (!entry || !version) error(404, 'Not found');
  const preview = await readPreview(entry);
  const who = authorsOf(all).find((a) => a.key === publisherKeyOf(entry))?.slug;
  const card = cardOf(entry, await readCounts(), preview?.pages[0]?.icon ?? null, who);
  if (!card) error(404, 'Not found');
  const made = preview ? Date.parse(preview.made) : Number.NaN;
  return {
    card,
    licence: entry.license,
    hosts: version.reach.hosts,
    asks: asksOf(version.reach),
    /* WHAT IT BRINGS, BY NAME: a list or page id said as words, and one a template names (`{{name}}`) left out of the
       names but kept in the count, so "3 pages" stays true when only two can be named. */
    brings: {
      lists: version.reach.lists.map(nameOf).filter((n) => n !== ''),
      listCount: version.reach.lists.length,
      pages: version.reach.pages.map(nameOf).filter((n) => n !== ''),
      pageCount: version.reach.pages.length,
      rules: version.reach.rules.length,
      examples: version.reach.examples,
    },
    install: installPath(APP, entry),
    /* The clock a preview's figures were read at, so a due day reads as it did in the scratch record. */
    now: Number.isFinite(made) ? made : null,
    pages: preview?.pages.map((p) => ({ title: p.title, src: p.src })) ?? null,
    adds: addsSrc(version.reach),
    versions: entry.versions.map((v, i) => ({
      version: v.version,
      day: dayOf(v.published_at),
      change: changeOf(entry.versions, i),
      withdrawn: v.yanked?.reason ?? null,
    })),
  };
};
