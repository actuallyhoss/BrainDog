/**
 * Newer versions of what a record holds, read from a catalogue through whatever reads its files, for Slash to ask about
 * (`RecordDeps.catalogueOffers`, `slash.ts` `catalogueDrafts`).
 *
 * ONE READER, TWO HOSTS. The self-host reads a folder on disk; the Worker reads the folder bundled with its shell through its
 * static assets. Both hand in `read(path)`, answering a file's text or `null`, and get the same offers.
 *
 * EACH IS HELD TO ITS CHECKSUM AND SIGNATURE and read through its door before it is offered (`catalogueUpdates`); one that
 * does not verify is never offered. A catalogue with no index, or an index that does not read, offers nothing.
 */

import {
  CATALOGUE_INDEX,
  catalogueFile,
  catalogueUpdates,
  heldToEntry,
  installedIdOf,
  keysSignedBefore,
  listedEntries,
  offeredVersion,
  readCatalogue,
  readCatalogueFile,
  revokedNotice,
  rotatedFrom,
  strippedNotice,
  verifiedStatements,
  verifySignature,
  verifyVersion,
  type CatalogueEntry as IndexEntry,
  type CatalogueIndex,
} from '@braindog/declare/catalogue';
import type { Refusal, Result } from '@braindog/ports';

import type { CatalogueShelf, ShelfEntry, ShelfFetched } from './arrange.ts';
import type { CatalogueOffer } from './slash.ts';

export type CatalogueReader = (path: string) => string | null | Promise<string | null>;

export function offersFromCatalogue(read: CatalogueReader): (held: readonly { id: string; version: string; on: boolean }[]) => Promise<CatalogueOffer[]> {
  return async (held) => {
    let doc: unknown;
    try {
      const text = await read(CATALOGUE_INDEX);
      if (text === null) return [];
      doc = JSON.parse(text);
    } catch {
      return [];
    }
    const index = readCatalogue(doc);
    if (!index.ok) return [];
    const { updates } = await catalogueUpdates(index.value, held.map((h) => ({ id: h.id, version: h.version, disabled_at: h.on ? null : 'off' })), read);
    const statements = await verifiedStatements(index.value.keys);
    const offers: CatalogueOffer[] = [];
    for (const u of updates) {
      /* THE KEY NOTE IS HELD TO THE VERSION INSTALLED: its signature as listed, verified here, or nothing. */
      const was = u.entry.versions.find((v) => v.version === u.from);
      const installedSignedBy = was?.signature && (await verifySignature(was.signature, u.entry.kind, u.entry.id, was.version, was.checksum)).ok ? was.signature.key_id : null;
      const signedBy = u.signature?.key_id ?? null;
      offers.push({
        id: u.installed,
        title: u.entry.title,
        from: u.from,
        to: u.to.version,
        body: u.file.kind === 'usecase' ? { file: u.text } : { install: u.installed, doc: u.file.file.doc },
        signedBy,
        installedSignedBy,
        rotated: signedBy !== null && installedSignedBy !== null && signedBy !== installedSignedBy && rotatedFrom(statements, [installedSignedBy], signedBy) !== null,
        hostsAdded: u.changes?.hosts.added ?? [],
        removed: (u.changes?.removed ?? []).map((r) => r.title),
        changesKnown: u.changes !== null,
        /* PRIVATE IS WHERE IT IS SHOWN, NOT WHO KEEPS IT CURRENT: an add-on BrainDog publishes for one bank is unlisted and
           never suggested, and still updates itself when nothing the person changed would be lost, as every other one of
           BrainDog's own does. Held back for being private, a bank's alerts sat a version behind for weeks, asked about
           nowhere, with the newer version changing nothing it read or wrote. */
        firstParty: u.file.kind === 'pack' && u.entry.publisher?.kind === 'braindog',
      });
    }
    return offers;
  };
}

/* ── the whole catalogue, for the arranger ───────────────────────────────── */

const indexOf = async (read: CatalogueReader): Promise<CatalogueIndex | null> => {
  try {
    const text = await read(CATALOGUE_INDEX);
    if (text === null) return null;
    const index = readCatalogue(JSON.parse(text));
    return index.ok ? index.value : null;
  } catch {
    return null;
  }
};

