/**
 * A catalogue of shared use cases and add-ons served from a folder, read-only: `/catalogue/index.json` and each version's
 * file at `/catalogue/usecases/<id>/<version>.usecase.json` or `/catalogue/packs/<id>/<version>.pack.json` (`@braindog/declare/catalogue`, `loop/research-marketplace.md` §2).
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

import { CATALOGUE_INDEX, catalogueUpdates, readCatalogue } from '@braindog/declare/catalogue';
import type { CatalogueOffer } from '@braindog/record';

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
  if (!pathname.startsWith('/catalogue/') && pathname !== '/catalogue') return null;
  const refusal = (status: number, fix: string) => said(status, JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix } }));
  if (dir === undefined) return refusal(404, 'This BrainDog serves no catalogue. Name a folder with BRAINDOG_CATALOGUE.');
  if (method !== 'GET' && method !== 'HEAD') return refusal(405, 'A catalogue is read with GET.');
  const file = INDEX.test(pathname) ? 'index.json' : FILE.test(pathname) ? pathname.slice('/catalogue/'.length) : null;
  if (file === null) return refusal(404, 'A catalogue answers index.json, usecases/<id>/<version>.usecase.json and packs/<id>/<version>.pack.json.');
  try {
    return said(200, readFileSync(join(dir, ...file.split('/')), 'utf8'));
  } catch {
    return refusal(404, file === 'index.json' ? 'This catalogue has nothing published yet.' : 'That version is not in this catalogue.');
  }
}

/**
 * Newer versions of what a record holds, from the same folder, for Spark to ask about (`RecordDeps.catalogueOffers`).
 *
 * EACH IS HELD TO ITS CHECKSUM AND SIGNATURE and read through its door before it is offered (`catalogueUpdates`); one that
 * does not verify is never offered. A folder with no index offers nothing.
 */
export function catalogueOffersFrom(dir: string): (held: readonly { id: string; version: string; on: boolean }[]) => Promise<CatalogueOffer[]> {
  const read = (path: string): string | null => {
    try {
      return readFileSync(join(dir, ...path.split('/')), 'utf8');
    } catch {
      return null;
    }
  };
  return async (held) => {
    const text = read(CATALOGUE_INDEX);
    if (text === null) return [];
    const index = readCatalogue(JSON.parse(text));
    if (!index.ok) return [];
    const { updates } = await catalogueUpdates(index.value, held.map((h) => ({ id: h.id, version: h.version, disabled_at: h.on ? null : 'off' })), read);
    return updates.map((u) => ({
      id: u.installed,
      title: u.entry.title,
      from: u.from,
      to: u.to.version,
      body: u.file.kind === 'usecase' ? { file: u.text } : { install: u.installed, doc: u.file.file.doc },
      signedBy: u.signature?.key_id ?? null,
      hostsAdded: u.changes?.hosts.added ?? [],
      removed: (u.changes?.removed ?? []).map((r) => r.title),
    }));
  };
}
