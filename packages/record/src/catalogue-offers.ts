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
import { ADVISORIES_FILE, noticesFor, readAdvisories, type Advisories, type Notice } from '@braindog/declare/kennel';

import type { CatalogueShelf, ShelfEntry, ShelfFetched } from './arrange.ts';
import type { CatalogueOffer } from './slash.ts';

export type CatalogueReader = (path: string) => string | null | Promise<string | null>;

export function offersFromCatalogue(read: CatalogueReader): (held: readonly { id: string; version: string; on: boolean; source?: string | null }[]) => Promise<CatalogueOffer[]> {
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
    const { updates } = await catalogueUpdates(index.value, held.map((h) => ({ id: h.id, version: h.version, disabled_at: h.on ? null : 'off', source: h.source ?? null })), read);
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

/* ── what the store says about what a record holds ───────────────────────── */

/** One add-on held here: its version, and the checksum its `pack` row keeps (`null` for one the seed owns with no row). */
export type HeldPack = { id: string; version: string; checksum: string | null; on: boolean };

/**
 * THE KILL SWITCH AND THE YANK, AS A RECORD HEARS THEM (DESIGN.md §8, PHASES.md Lane H): every advisory and yank the
 * catalogue says of an add-on at the version held here, read beside the index (`advisories.json`).
 *
 * ONLY FOR THE STORE'S OWN FILE. An add-on made here, pasted or from GitHub can share an id and a version with one in the
 * store, and the store's word is not about it (the slug hijack, DESIGN.md §4.4, the other way round). So a notice is
 * kept only when the version held is the one the store lists, byte for byte as read: the listed file is fetched, held
 * to the index's checksum, read through its door, and its pack checksum compared with the one this record installed.
 * A seed-owned add-on (no `pack` row) is BrainDog's own and is the store's when the store's entry is BrainDog's.
 */
export function noticesFromCatalogue(read: CatalogueReader): (held: readonly HeldPack[]) => Promise<(Notice & { on: boolean })[]> {
  return async (held) => {
    const index = await indexOf(read);
    if (index === null) return [];
    let advisories: Advisories | null = null;
    try {
      const text = await read(ADVISORIES_FILE);
      advisories = text === null ? null : readAdvisories(JSON.parse(text));
    } catch {
      advisories = null;
    }
    const out: (Notice & { on: boolean })[] = [];
    for (const h of held) {
      const entry = index.entries.find((e) => e.kind === 'pack' && installedIdOf(e) === h.id);
      if (entry === undefined) continue;
      const said = noticesFor(index, advisories, 'pack', entry.id, h.version);
      if (said.length === 0) continue;
      if (!(await theStores(read, entry, h))) continue;
      for (const n of said) out.push({ ...n, id: h.id, on: h.on });
    }
    return out;
  };
}

/** Whether the version held is the file the store lists at that version (`noticesFromCatalogue`). */
async function theStores(read: CatalogueReader, entry: IndexEntry, h: HeldPack): Promise<boolean> {
  if (h.checksum === null) return entry.publisher?.kind === 'braindog';
  const listed = entry.versions.find((v) => v.version === h.version);
  if (listed === undefined) return false;
  try {
    const text = await read(catalogueFile(entry.id, h.version, entry.kind));
    if (text === null) return false;
    const verified = await verifyVersion(entry, listed, text);
    if (!verified.ok) return false;
    const file = await readCatalogueFile(text, { kind: 'url' });
    return file.ok && file.value.kind === 'pack' && file.value.file.pack.checksum === h.checksum;
  } catch {
    return false;
  }
}
