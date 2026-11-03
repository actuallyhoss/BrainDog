/**
 * The Kennel on browse: the use cases and add-ons every host answers under `/api/kennel/v1/` (`@braindog/declare/kennel`),
 * the bundled catalogue from `packs/` first and the Kennel's entries after it.
 *
 * NOTHING HERE INSTALLS. It reads the index, fetches a version's file and holds it to the checksum and signature the index
 * gives, says whether this record holds that entry at that version, and what changed from the version installed. The
 * detail page hands what it verified to the record's plan, and the plan sheet installs it.
 *
 * TRUST ON FIRST USE IS KEPT IN THE RECORD: the key ids seen for each entry, on the person's pref `packs.known_keys`
 * (`known-keys.ts`), so every device reads the same trust; an older record falls back to `localStorage` under
 * `KNOWN_KEYS` as before. A page that reaches neither still draws; it only cannot say a key was seen before. The catalogue's own rotation and
 * revocation statements are verified here too: a new key named by a key already seen is trusted and kept, and a revoked
 * key is said as untrusted and nothing it signed is asked for.
 *
 * A HOST WITH NO KENNEL is not an error: browse draws the modules and built-in use cases alone, as before.
 *
 * PURE, AND THEREFORE TESTABLE: the fetcher is handed in.
 */

import type { CatalogueEntry, CatalogueFile, CatalogueIndex, CatalogueUpdate, CatalogueVersion, Changes, KeyStatements, KnownKeys, Signature, Trust } from '@braindog/declare/catalogue';

import { copy } from '../../lib/copy.ts';
import { keyName } from '../../lib/market/key-names.ts';
import { KENNEL_AT } from '../../lib/market/counts.ts';
import type { PackState } from '../../lib/record/packs.ts';
import { localKeys, readLocal, type KeySource, type KeyStore } from './known-keys.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Where the Kennel answers, from `lib/market/counts.ts`, which says why it is written out. */
export const CATALOGUE_BASE = KENNEL_AT;

/**
 * WHAT A STORE THAT DID NOT ANSWER SAYS. A refused or failed read was taken for a host with no store, so Browse
 * quietly listed the built-ins alone and an add-on's own page said "Nothing here by that name". A host with no store
 * answers 404 or the app's own page, and only that is read as none.
 */
export const STORE_UNREACHED = 'The store could not be reached, so only what comes with BrainDog is listed.';

