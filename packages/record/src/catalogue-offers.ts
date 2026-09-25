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

import { CATALOGUE_INDEX, catalogueUpdates, readCatalogue, rotatedFrom, verifiedStatements, verifySignature } from '@braindog/declare/catalogue';

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
      });
    }
    return offers;
  };
}
