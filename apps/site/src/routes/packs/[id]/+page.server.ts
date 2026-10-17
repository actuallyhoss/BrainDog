/**
 * `/packs/<id>`: one public listing, prerendered for every one there is (`entries`), so the strict
 * prerender builds each page from the catalogue and an unlisted or withdrawn pack has no page at all.
 *
 * THE DRAWING IS DIALECT TEXT built here (`previewOf`, or `addsSrc` when no preview was made) and drawn by
 * `lib/app/Page.svelte`, the product's renderer, so the page carries words and never a file path.
 */
import { error } from '@sveltejs/kit';
import { held } from '$lib/launch.ts';
import { APP } from '$lib/links.ts';
import { addsSrc, cardOf, changeOf, dayOf, installPath, isPublic, offered, slugOf } from '$lib/packs/catalogue.ts';
import { readCounts, readEntries, readPreview } from '$lib/packs/read.server.ts';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = true;

const listed = () => readEntries().filter(isPublic);

/* NO PAGE PER PACK WHILE `/packs` IS HELD (`HELD` in `launch.ts`): none is prerendered, so none is written. */
export const entries: EntryGenerator = () => (held() ? [] : listed().map((e) => ({ id: slugOf(e) })));

export const load: PageServerLoad = async ({ params }) => {
  const entry = listed().find((e) => slugOf(e) === params.id);
  const version = entry ? offered(entry) : null;
  if (!entry || !version) error(404, 'Not found');
  const preview = readPreview(entry);
  const card = cardOf(entry, await readCounts(), preview?.pages[0]?.icon ?? null);
  if (!card) error(404, 'Not found');
  const made = preview ? Date.parse(preview.made) : Number.NaN;
  return {
    card,
    licence: entry.license,
    hosts: version.reach.hosts,
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
