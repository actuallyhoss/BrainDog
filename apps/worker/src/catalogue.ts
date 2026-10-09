/**
 * The hosted app's catalogue, read by the Worker for Slash and the arranger: the Kennel this Worker hosts (`kennel.ts`,
 * `kennelReader`), which is the folder bundled with the web shell (`apps/web/static/catalogue`, served by the static
 * assets at `/app/catalogue/`) merged with what authors published to the Kennel's bucket. With no bucket bound, the
 * bundled folder alone.
 *
 * THE SAME OFFERS A SELF-HOST GIVES (`@braindog/record/catalogue-offers`): a newer version of what a record holds, held to its
 * checksum and signature and read through its door, which Slash asks about once on Decide. Nothing installs from here
 * until the owner says yes: the shelf below hands the arranger a document only for a question he accepts.
 *
 * THE ASSETS ANSWER THE SHELL FOR A PATH THEY DO NOT HOLD (`not_found_handling: single-page-application`), with a 200. So a
 * reply that is not JSON is a file that is not there, and only the two shapes a catalogue lists are ever asked for.
 */

import { CATALOGUE_INDEX } from '@braindog/declare/catalogue';
import { offersFromCatalogue, shelfFromCatalogue, type CatalogueReader } from '@braindog/record/catalogue-offers';

import { kennelReader, type KennelBucket } from './kennel.ts';

/** The part of the assets binding read here, so a test hands in a folder. */
export type Assets = { fetch(request: Request): Promise<Response> };

const PATH = /^(?:index\.json|usecases\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.usecase\.json|packs\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.pack\.json)$/u;

/**
 * Where the build puts the catalogue: at the root today, and under `/app` once the web app has its base path.
 *
 * BOTH, WHILE THE BUILD MOVES. `paths.base: '/app'` puts
 * `apps/web/static/catalogue` at `build/app/catalogue`, and this Worker and that build deploy as separate commits, so a
 * reader that knew only one place offered nothing from Slash for as long as the other was live: the shell, or a 404,
 * is read as no file. The root is asked first because it is where every deployed build holds it today, and it costs
 * one local asset read once it is gone; it leaves this list when no deployed build has it.
 */
const PLACES = ['/catalogue/', '/app/catalogue/'] as const;

/** A catalogue path read from the static assets: its text, or `null` when it is not there or is not one of the two shapes. */
export function assetsReader(assets: Assets): CatalogueReader {
  return async (path) => {
    if (!PATH.test(path)) return null;
    for (const place of PLACES) {
      try {
        const res = await assets.fetch(new Request(`https://assets.invalid${place}${path}`));
        if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return await res.text();
      } catch {
        /* An asset read that throws is a file that is not there, and the next place is asked. */
      }
    }
    return null;
  };
}

/**
 * The catalogue a record installs from, read through the Kennel (`kennelReader`): the index is the bundled one and the
 * Kennel's merged, EVERY ENTRY KEPT, so an unlisted add-on installs by its id and stays out of what is listed
 * (`shelfFromCatalogue` lists with `listedEntries`). A file is the bucket's, then the bundled folder's. A Kennel index
 * that does not read is the bundled catalogue alone, as the public door serves it.
 */
export function kennelCatalogueReader(deps: { assets?: Assets | undefined; blobs?: KennelBucket | undefined }): CatalogueReader {
  const kennel = kennelReader(deps);
  return async (path) => {
    if (!PATH.test(path)) return null;
    return path === CATALOGUE_INDEX ? JSON.stringify(await kennel.index()) : kennel.file(path);
  };
}

const kennelOf = (assets: Assets | undefined, blobs: KennelBucket | undefined) =>
  assets === undefined && blobs === undefined ? undefined : kennelCatalogueReader({ assets, blobs });

/** Slash's catalogue offers on the Worker, from the Kennel and the bundled folder, or none when neither is bound. */
export const workerCatalogueOffers = (assets: Assets | undefined, blobs?: KennelBucket) => {
  const read = kennelOf(assets, blobs);
  return read === undefined ? undefined : offersFromCatalogue(read);
};

/** The whole catalogue on the Worker, for the arranger (`RecordDeps.catalogueShelf`): the Kennel's and the bundled folder's, or none when neither is bound. */
export const workerCatalogueShelf = (assets: Assets | undefined, blobs?: KennelBucket) => {
  const read = kennelOf(assets, blobs);
  return read === undefined ? undefined : shelfFromCatalogue(read);
};
