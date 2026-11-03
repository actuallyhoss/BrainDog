/**
 * A catalogue of shared use cases and add-ons served from a folder, read-only: `/catalogue/index.json` and each version's
 * file at `/catalogue/usecases/<id>/<version>.usecase.json` or `/catalogue/packs/<id>/<version>.pack.json` (`@braindog/declare/catalogue`).
 *
 * BESIDE THE APP, BECAUSE THAT IS WHERE THE APP ASKS. `apps/web` fetches `${BASE}/catalogue/` (`routes/packs/browse/catalogue.ts`),
 * and its base is the root. Answered here and not by the shell, which would serve the bundled folder's files as static
 * files, `notes.txt` and all, and the operator's named folder not at all. The old `/app/catalogue/` is not answered
 * here: the shell sends a request for it on to `/catalogue/` with a 308.
 *
 * THE OPERATOR NAMES THE FOLDER (`BRAINDOG_CATALOGUE`), or the built shell's bundled one is served (`catalogueFolder`), and `braindog usecase publish --to` writes into it. Nothing else
 * in it is reachable: a path is matched whole against the two shapes, so no `..`, no other file and no listing. The files
 * are ones their authors shared, so they are answered without a sign-in, as a public add-on index would answer them.
 *
 * SERVING A FILE INSTALLS NOTHING. The app reads it, holds it to the index's checksum, and installs it through the plan
 * the owner approves, like any other shared file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOGUE_INDEX } from '@braindog/declare/catalogue';
import { ADVISORIES_FILE } from '@braindog/declare/kennel';
import type { CatalogueOffer } from '@braindog/record';
import { noticesFromCatalogue, offersFromCatalogue, shelfFromCatalogue, type CatalogueReader } from '@braindog/record/catalogue-offers';

import { kennelReader, type KennelDeps } from './kennel.ts';

const PREFIX = '/catalogue/';
const INDEX = /^\/catalogue\/index\.json$/u;
const FILE = /^\/catalogue\/(?:usecases\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.usecase|packs\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.pack)\.json$/u;

export type Answer = { status: number; headers: Record<string, string>; body: string };

const said = (status: number, body: string): Answer => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  body,
});

/** The answer for a request under `/catalogue/`, or `null` for any other path, which the caller answers as before. */
export function catalogueAnswer(dir: string | undefined, method: string, pathname: string): Answer | null {
  if (!pathname.startsWith(PREFIX) && pathname !== '/catalogue') return null;
  const refusal = (status: number, fix: string) => said(status, JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix } }));
  if (dir === undefined) return refusal(404, 'This BrainDog serves no catalogue. Name a folder with BRAINDOG_CATALOGUE.');
  if (method !== 'GET' && method !== 'HEAD') return refusal(405, 'A catalogue is read with GET.');
  const file = INDEX.test(pathname) ? 'index.json' : FILE.test(pathname) ? pathname.slice(PREFIX.length) : null;
  if (file === null) return refusal(404, 'A catalogue answers index.json, usecases/<id>/<version>.usecase.json and packs/<id>/<version>.pack.json.');
  try {
    return said(200, readFileSync(join(dir, ...file.split('/')), 'utf8'));
  } catch {
    return refusal(404, file === 'index.json' ? 'This catalogue has nothing published yet.' : 'That version is not in this catalogue.');
  }
}

/**
 * The folder to serve: the one the operator named, or else the catalogue bundled in the built shell (`apps/web/static/catalogue`,
 * the one the hosted app serves), so a self-host started with no `BRAINDOG_CATALOGUE` shows what its own shell ships
 * instead of hiding it behind a 404. Served by the same two path shapes, read-only.
 *
 * THE SHELL IS THE BUILD DIRECTORY, OR THE `app` FOLDER INSIDE IT, AND BOTH ARE LOOKED IN. The web build writes
 * `static/` at its root, so the bundled catalogue is `build/catalogue`; while the app was built under `/app` it was
 * `build/app/catalogue`, and an operator's `BRAINDOG_SHELL` may still name either. Measured once, a shell named the
 * way the build no longer wrote offered no catalogue and said nothing. `shell.ts` reads either name (`appFolder`).
 */
export function catalogueFolder(named: string | undefined, shell: string | undefined): string | undefined {
  if (named !== undefined) return named;
  if (shell === undefined) return undefined;
  for (const bundled of [join(shell, 'catalogue'), join(shell, '..', 'catalogue'), join(shell, 'app', 'catalogue')]) if (existsSync(join(bundled, CATALOGUE_INDEX))) return bundled;
  return undefined;
}

/** The two shapes a catalogue lists, as a path inside it: no `..`, no other file. */
const PATH = /^(?:index\.json|advisories\.json|usecases\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.usecase\.json|packs\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.pack\.json)$/u;

/**
 * The catalogue a record installs from, read through the Kennel (`kennel.ts` `kennelReader`): the folder's index and the
 * public Kennel's merged, the folder's first, and a file from the folder, then the public Kennel. With
 * `BRAINDOG_KENNEL=off` or no network, the folder alone, as before.
 */
export function kennelCatalogueReader(dir: string | undefined, deps?: KennelDeps): CatalogueReader {
  const kennel = kennelReader(dir, deps);
  return async (path) => {
    if (!PATH.test(path)) return null;
    if (path === ADVISORIES_FILE) return JSON.stringify(await kennel.advisories());
    return path === CATALOGUE_INDEX ? JSON.stringify(await kennel.index()) : kennel.file(path);
  };
}

/** Newer versions of what a record holds, from the folder and the Kennel, for Slash to ask about (`@braindog/record/catalogue-offers`). */
export function catalogueOffersFrom(dir: string | undefined, deps?: KennelDeps): (held: readonly { id: string; version: string; on: boolean }[]) => Promise<CatalogueOffer[]> {
  return offersFromCatalogue(kennelCatalogueReader(dir, deps));
}

/** What the folder and the Kennel say of the add-ons a record holds: advisories and yanks (`noticesFromCatalogue`). */
export const catalogueNoticesFrom = (dir: string | undefined, deps?: KennelDeps) => noticesFromCatalogue(kennelCatalogueReader(dir, deps));

/** The whole catalogue, the folder's and the Kennel's, for the arranger to install from (`RecordDeps.catalogueShelf`, `shelfFromCatalogue`). */
export const catalogueShelfFrom = (dir: string | undefined, deps?: KennelDeps) => shelfFromCatalogue(kennelCatalogueReader(dir, deps));
