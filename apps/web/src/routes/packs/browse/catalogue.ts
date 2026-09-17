/**
 * A catalogue on browse: the use cases this BrainDog's host serves from a folder (`/catalogue/index.json`,
 * `@braindog/declare/catalogue`, `loop/research-marketplace.md` §1 and §2).
 *
 * NOTHING HERE INSTALLS. It reads the index, fetches a version's file and holds it to the checksum the index gives, says
 * whether a use case here is at that version, and what changed from the version installed. Installing is the shared
 * file's path (`InstallShared.svelte`): the record plans it and the owner approves it.
 *
 * A HOST WITH NO CATALOGUE is not an error: browse draws the built-in use cases alone, as before.
 *
 * PURE, AND THEREFORE TESTABLE: the fetcher is handed in.
 */

import type { CatalogueEntry, CatalogueIndex, CatalogueVersion, Changes } from '@braindog/declare/catalogue';

import type { PackState } from '../../../lib/record/packs.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export const CATALOGUE_BASE = '/catalogue/';

/** The index this host serves, `null` when it serves none, or the sentence to say when one is there and does not read. */
export async function readHostCatalogue(fetcher: Fetcher): Promise<{ ok: true; index: CatalogueIndex | null } | { ok: false; fix: string }> {
  let res: Response;
  try {
    res = await fetcher(`${CATALOGUE_BASE}index.json`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  } catch {
    return { ok: true, index: null };
  }
  if (res.status === 404 || !(res.headers.get('content-type') ?? '').includes('json')) return { ok: true, index: null };
  if (!res.ok) return { ok: true, index: null };
  const { readCatalogue } = await import('@braindog/declare/catalogue');
  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    return { ok: false, fix: 'This BrainDog serves a catalogue that is not JSON, so nothing from it is listed.' };
  }
  const read = readCatalogue(doc);
  return read.ok ? { ok: true, index: read.value } : { ok: false, fix: 'refusal' in read ? read.refusal.fix : 'This catalogue does not read.' };
}

/** A version's file, fetched and held to the checksum the index gives, or the sentence and code to say instead. */
export async function catalogueText(fetcher: Fetcher, entry: CatalogueEntry, version: CatalogueVersion): Promise<{ ok: true; text: string } | { ok: false; fix: string; code: string | null }> {
  const { catalogueFile, verifyFile } = await import('@braindog/declare/catalogue');
  let text: string;
  try {
    const res = await fetcher(`${CATALOGUE_BASE}${catalogueFile(entry.id, version.version)}`, { credentials: 'same-origin' });
    if (!res.ok) return { ok: false, fix: `${entry.title} ${version.version} is listed in this catalogue and its file is missing.`, code: null };
    text = await res.text();
  } catch {
    return { ok: false, fix: `${entry.title} ${version.version} could not be fetched from this catalogue.`, code: null };
  }
  const held = await verifyFile(version, text);
  if (!held.ok) return { ok: false, fix: 'refusal' in held ? held.refusal.fix : 'This file does not read.', code: 'refusal' in held ? held.refusal.code : null };
  return { ok: true, text };
}

export type Standing = { kind: 'install' } | { kind: 'update'; from: string } | { kind: 'current' } | { kind: 'ahead'; at: string } | { kind: 'off'; at: string | null };

/** Where this record stands against an entry's latest version: not here, older, the same, newer, or turned off. */
export async function standingOf(entry: CatalogueEntry, states: readonly PackState[]): Promise<Standing> {
  const held = states.find((s) => s.id === `usecase-${entry.id}`);
  if (!held) return { kind: 'install' };
  if (held.disabled_at !== null) return { kind: 'off', at: held.version };
  if (held.version === null) return { kind: 'update', from: '' };
  const { compareVersions } = await import('@braindog/declare/catalogue');
  const d = compareVersions(held.version, entry.latest);
  return d < 0 ? { kind: 'update', from: held.version } : d === 0 ? { kind: 'current' } : { kind: 'ahead', at: held.version };
}

/**
 * What changed from the version installed here to the latest, when the catalogue still holds the installed one; `null`
 * when it does not, in which case the record's own plan is the only diff, and it is shown.
 */
export async function changesSince(fetcher: Fetcher, entry: CatalogueEntry, from: string): Promise<Changes | null> {
  const was = entry.versions.find((v) => v.version === from);
  const now = entry.versions[0];
  if (!was || !now || was === now) return null;
  const [a, b] = await Promise.all([catalogueText(fetcher, entry, was), catalogueText(fetcher, entry, now)]);
  if (!a.ok || !b.ok) return null;
  const { readShared } = await import('@braindog/declare');
  const { changesBetween } = await import('@braindog/declare/catalogue');
  const [x, y] = await Promise.all([readShared(a.text), readShared(b.text)]);
  return x.ok && y.ok ? changesBetween(x.value, y.value) : null;
}
