/**
 * Newer versions of what a record holds, read from a catalogue through whatever reads its files, for Spark to ask about
 * (`RecordDeps.catalogueOffers`, `spark.ts` `catalogueDrafts`).
 *
 * ONE READER, TWO HOSTS. The self-host reads a folder on disk; the Worker reads the folder bundled with its shell through its
 * static assets. Both hand in `read(path)`, answering a file's text or `null`, and get the same offers.
 *
 * EACH IS HELD TO ITS CHECKSUM AND SIGNATURE and read through its door before it is offered (`catalogueUpdates`); one that
 * does not verify is never offered. A catalogue with no index, or an index that does not read, offers nothing.
 */

import { CATALOGUE_INDEX, catalogueUpdates, readCatalogue } from '@braindog/declare/catalogue';

import type { CatalogueOffer } from './spark.ts';

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