/** An entry by the pack id a record holds it under, or a use case by its own short id: `usecase-student` or `student`. */
const entryNamed = (index: CatalogueIndex, id: string): IndexEntry | undefined =>
  index.entries.find((e) => installedIdOf(e) === id) ?? index.entries.find((e) => e.kind === 'usecase' && e.id === id);

const shelfEntry = (e: IndexEntry, version: string, modules: readonly string[]): ShelfEntry => {
  const widgets = e.versions.find((v) => v.version === version)?.reach?.widgets ?? [];
  return { id: installedIdOf(e), kind: e.kind, title: e.title, summary: e.summary, version, modules, ...(widgets.length > 0 ? { widgets } : {}) };
};

/**
 * THE HOST'S WHOLE CATALOGUE, AS THE ARRANGER READS IT (`ArrangeDeps.shelf`). The arranger found an add-on only in the
 * host's short list and refused every other one the catalogue held, so an agent asked to install Stripe was told it was
 * not on offer while the catalogue listed it. Now any current entry is found by its id.
 *
 * HELD AS AN UPDATE IS HELD (`catalogueUpdates`): the newest version not yanked, its file fetched and held to the
 * checksum the index gives, its signature verified, a revoked or stripped one refused, read through its door and held to
 * the entry it is listed under. What does not hold is a refusal saying why, never an install. An unlisted entry installs
 * by its id and is left out of `listed`, as the catalogue says.
 */
export function shelfFromCatalogue(read: CatalogueReader): CatalogueShelf {
  const no = (code: Refusal['code'], fix: string): Result<ShelfFetched> => ({ ok: false, refusal: { code, fix, at: 'file' } });
  return {
    index: () => indexOf(read),
    listed: async () => {
      const index = await indexOf(read);
      if (index === null) return [];
      return listedEntries(index).flatMap((e) => {
        const latest = offeredVersion(e);
        return latest === null ? [] : [shelfEntry(e, latest.version, latest.reach?.modules ?? [])];
      });
    },
    fetch: async (id) => {
      const index = await indexOf(read);
      const entry = index === null ? undefined : entryNamed(index, id);
      const latest = entry === undefined ? null : offeredVersion(entry);
      if (index === null || entry === undefined || latest === null) return null;
      const not = (fix: string): string => `${entry.title} is in this host's catalogue and was not offered. ${fix}`;
      const text = await read(catalogueFile(entry.id, latest.version, entry.kind));
      if (text === null) return no('DECLARATION_UNKNOWN', not(`Its file for ${latest.version} is missing.`));
      const verified = await verifyVersion(entry, latest, text);
      if (!verified.ok) {
        const r = (verified as { refusal: Refusal }).refusal;
        return no(r.code, not(r.fix));
      }
      const statements = await verifiedStatements(index.keys);
      const revoked = revokedNotice(statements, entry.title, latest.version, verified.value);
      if (revoked !== null) return no('SIGNATURE_INVALID', not(revoked));
      if (verified.value === null) {
        const before = await keysSignedBefore(entry, latest.version);
        if (before.length > 0) return no('SIGNATURE_INVALID', not(strippedNotice(entry.title, latest.version, before)));
      }
      const file = await readCatalogueFile(text, { kind: 'url' });
      if (!file.ok) return no('PACK_MALFORMED', not((file as { refusal: Refusal }).refusal.fix));
      const held = heldToEntry(entry, latest.version, file.value);
      if (!held.ok) return no('PACK_MALFORMED', not((held as { refusal: Refusal }).refusal.fix));
      const f = file.value;
      const doc = f.kind === 'usecase' ? f.shared.doc : f.file.doc;
      if (doc === null) return no('PACK_MALFORMED', not('It carries no lists or pages of its own, only the modules it names.'));
      const modules = f.kind === 'usecase' ? f.shared.usecase.modules : Object.keys(f.file.pack.manifest.requires.packs);
      return { ok: true, value: { ...shelfEntry(entry, latest.version, modules), doc } };
    },
  };
}
