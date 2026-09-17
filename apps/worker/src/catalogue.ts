/**
 * The hosted app's catalogue, read by the Worker for Spark: the folder bundled with the web shell (`apps/web/static/catalogue`)
 * and served by the static assets at `/catalogue/`, the same one `/packs` reads in the tab.
 *
 * THE SAME OFFERS A SELF-HOST GIVES (`@braindog/record/catalogue-offers`): a newer version of what a record holds, held to its
 * checksum and signature and read through its door, which Spark asks about once on Decide. Nothing installs from here.
 *
 * THE ASSETS ANSWER THE SHELL FOR A PATH THEY DO NOT HOLD (`not_found_handling: single-page-application`), with a 200. So a
 * reply that is not JSON is a file that is not there, and only the two shapes a catalogue lists are ever asked for.
 */

import { offersFromCatalogue, type CatalogueReader } from '@braindog/record/catalogue-offers';

/** The part of the assets binding read here, so a test hands in a folder. */
export type Assets = { fetch(request: Request): Promise<Response> };

const PATH = /^(?:index\.json|usecases\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.usecase\.json|packs\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.pack\.json)$/u;

/** A catalogue path read from the static assets: its text, or `null` when it is not there or is not one of the two shapes. */
export function assetsReader(assets: Assets): CatalogueReader {
  return async (path) => {
    if (!PATH.test(path)) return null;
    try {
      const res = await assets.fetch(new Request(`https://assets.invalid/catalogue/${path}`));
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
      return await res.text();
    } catch {
      return null;
    }
  };
}

/** Spark's catalogue offers on the Worker, or none when no assets are bound. */
export const workerCatalogueOffers = (assets: Assets | undefined) => (assets === undefined ? undefined : offersFromCatalogue(assetsReader(assets)));