/** The index this host serves, `null` when it serves none, or the sentence to say when one is there and does not read. */
export async function readHostCatalogue(fetcher: Fetcher): Promise<{ ok: true; index: CatalogueIndex | null } | { ok: false; fix: string; retry?: true }> {
  let res: Response;
  try {
    res = await fetcher(`${CATALOGUE_BASE}index.json`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
  } catch {
    return { ok: false, fix: STORE_UNREACHED, retry: true };
  }
  if (res.status === 404) return { ok: true, index: null };
  if (!res.ok) return { ok: false, fix: STORE_UNREACHED, retry: true };
  if (!(res.headers.get('content-type') ?? '').includes('json')) return { ok: true, index: null };
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

/**
 * A version's file, fetched by its kind and held to the checksum and signature the index gives, with the signature it
 * verified (`null` when unsigned), or the sentence and code to say instead.
 */
export async function catalogueText(
  fetcher: Fetcher,
  entry: CatalogueEntry,
  version: CatalogueVersion,
): Promise<{ ok: true; text: string; signature: Signature | null } | { ok: false; fix: string; code: string | null }> {
  const { catalogueFile, verifyVersion } = await import('@braindog/declare/catalogue');
  let text: string;
  try {
    const res = await fetcher(`${CATALOGUE_BASE}${catalogueFile(entry.id, version.version, entry.kind)}`, { credentials: 'same-origin' });
    if (!res.ok) return { ok: false, fix: `${entry.title} ${version.version} is listed in this catalogue and its file is missing.`, code: null };
    text = await res.text();
  } catch {
    return { ok: false, fix: `${entry.title} ${version.version} could not be fetched from this catalogue.`, code: null };
  }
  const held = await verifyVersion(entry, version, text);
  if (!held.ok) return { ok: false, fix: 'refusal' in held ? held.refusal.fix : 'This file does not read.', code: 'refusal' in held ? held.refusal.code : null };
  return { ok: true, text, signature: held.value };
}

export type Standing = { kind: 'install' } | { kind: 'update'; from: string } | { kind: 'current' } | { kind: 'ahead'; at: string } | { kind: 'off'; at: string | null };

/** Where this record stands against an entry's latest version: not here, older, the same, newer, or turned off. */
export async function standingOf(entry: CatalogueEntry, states: readonly PackState[]): Promise<Standing> {
  const { compareVersions, installedIdOf } = await import('@braindog/declare/catalogue');
  const held = states.find((s) => s.id === installedIdOf(entry));
  if (!held) return { kind: 'install' };
  if (held.disabled_at !== null) return { kind: 'off', at: held.version };
  if (held.version === null) return { kind: 'update', from: '' };
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
  const { changesBetween, heldToEntry, readCatalogueFile } = await import('@braindog/declare/catalogue');
  const [x, y] = await Promise.all([readCatalogueFile(a.text), readCatalogueFile(b.text)]);
  return x.ok && y.ok && heldToEntry(entry, was.version, x.value).ok && heldToEntry(entry, now.version, y.value).ok ? changesBetween(x.value, y.value) : null;
}

/**
 * The title a person reads for each entry, by the pack id a record holds it under, so /packs names an installed catalogue
 * add-on or use case as its catalogue does rather than by its id.
 */
export async function catalogueTitles(index: CatalogueIndex | null): Promise<Map<string, string>> {
  if (!index) return new Map();
  const { installedIdOf } = await import('@braindog/declare/catalogue');
  return new Map(index.entries.map((e) => [installedIdOf(e), e.title]));
}

/**
 * The line a person reads under each entry's name, by the pack id a record holds it under: what its catalogue says it is
 * for. An installed add-on that is not one of this build's modules read only its lists there, so Holdings was described
 * as "Holdings".
 */
export async function catalogueLines(index: CatalogueIndex | null): Promise<Map<string, string>> {
  if (!index) return new Map();
  const { installedIdOf } = await import('@braindog/declare/catalogue');
  return new Map(index.entries.filter((e) => e.summary.trim() !== '').map((e) => [installedIdOf(e), e.summary.trim()]));
}

/** Where this build's own catalogue is served, under the app's base, as `lib/start/offer.ts` reads it. */
export const SHIPPED_INDEX_AT = '/catalogue/index.json';

/**
 * THE CATALOGUE THIS BUILD SHIPS, for naming what is installed when the Kennel does not answer. Every pack in `packs/` is
 * in it, listed or not, so an add-on installed by id is named by its title ("HSBC Egypt alerts") and never by its id
 * ("Bank hsbc eg"), which is what a host with no Kennel, or a read the Kennel refused, drew. `null` when it cannot be read: the names then fall back as before.
 */
export async function readShippedCatalogue(fetcher: Fetcher): Promise<CatalogueIndex | null> {
  try {
    const res = await fetcher(SHIPPED_INDEX_AT, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
    const { readCatalogue } = await import('@braindog/declare/catalogue');
    const read = readCatalogue(await res.json());
    return read.ok ? read.value : null;
  } catch {
    return null;
  }
}

/* ── signatures and trust on first use ──────────────────────────────────── */

/* Where the keys are kept moved to `known-keys.ts`; these stay importable from here for the screens that read them. */
export { browserStore, KNOWN_KEYS, type KeySource, type KeyStore } from './known-keys.ts';

/** A version's signature said plainly: the key that signed it, or that nothing did. */
export const signedWords = (signature: Signature | null | undefined): string => (signature ? copy.catalogueSigned(signature.key_id) : copy.catalogueUnsigned);

/** Whether BrainDog made a listing: built in, or published by BrainDog to the store. */
export const byBrainDog = (l: { source: string; author: string; publisher?: { kind?: string; name?: string } | null | undefined }): boolean =>
  l.source === 'bundled' || l.publisher?.kind === 'braindog' || (l.publisher?.name ?? l.author).trim().toLowerCase() === 'braindog';

/**
 * A version's signature line, or `null` where there is nothing to say: BrainDog's own add-ons are not signed, and "Not
 * checked" under every one of their versions read as a warning about BrainDog's own work.
 */
export const signedLine = (signature: Signature | null | undefined, ours: boolean): string | null => (!signature && ours ? null : signedWords(signature));

/**
 * What one call out is, as a person says it: "Calls api.stripe.com every hour with your Stripe key". The kernel's line
 * (`CALLS OUT api.stripe.com · every 1h · key "stripe" to the host its Keychain entry opens`) is read for its cadence and
 * anything else it says, and the key is said by its name.
 */
export function callSaid(call: { host: string | null; line: string; key: string | null }): string {
  const m = /^CALLS OUT (.+?) · (.*)$/u.exec(call.line);
  const host = call.host ?? (m && m[1] !== 'no host declared' ? m[1]! : copy.arrangeCallNoHost.toLowerCase());
  const parts = (m?.[2] ?? '').split(' · ').flatMap((part): string[] => {
    if (part === '' || part === 'no key' || part.startsWith('grant "') || part.startsWith('key "')) return [];
    return [part.replace(/^every (\d+)([mhdw])\b/u, (_, n: string, unit: string) => copy.arrangeCallEvery(Number.parseInt(n, 10), unit as 'm' | 'h' | 'd' | 'w'))];
  });
  const key = call.key ?? /(?:grant|key) "([^"]+)"/u.exec(call.line)?.[1] ?? null;
  const how = parts.join(', ');
  /* BY THE NAME THE KEYCHAIN SHOWS IT BY (verify6, 2 Nov): Stripe's is "Stripe (read only)" there, so here it is your
     read-only Stripe key, where it said your Stripe key. */
  const shown = key && key !== 'none' ? keyName(key) : null;
  const readOnly = shown ? /^(.+) \(read only\)$/u.exec(shown) : null;
  const named = !shown ? null : readOnly ? `read-only ${readOnly[1]}` : `${shown.charAt(0).toUpperCase()}${shown.slice(1)}`;
  return `Calls ${host}${how ? ` ${how}` : ''}${named ? `${how.includes(',') ? ',' : ''} with your ${named} key` : ''}`;
}

/** The keys this browser has seen, or none when storage is out of reach or holds something else. */
export const loadKnownKeys = (store: KeyStore | null): Promise<KnownKeys> => readLocal(store);

/**
 * Where trust is read: a key source handed in (the record, `recordKeys`), or a browser's storage alone (`localKeys`), as
 * `/packs` still hands in, or nothing.
 */
export type Keys = KeyStore | KeySource | null;
const sourceOf = (keys: Keys): KeySource | null => (keys === null ? null : 'read' in keys && 'keep' in keys ? keys : localKeys(keys));

/**
 * Whether this person has seen the key that signed a version for its entry before (`subject`, from `trustSubject`), read
 * from `keys` (the record's, or a browser's alone) with the catalogue's key statements (`index.keys`), each verified here
 * before it counts, and the keys that signed the entry's earlier versions (`keysSignedBefore`), so a version that lost its
 * signature is said loudly.
 */
export async function trustFor(keys: Keys, subject: string, signature: Signature | null | undefined, statements?: KeyStatements, signedBefore: readonly string[] = []): Promise<Trust> {
  const { trustOf, verifiedStatements } = await import('@braindog/declare/catalogue');
  const known = (await sourceOf(keys)?.read().catch(() => ({}))) ?? {};
  return trustOf(known, subject, signature, await verifiedStatements(statements), signedBefore);
}

/** Trust for an entry's version, with its subject and earlier signatures read from the entry itself. */
export async function trustForEntry(keys: Keys, entry: CatalogueEntry, version: string, signature: Signature | null | undefined, statements?: KeyStatements): Promise<Trust> {
  const { keysSignedBefore, trustSubject } = await import('@braindog/declare/catalogue');
  return trustFor(keys, trustSubject(entry), signature, statements, await keysSignedBefore(entry, version));
}

/** Trust said as a sentence, loud when the key is not the one seen before. */
export function trustWords(trust: Trust, author: string): { text: string; loud: boolean } {
  switch (trust.kind) {
    case 'unsigned':
      return { text: copy.catalogueTrustUnsigned, loud: false };
    case 'stripped':
      return { text: copy.catalogueTrustStripped(author, trust.before), loud: true };
    case 'first':
      return { text: copy.catalogueTrustFirst(author), loud: false };
    case 'known':
      return { text: copy.catalogueTrustKnown(author), loud: false };
    case 'changed':
      return { text: copy.catalogueTrustChanged(author, trust.before), loud: true };
    case 'rotated':
      return { text: copy.catalogueTrustRotated(author, trust.from), loud: false };
    case 'revoked':
      return { text: copy.catalogueTrustRevoked(author, trust.reason), loud: true };
  }
}

/**
 * The one line under an add-on's name, by its publisher's name and never a key id: signed by the key seen before, the
 * first add-on seen from them, or a different key. A rotation their own key signed is the key seen before. The rest
 * say why nothing is offered, or that nobody signed.
 */
export function trustLine(trust: Trust, publisher: string): { text: string; loud: boolean } {
  switch (trust.kind) {
    case 'known':
    case 'rotated':
      return { text: `Signed by ${publisher}, as before`, loud: false };
    case 'first':
      return { text: `First add-on you have seen from ${publisher}`, loud: false };
    case 'changed':
      return { text: 'Signed by a different key than before', loud: true };
    case 'revoked':
      return { text: `${publisher} withdrew the key that signed this version, so it is not offered`, loud: true };
    case 'stripped':
      return { text: `This version is not signed, and earlier ones from ${publisher} were, so it is not offered`, loud: true };
    case 'unsigned':
      return { text: 'Nobody signed this version', loud: false };
  }
}

/** The trust line a listing page draws, or `null`: BrainDog's own unsigned add-ons say who made them and no more. */
export const trustSaid = (trust: Trust, publisher: string, ours: boolean): { text: string; loud: boolean } | null =>
  ours && trust.kind === 'unsigned' ? null : trustLine(trust, publisher);

/**
 * Whether nothing a version's key signed is offered to install: a revoked key, a signature lost, or a key other than the
 * one seen before until the person presses Trust this key (`trustThisKey`).
 */
export const withheld = (trust: Trust | null): boolean => trust !== null && (trust.kind === 'revoked' || trust.kind === 'stripped' || trust.kind === 'changed');

/**
 * The key kept once a person asks for a version: on first use, or a key one already seen named as its successor. A known
 * key needs nothing, and a changed or revoked key is never written over the one seen before, so it is said loudly again
 * next time. Answers whether anything was kept.
 */
export async function keepFirstKey(keys: Keys, subject: string, trust: Trust): Promise<boolean> {
  const { keyToKeep } = await import('@braindog/declare/catalogue');
  const keep = keyToKeep(trust);
  return keep === null ? false : keepKey(keys, subject, keep);
}

/**
 * The person's own press on a key that changed: the new key is kept beside the ones seen before, so what it signs is
 * offered from then on. Only a changed key is taken this way; a revoked one never is.
 */
export async function trustThisKey(keys: Keys, subject: string, trust: Trust): Promise<boolean> {
  return trust.kind === 'changed' ? keepKey(keys, subject, trust.key_id) : false;
}

async function keepKey(keys: Keys, subject: string, keyId: string): Promise<boolean> {
  const source = sourceOf(keys);
  if (!source) return false;
  const { rememberKey } = await import('@braindog/declare/catalogue');
  try {
    return await source.keep(rememberKey(await source.read(), subject, keyId));
  } catch {
    return false;
  }
}

/* ── asking on Decide ───────────────────────────────────────────────────── */

export type CatalogueProposal = {
  question: string;
  body_kind: 'pack';
  /** A GitHub file is asked for by its pinned address, `{ source: { kind: "git", ref } }`, and the record reads it again. */
  body: { file: string } | { install: string; doc: Record<string, unknown> } | { source: { kind: 'git'; ref: string } };
};

/**
 * The proposal that asks for a version on Decide: a use case carries its file\'s text, an add-on the id the record holds it
 * under and its document. `from` is the version installed, for an update.
 */
export async function proposalFor(entry: CatalogueEntry, version: string, from: string | null, text: string, file: CatalogueFile, signature: Signature | null): Promise<CatalogueProposal> {
  const { installedIdOf } = await import('@braindog/declare/catalogue');
  const question = copy.catalogueQuestion(entry.title, version, from, signature?.key_id ?? null);
  return file.kind === 'usecase' ? { question, body_kind: 'pack', body: { file: text } } : { question, body_kind: 'pack', body: { install: installedIdOf(entry), doc: file.file.doc } };
}

type Call = (name: string, args: Record<string, unknown>) => Promise<{ ok: true; value: unknown } | { ok: false; refusal?: { fix: string; code?: string } }>;

/** A proposal filed, answering the id Decide opens it at (empty when the record names none), or the record\'s sentence. */
export async function fileProposal(call: Call, proposal: CatalogueProposal): Promise<{ ok: true; id: string } | { ok: false; fix: string; code: string | null }> {
  let out: Awaited<ReturnType<Call>>;
  try {
    out = await call('propose', proposal as unknown as Record<string, unknown>);
  } catch {
    return { ok: false, fix: copy.recordNotReached, code: null };
  }
  if (!out.ok) return { ok: false, fix: out.refusal?.fix ?? copy.recordNotReached, code: out.refusal?.code ?? null };
  const id = (out.value as { id?: unknown } | null)?.id;
  return { ok: true, id: typeof id === 'string' ? id : typeof id === 'number' ? String(id) : '' };
}

/**
 * A version fetched, verified and read, then asked for on Decide. Nothing is filed for a file that does not verify or read.
 * Answers the proposal id and the signature it verified.
 */
export async function askForVersion(
  fetcher: Fetcher,
  call: Call,
  entry: CatalogueEntry,
  version: CatalogueVersion,
  from: string | null,
): Promise<{ ok: true; id: string; signature: Signature | null } | { ok: false; fix: string; code: string | null }> {
  const got = await catalogueText(fetcher, entry, version);
  if (!got.ok) return got;
  const { heldToEntry, keysSignedBefore, readCatalogueFile, strippedNotice } = await import('@braindog/declare/catalogue');
  /* AN UNSIGNED VERSION AFTER SIGNED ONES IS NEVER ASKED FOR. */
  if (got.signature === null) {
    const before = await keysSignedBefore(entry, version.version);
    if (before.length > 0) return { ok: false, fix: strippedNotice(entry.title, version.version, before), code: 'SIGNATURE_INVALID' };
  }
  const file = await readCatalogueFile(got.text, { kind: 'url' });
  if (!file.ok) return { ok: false, fix: 'refusal' in file ? file.refusal.fix : `${entry.title} ${version.version} does not read.`, code: 'refusal' in file ? file.refusal.code : null };
  /* THE FILE IS THE ENTRY IT IS LISTED UNDER, by its own id and version. */
  const matches = heldToEntry(entry, version.version, file.value);
  if (!matches.ok) return { ok: false, fix: 'refusal' in matches ? matches.refusal.fix : `${entry.title} ${version.version} does not read.`, code: 'refusal' in matches ? matches.refusal.code : null };
  const filed = await fileProposal(call, await proposalFor(entry, version.version, from, got.text, file.value, got.signature));
  return filed.ok ? { ...filed, signature: got.signature } : filed;
}

/* ── updates on /packs ──────────────────────────────────────────────────── */

/** A catalogue path read through the host, `null` when it is not there. */
export const fetchReader =
  (fetcher: Fetcher) =>
  async (path: string): Promise<string | null> => {
    try {
      const res = await fetcher(`${CATALOGUE_BASE}${path}`, { credentials: 'same-origin' });
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  };

/**
 * THE INDEX UPDATES ARE LOOKED FOR IN: the Kennel's public one, with every entry the catalogue this build ships holds for
 * an add-on this record has installed and the public index leaves out. An add-on held unlisted or private (installed by
 * its link, never listed) is missing from the public index, so its later versions never reached the Updates card while
 * the record's own check, which reads the whole index, said one had arrived. Its files are served all the same.
 */
export async function indexForUpdates(index: CatalogueIndex, shipped: CatalogueIndex | null, states: readonly PackState[]): Promise<CatalogueIndex> {
  if (!shipped) return index;
  const { installedIdOf } = await import('@braindog/declare/catalogue');
  const held = new Set(states.map((s) => s.id));
  const have = new Set(index.entries.map((e) => `${e.kind}:${e.id}`));
  const missing = shipped.entries.filter((e) => !have.has(`${e.kind}:${e.id}`) && held.has(installedIdOf(e)));
  return missing.length === 0 ? index : { ...index, entries: [...index.entries, ...missing] };
}

/** Every later version of what this record holds, verified and read, and the sentences for any that were not. */
export async function updatesFor(fetcher: Fetcher, index: CatalogueIndex, states: readonly PackState[]): Promise<{ updates: CatalogueUpdate[]; refused: string[] }> {
  const { catalogueUpdates } = await import('@braindog/declare/catalogue');
  const out = await catalogueUpdates(index, states, fetchReader(fetcher));
  return { updates: out.updates, refused: out.refused.map((r) => r.fix) };
}

/** The proposal for an update already fetched and verified by `updatesFor`. */
export const updateProposal = (u: CatalogueUpdate): Promise<CatalogueProposal> => proposalFor(u.entry, u.to.version, u.from, u.text, u.file, u.signature);

