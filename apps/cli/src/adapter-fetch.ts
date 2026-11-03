/**
 * An import adapter named by an add-on's id and found in no `packs/` folder: fetched from the catalogue, held to its
 * checksum and its author's signature, kept on this machine, and run only after a yes.
 *
 * THE CATALOGUE CARRIES IT BESIDE THE ADD-ON. A version of an add-on in `index.json` may say `adapter: { checksum,
 * signature? }`; the file sits at `packs/<id>/<version>.adapter.mjs`, a path built from the id and the version and
 * never read from the index, so an index cannot point the fetch anywhere else. `checksum` is SHA-256 of the file's
 * bytes. A signed version's adapter is signed by the same key over kind `adapter`, its id, version and checksum, so the
 * signature over the add-on's own file can never stand in for it, nor the other way round.
 *
 * IT IS CODE A STRANGER WROTE, RUNNING WITH THIS PERSON'S RIGHTS, and there is no sign before harm. So the version is
 * held to what `pack install` holds an add-on to (`trustVersion`: a revoked key, a stripped signature), the question
 * names it as a program, and nothing runs unasked. A yes is kept by the file's hash, so a changed file asks again.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { CATALOGUE_INDEX, readCatalogue, verifySignature, type CatalogueEntry, type KnownKeys, type Signature } from '@braindog/declare/catalogue';

import type { CatalogueRead } from './adapter.ts';
import { trustVersion } from './catalogue.ts';

type Obj = Record<string, unknown>;

/** A declare refusal as its sentence. */
const fixOf = (r: { ok: false } & ({ refusal: { fix: string } } | { conflict: unknown })): string => ('refusal' in r ? r.refusal.fix : 'it changed while it was read');

/** Who answers the question at a terminal: yes or no, or `null` when nobody can be asked. */
export type Asker = ((question: string) => Promise<boolean>) | null;

export type FetchIo = {
  /** The folder `~/.braindog` is under. */
  home: string;
  catalogue: CatalogueRead;
  /** The keys this machine has seen, which `pack install` reads too. */
  known?: KnownKeys;
};

export type AskIo = {
  home: string;
  /** Who answers at the terminal; left out, the real terminal when there is one. */
  ask?: Asker | undefined;
  /** `--yes`: a script's yes, given on the line. */
  yes?: boolean | undefined;
};

/** What the catalogue lists an adapter as, and where this machine keeps it. */
export type Fetched = { id: string; title: string; version: string; hash: string; file: string };

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The adapter file's path inside a catalogue. */
export const adapterPath = (id: string, version: string): string => `packs/${id}/${version}.adapter.mjs`;

/** Where this machine keeps a fetched adapter. */
export const keptAdapter = (home: string, id: string, version: string): string => join(home, '.braindog', 'adapters', `${id}-${version}.mjs`);

/** Where the yeses are kept, by the adapter file's hash. */
export const allowedPath = (home: string): string => join(home, '.braindog', 'adapters.json');

/** A file written whole or not at all, so a cut run never leaves half an adapter to be run next time. */
function writeWhole(path: string, text: string): void {
  const dir = join(path, '..');
  mkdirSync(dir, { recursive: true });
  const part = `${path}.${process.pid}.part`;
  writeFileSync(part, text);
  renameSync(part, path);
}

/**
 * The adapter of the add-on `id`, from the catalogue: the kept copy when its hash is still the catalogue's, else
 * fetched, held and kept. Or the sentence saying why not, with nothing kept.
 */
