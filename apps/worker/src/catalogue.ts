/**
 * The hosted app's catalogue, read by the Worker for Spark: the folder bundled with the web shell (`apps/web/static/catalogue`)
 * and served by the static assets at `/app/catalogue/` (at `/catalogue/` before the app had a base path), the same one
 * `/packs` reads in the tab.
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

/**
 * Where the build puts the catalogue: at the root today, and under `/app` once the web app has its base path.
 *
 * BOTH, WHILE THE BUILD MOVES (`loop/research-one-domain.md` §3.1 and §3.2). `paths.base: '/app'` puts
 * `apps/web/static/catalogue` at `build/app/catalogue`, and this Worker and that build deploy as separate commits, so a
 * reader that knew only one place offered nothing from Spark for as long as the other was live: the shell, or a 404,
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

/** Spark's catalogue offers on the Worker, or none when no assets are bound. */
export const workerCatalogueOffers = (assets: Assets | undefined) => (assets === undefined ? undefined : offersFromCatalogue(assetsReader(assets)));
