/**
 * A catalogue of shared use cases and add-ons served from a folder, read-only: `/app/catalogue/index.json` and each version's
 * file at `/app/catalogue/usecases/<id>/<version>.usecase.json` or `/app/catalogue/packs/<id>/<version>.pack.json` (`@braindog/declare/catalogue`, `loop/research-marketplace.md` §2).
 *
 * UNDER THE APP'S BASE, BECAUSE THAT IS WHERE THE APP ASKS. `apps/web` fetches `${BASE}/catalogue/` (`routes/packs/browse/catalogue.ts`,
 * `loop/research-one-domain.md` §2.2), and while this answered `/catalogue/` alone the request fell through to the shell,
 * which served the bundled folder's files as static files, `notes.txt` and all, and the operator's named folder not at all.
 * The old address is not answered here: the shell sends a navigation to it on to `/app/catalogue/`.
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
import type { CatalogueOffer } from '@braindog/record';
import { offersFromCatalogue } from '@braindog/record/catalogue-offers';

const PREFIX = '/app/catalogue/';
const INDEX = /^\/app\/catalogue\/index\.json$/u;
const FILE = /^\/app\/catalogue\/(?:usecases\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.usecase|packs\/[a-z][a-z0-9-]{0,62}\/\d{1,6}\.\d{1,6}\.\d{1,6}\.pack)\.json$/u;

export type Answer = { status: number; headers: Record<string, string>; body: string };

const said = (status: number, body: string): Answer => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  body,
});

/** The answer for a request under `/app/catalogue/`, or `null` for any other path, which the caller answers as before. */
export function catalogueAnswer(dir: string | undefined, method: string, pathname: string): Answer | null {
  if (!pathname.startsWith(PREFIX) && pathname !== '/app/catalogue') return null;
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
 * THE SHELL IS THE BUILD DIRECTORY OR ITS `app` FOLDER, AND BOTH ARE LOOKED IN. The web build now writes `static/` under
 * its base, so the bundled catalogue is `build/app/catalogue`. `BRAINDOG_SHELL` named `build/` before the move and still
 * does in an operator's environment, and there `<shell>/catalogue` is no longer anything: measured, a shell named that
 * way offered no catalogue and said nothing. `shell.ts` reads either name the same way (`appFolder`), and so does this.
 */
export function catalogueFolder(named: string | undefined, shell: string | undefined): string | undefined {
  if (named !== undefined) return named;
  if (shell === undefined) return undefined;
  for (const bundled of [join(shell, 'app', 'catalogue'), join(shell, 'catalogue')]) if (existsSync(join(bundled, CATALOGUE_INDEX))) return bundled;
  return undefined;
}

/** Newer versions of what a record holds, from the same folder, for Spark to ask about (`@braindog/record/catalogue-offers`). */
export function catalogueOffersFrom(dir: string): (held: readonly { id: string; version: string; on: boolean }[]) => Promise<CatalogueOffer[]> {
  return offersFromCatalogue((path) => {
    try {
      return readFileSync(join(dir, ...path.split('/')), 'utf8');
    } catch {
      return null;
    }
  });
}
