/**
 * WHAT EACH OPTION OF ONE QUESTION IS, ON THE QUESTION'S OWN PAGE: a colour, a figure or a picture, by the option's id.
 *
 * THE QUEUE'S TILE IS HANDED ITS WAY TO A FILE BY THE PAGE THAT DREW IT (`QueueAnswer.svelte`, `page-live.ts`
 * `fileAt`), which reads the block's own entries. This page has no block. It has the record, so it asks the record for
 * the entry a picture option names and reads the file's hash from the field, and the address is the one every file is
 * served at. A reader the record will not show the entry to gets no picture, and the option reads by its name.
 */

import { visualOf, type FileAt, type Visual } from '../../../lib/page/queue-answer.ts';

/**
 * Each option's visual, by its id, read from the body the question was filed with (its words carry none).
 *
 * THROUGH `visualOf`, so a swatch is held to the renderer's own spelling before it reaches a style, and a picture is
 * drawn only from an address of this host. With no `file`, a picture option is left out.
 */
export function visualsOf(options: unknown, file?: FileAt): Map<string, Visual> {
  const out = new Map<string, Visual>();
  if (!Array.isArray(options)) return out;
  for (const o of options as unknown[]) {
    if (o === null || typeof o !== 'object') continue;
    const { id, shows } = o as { id?: unknown; shows?: unknown };
    if (typeof id !== 'string') continue;
    const seen = visualOf(shows, file);
    if (seen !== null) out.set(id, seen);
  }
  return out;
}

/** A file an option names, with the list and the number its entry is asked for by. */
export type Named = { row: string; field: string; list: string; seq: number };

/**
 * The files a question's options name, once each.
 *
 * READ BY `visualOf` ITSELF, handed a way to a file that only listens: what it asks for is what the renderer's own
 * reading passed, so a spelling it would refuse is never asked of the record.
 */
export function filesNamed(options: unknown): Named[] {
  const out = new Map<string, Named>();
  if (!Array.isArray(options)) return [];
  for (const o of options as unknown[]) {
    if (o === null || typeof o !== 'object') continue;
    visualOf((o as { shows?: unknown }).shows, (row, field) => {
      const hash = row.lastIndexOf('#');
      const seq = Number(row.slice(hash + 1));
      if (hash > 0 && Number.isInteger(seq) && seq >= 1) out.set(`${row}/${field}`, { row, field, list: row.slice(0, hash), seq });
      return null;
    });
  }
  return [...out.values()];
}

/* A FILE'S NAME IS ITS HASH, and only a hash in the one shape the record writes is put in an address (`page-live.ts`
   keeps the same check for a block's files): a value an agent wrote into a field is no path segment until it is proven
   to be 64 hex digits. */
const SHA256 = /^[0-9a-f]{64}$/u;

/** What `get` answers with, as much of it as is read here. */
type Got = { ok: boolean; value?: unknown };

/** The record's read of one entry, by its list and its number (`@braindog/client` `get`). */
export type Get = (list: string, seq: number) => Promise<Got>;

/**
 * THE WAY TO EACH FILE A QUESTION'S OPTIONS NAME, read from the record once.
 *
 * `place` PUTS A RECORD-RELATIVE ADDRESS UNDER THE RECORD THE PAGE IS ON (`at.ts` `at`), as a page places its own.
 * A read the record refuses, one that fails, an entry of another list and a field holding no file all answer `null`.
 */
export async function readFiles(get: Get, options: unknown, place: (path: string) => string): Promise<(row: string, field: string) => string | null> {
  const held = new Map<string, string>();
  await Promise.all(
    filesNamed(options).map(async ({ row, field, list, seq }) => {
      const got = await get(list, seq).catch((): Got => ({ ok: false }));
      const entry = got.ok && got.value !== null && typeof got.value === 'object' ? (got.value as { register?: unknown; fields?: unknown }) : null;
      if (entry === null || (entry.register ?? list) !== list) return;
      const value = entry.fields !== null && typeof entry.fields === 'object' ? (entry.fields as Record<string, unknown>)[field] : null;
      const sha256 = value !== null && typeof value === 'object' ? (value as { sha256?: unknown }).sha256 : null;
      if (typeof sha256 === 'string' && SHA256.test(sha256)) held.set(`${row}/${field}`, place(`/api/files/${sha256}`));
    }),
  );
  return (row, field) => held.get(`${row}/${field}`) ?? null;
}
