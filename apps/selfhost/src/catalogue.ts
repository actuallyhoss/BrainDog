/**
 * A catalogue of shared use cases served from a folder, read-only: `/catalogue/index.json` and each version's file at
 * `/catalogue/usecases/<id>/<version>.usecase.json` (`@braindog/declare/catalogue`, `loop/research-marketplace.md` §2).
 *
 * THE OPERATOR NAMES THE FOLDER (`BRAINDOG_CATALOGUE`), and `braindog usecase publish --to` writes into it. Nothing else
 * in it is reachable: a path is matched whole against the two shapes, so no `..`, no other file and no listing. The files
 * are ones their authors shared, so they are answered without a sign-in, as a public add-on index would answer them.
 *
 * SERVING A FILE INSTALLS NOTHING. The app reads it, holds it to the index's checksum, and installs it through the plan
 * the owner approves, like any other shared file.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const INDEX = /^\/catalogue\/index\.json$/u;
const FILE = /^\/catalogue\/usecases\/([a-z][a-z0-9-]{0,62})\/(\d{1,6}\.\d{1,6}\.\d{1,6})\.usecase\.json$/u;

export type Answer = { status: number; headers: Record<string, string>; body: string };

const said = (status: number, body: string): Answer => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  body,
});

/** The answer for a request under `/catalogue/`, or `null` for any other path, which the caller answers as before. */
export function catalogueAnswer(dir: string | undefined, method: string, pathname: string): Answer | null {
  if (!pathname.startsWith('/catalogue/') && pathname !== '/catalogue') return null;
  const refusal = (status: number, fix: string) => said(status, JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix } }));
  if (dir === undefined) return refusal(404, 'This BrainDog serves no catalogue. Name a folder with BRAINDOG_CATALOGUE.');
  if (method !== 'GET' && method !== 'HEAD') return refusal(405, 'A catalogue is read with GET.');
  const file = INDEX.test(pathname) ? 'index.json' : FILE.test(pathname) ? pathname.slice('/catalogue/'.length) : null;
  if (file === null) return refusal(404, 'A catalogue answers index.json and usecases/<id>/<version>.usecase.json.');
  try {
    return said(200, readFileSync(join(dir, ...file.split('/')), 'utf8'));
  } catch {
    return refusal(404, file === 'index.json' ? 'This catalogue has nothing published yet.' : 'That version is not in this catalogue.');
  }
}