export async function fetchAdapter(id: string, io: FetchIo): Promise<{ ok: true; value: Fetched } | { ok: false; fix: string }> {
  const where = io.catalogue.where;
  const text = await io.catalogue.read(CATALOGUE_INDEX);
  if (text === null) return { ok: false, fix: `${id} is in no packs/ folder here, and the catalogue at ${where} could not be read.` };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, fix: `The catalogue index at ${where} is not JSON.` };
  }
  const got = readCatalogue(doc);
  if (!got.ok) return { ok: false, fix: `The catalogue at ${where} could not be read: ${fixOf(got)}` };
  const entry: CatalogueEntry | undefined = got.value.entries.find((e) => e.kind === 'pack' && e.id === id);
  if (!entry) return { ok: false, fix: `${id} is in no packs/ folder here, and the catalogue at ${where} holds no plugin called ${id}.` };
  const chosen = entry.versions.find((v) => v.version === entry.latest);
  if (!chosen) return { ok: false, fix: `The catalogue lists ${id} at ${entry.latest} and holds no such version.` };
  const title = entry.title.replace(/\s+/gu, ' ').trim() || id;
  const named = `${title} ${chosen.version}`;
  const adapter = (chosen as unknown as Obj).adapter;
  if (!isObj(adapter) || typeof adapter.checksum !== 'string' || !/^[0-9a-f]{64}$/u.test(adapter.checksum))
    return { ok: false, fix: `${named} has no import adapter in the catalogue, so it cannot read a file for the import.` };
  const hash = adapter.checksum;

  /* THE VERSION, AS pack install HOLDS IT: its own signature over the index's fields, then the key's standing. */
  const signature: Signature | null = chosen.signature ?? null;
  if (signature !== null) {
    const own = await verifySignature(signature, entry.kind, entry.id, chosen.version, chosen.checksum);
    if (!own.ok) return { ok: false, fix: fixOf(own) };
  }
  const trusted = await trustVersion(entry, chosen.version, signature, got.value.keys, io.known ?? {});
  if (!trusted.ok) return { ok: false, fix: trusted.fix };
  /* AND THE ADAPTER, BY THE SAME KEY, whenever the version is signed. */
  const signed = adapter.signature as Signature | undefined;
  if (signature !== null || signed !== undefined) {
    if (signed === undefined) return { ok: false, fix: `${named} is signed and its import adapter is not, so the adapter is not the author's. Nothing was run.` };
    if (signature !== null && signed.key_id !== signature.key_id)
      return { ok: false, fix: `The import adapter of ${named} is signed by another key than the plugin, so it is not the author's. Nothing was run.` };
    const held = await verifySignature(signed, 'adapter', entry.id, chosen.version, hash);
    if (!held.ok) return { ok: false, fix: `The signature on the import adapter of ${named} does not verify, so it was changed after it was signed. Nothing was run.` };
  }

  /* A KEPT COPY WHOSE HASH IS STILL THE CATALOGUE'S IS USED AS IT IS, and nothing more is fetched. */
  const file = keptAdapter(io.home, entry.id, chosen.version);
  const value: Fetched = { id: entry.id, title, version: chosen.version, hash, file };
  if (existsSync(file)) {
    try {
      if (sha256(readFileSync(file, 'utf8')) === hash) return { ok: true, value };
    } catch {
      /* An unreadable copy is fetched again. */
    }
  }
  const path = adapterPath(entry.id, chosen.version);
  const body = await io.catalogue.read(path);
  if (body === null) return { ok: false, fix: `The import adapter of ${named} is listed in the catalogue at ${where} and missing from it.` };
  if (sha256(body) !== hash) return { ok: false, fix: `The import adapter of ${named} is not the one the catalogue published: its checksum differs. Nothing was kept or run.` };
  writeWhole(file, body);
  return { ok: true, value };
}

/** The yeses this machine keeps, by hash. A file that cannot be read is no yes. */
function allowed(home: string): Record<string, Obj> {
  try {
    const doc: unknown = JSON.parse(readFileSync(allowedPath(home), 'utf8'));
    return isObj(doc) && isObj(doc.allowed) ? (doc.allowed as Record<string, Obj>) : {};
  } catch {
    return {};
  }
}

/** The real terminal's question, on stderr and its own input, or `null` with no terminal. */
const terminal = (): Asker =>
  process.stdin.isTTY
    ? async (question) => {
        const lines = createInterface({ input: process.stdin, output: process.stderr });
        try {
          return /^\s*y(?:es)?\s*$/iu.test(await lines.question(`${question} [y/N] `));
        } catch {
          return false;
        } finally {
          lines.close();
        }
      }
    : null;

/**
 * Whether the adapter may run: a yes this machine kept for this file's hash, `--yes`, or a yes at the terminal now.
 * A yes is kept by the hash; with no terminal and no `--yes`, the sentence refusing, and nothing runs.
 */
export async function askToRun(entry: Pick<Fetched, 'id' | 'title' | 'version'>, hash: string, io: AskIo): Promise<{ ok: true } | { ok: false; fix: string }> {
  const kept = allowed(io.home);
  if (isObj(kept[hash])) return { ok: true };
  const named = `${entry.title} ${entry.version}`;
  let yes = io.yes === true;
  if (!yes) {
    const ask = io.ask === undefined ? terminal() : io.ask;
    if (ask === null)
      return { ok: false, fix: `The import adapter of ${named} is a program and nobody has said yes to running it here. Run the import once at a terminal, or add --yes in a script. Nothing was run.` };
    yes = await ask(`Run the import adapter of ${named}? It is a program and runs on this machine.`);
    if (!yes) return { ok: false, fix: `The import adapter of ${named} was not run, and nothing was read or sent.` };
  }
  writeWhole(allowedPath(io.home), `${JSON.stringify({ format: 1, allowed: { ...kept, [hash]: { id: entry.id, version: entry.version, at: new Date().toISOString() } } }, null, 2)}\n`);
  return { ok: true };
}
