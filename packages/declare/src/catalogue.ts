/**
 * A catalogue of shared use cases and add-ons: the local, file-shaped seed of the add-on index
 * (`loop/research-marketplace.md` §2, S12, and §3's `publish`, `search`, `version` and `diff`).
 *
 * A CATALOGUE IS A FOLDER OF FILES, never a service. `index.json` names every entry and its versions, and each version is
 * the file itself, kept byte for byte as it was published: a use case at `usecases/<id>/<version>.usecase.json`, an add-on
 * at `packs/<id>/<version>.pack.json`. A self-host serves one folder read-only; the hosted app serves one bundled with its
 * shell; a person publishes into one with the command line. Nothing here fetches or writes: the caller hands in text and a
 * reader, and gets back the index to write.
 *
 * EVERY FILE GOES THROUGH A DOOR before it is listed: a use case through `readShared`, the one the record, the app and the
 * command line read a shared file through, and an add-on through `readPackFile`, the same checks said for a pack. So a
 * catalogue cannot list what a record would refuse. Installing from a catalogue is still a plan and an approval on the
 * record: this module only says what a file is, what it can reach, and what changed between two versions of it.
 *
 * VERSIONS ARE IMMUTABLE AND THEIR BUMP IS COMPUTED. A version already published is never replaced, a version is later
 * than the one before it, and a file that takes a list or a page away cannot be published as a minor or a patch.
 *
 * TRUST IS WHAT THE FILE DECLARES, NOT WHAT ITS AUTHOR SAYS: the modules it installs first, the lists, pages and rules it
 * adds, the example rows, the skills it suggests, every host it would call out to and the key it would send by label. A
 * version may carry its author's signature (`signing.ts`); one that does is verified on every fetch, and a reader says
 * which key signed it, or that nothing did.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { digest, jcs, validateDeclaration, type Json } from '@braindog/kernel';

import { credentialKey, credentialValue, NESTED_MOST, nestedPast } from './credentials.ts';
import { egressOf, FIRST_PARTY_LISTS, normalise, type Pack, type PackSource } from './index.ts';
import { kindUnknownSentence, readShared, SHARED_MOST_BYTES, type Shared } from './shared.ts';
import { MODULES } from './usecase.ts';
import {
  isRevocation,
  isRotation,
  isSignature,
  revocationOf,
  rotatedFrom,
  signVersion,
  verifiedStatements,
  verifyRevocation,
  verifyRotation,
  verifySignature,
  type AuthorKey,
  type KeyRevocation,
  type KeyRotation,
  type KeyStatements,
  type Signature,
} from './signing.ts';

export {
  AUTHOR_KEY_FORMAT,
  keyIdOf,
  keyToKeep,
  noStatements,
  REVOCATION_FORMAT,
  revocationOf,
  revokeKey,
  ROTATION_FORMAT,
  rotatedFrom,
  rotateKey,
  verifiedStatements,
  verifyRevocation,
  verifyRotation,
  type KeyRevocation,
  type KeyRotation,
  type KeyStatements,
  newAuthorKey,
  readAuthorKey,
  readKnownKeys,
  rememberKey,
  signedText,
  signVersion,
  trustOf,
  verifySignature,
  type AuthorKey,
  type KnownKeys,
  type Signature,
  type Trust,
} from './signing.ts';

export const CATALOGUE_FORMAT = 1;
export const CATALOGUE_INDEX = 'index.json';

/** The most an add-on file may weigh, as a shared use case may. */
export const PACK_FILE_MOST_BYTES = SHARED_MOST_BYTES;

const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/u;

export type EntryKind = 'usecase' | 'pack';

/** Where a version's file sits inside a catalogue. Ids and versions are checked first, so the path never leaves it. */
export const catalogueFile = (id: string, version: string, kind: EntryKind = 'usecase'): string =>
  kind === 'pack' ? `packs/${id}/${version}.pack.json` : `usecases/${id}/${version}.usecase.json`;

/** The pack id a record holds an entry under: a use case's is `usecase-<id>`, an add-on's is its own. */
export const installedIdOf = (entry: { kind: EntryKind; id: string }): string => (entry.kind === 'usecase' ? `usecase-${entry.id}` : entry.id);

/** What a version can reach, read from its declarations. */
export type Reach = {
  modules: string[];
  lists: string[];
  pages: string[];
  rules: string[];
  examples: number;
  skills: string[];
  /** Every scheduled action that would leave the record, as the plan says it. */
  calls_out: { host: string | null; line: string; key: string | null }[];
};

export type Bump = 'major' | 'minor' | 'patch';

export type CatalogueVersion = {
  version: string;
  /** SHA-256 of the file's canonical JSON, so a copy that differs in spacing is the same file and one changed byte is not. */
  checksum: string;
  bytes: number;
  published_at: string;
  /** The bump computed against the version before it, or `null` for the first. */
  bump: Bump | null;
  reach: Reach;
  /** Its author's signature over the kind, id, version and checksum, when they signed it. */
  signature?: Signature;
};

export type CatalogueEntry = {
  kind: EntryKind;
  id: string;
  title: string;
  summary: string;
  author: string;
  license: string;
  /** Who a use case is for; an add-on says `addon`. */
  audience: string;
  latest: string;
  /** Newest first. */
  versions: CatalogueVersion[];
};

export type CatalogueIndex = {
  format: typeof CATALOGUE_FORMAT;
  name: string;
  entries: CatalogueEntry[];
  /** Authors' rotation and revocation statements (`signing.ts`), each verified wherever it is read. */
  keys?: KeyStatements;
};

export const emptyCatalogue = (name: string): CatalogueIndex => ({ format: CATALOGUE_FORMAT, name, entries: [] });

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/* ── versions ───────────────────────────────────────────────────────────── */

const partsOf = (v: string): [number, number, number] | null => {
  const m = VERSION.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Negative when `a` is earlier, positive when later, 0 when equal or either is not a version. */
export function compareVersions(a: string, b: string): number {
  const x = partsOf(a);
  const y = partsOf(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  return 0;
}

/** How far `to` moves from `from` as its numbers say: the bump its author chose. */
export function declaredBump(from: string, to: string): Bump | null {
  const x = partsOf(from);
  const y = partsOf(to);
  if (!x || !y || compareVersions(to, from) <= 0) return null;
  return y[0] > x[0] ? 'major' : y[1] > x[1] ? 'minor' : 'patch';
}

const RANK: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };

/* ── an add-on as a file ────────────────────────────────────────────────── */

/** An add-on file read through its door: the pack normalised, the document to plan, and the words a card shows. */
export type PackFile = { pack: Pack; doc: Record<string, unknown>; title: string; bytes: number };

/** Ids an add-on from a catalogue may not take: BrainDog's own modules, and the names use cases install under. */
const reservedId = (id: string): boolean => (MODULES as readonly string[]).includes(id) || id.startsWith('usecase-') || id.startsWith('braindog');

/**
 * An add-on file from anybody, checked all the way through, in the order `readShared` checks a use case: the size before
 * anything is parsed, then JSON, then every key and value for a credential, then the pack through `normalise`, then each
 * declaration's block kinds. An add-on may not take a first-party module's id or declare one of its lists.
 */
export async function readPackFile(input: unknown, source: PackSource = { kind: 'paste' }): Promise<Result<PackFile>> {
  let text: string;
  if (typeof input === 'string') text = input;
  else {
    try {
      text = JSON.stringify(input) ?? '';
    } catch {
      return no('PACK_MALFORMED', 'This is not an add-on file: it cannot be written down as JSON.', { at: 'file' });
    }
  }
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > PACK_FILE_MOST_BYTES)
    return no('PACK_OVER_CAP', `This file is ${Math.ceil(bytes / 1024)} KB, and an add-on is at most ${PACK_FILE_MOST_BYTES / 1024} KB. Ship fewer example rows, or split it.`, { at: 'file' });
  let doc: unknown = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(text);
    } catch {
      return no('PACK_MALFORMED', 'This is not an add-on file: it is not JSON. An add-on is shared as a .pack.json file.', { at: 'file' });
    }
  }
  if (!isMap(doc) || typeof doc.pack !== 'string')
    return no('PACK_MALFORMED', isMap(doc) && typeof doc.usecase === 'string' ? 'This is a use-case file, not an add-on. Publish it as a use case.' : 'This is not an add-on file: it has no pack in it.', { at: 'pack' });
  if (nestedPast(doc as Json)) return no('PACK_MALFORMED', `This is not an add-on file: it nests deeper than ${NESTED_MOST} levels, and no add-on does.`, { at: 'file' });
  const key = credentialKey(doc as Json);
  if (key) return no('SECRET_IN_PACK', `This file carries a ${key}. An add-on never carries a credential; take it out and publish it again.`, { at: key });
  const shaped = credentialValue(doc as Json);
  if (shaped) return no('SECRET_IN_PACK', `This file holds what looks like a credential at ${shaped}. An add-on never carries one; take it out and publish it again.`, { at: shaped });
  if (reservedId(doc.pack))
    return no('PROVIDES_CONFLICT', `${doc.pack} is a name BrainDog keeps for its own modules and use cases. Give this add-on another id.`, { at: 'pack' });
  const pack = await normalise(doc, source);
  if (!pack.ok) return pack as Result<PackFile>;
  for (const decl of pack.value.declarations) {
    const list = decl.kind === 'register' ? decl.id.slice('register.'.length) : null;
    const owner = list === null ? undefined : FIRST_PARTY_LISTS.get(list);
    if (owner !== undefined)
      return no('PROVIDES_CONFLICT', `This add-on declares a list called ${list}, which belongs to BrainDog's ${owner} module. Name the list something else.`, { at: decl.id });
    const fault = validateDeclaration({ id: decl.id, kind: decl.kind, body: decl.body });
    if (fault?.code === 'KIND_UNKNOWN') return { ok: false, refusal: { ...fault, fix: kindUnknownSentence(fault.fix).replace('This setup', 'This add-on'), at: `${decl.id}${fault.at ? `.${fault.at}` : ''}` } };
  }
  const title = typeof doc.title === 'string' && doc.title.trim() !== '' ? doc.title.trim().slice(0, 80) : doc.pack;
  return ok({ pack: pack.value, doc, title, bytes });
}

/** Either kind of file a catalogue lists, read. */
export type CatalogueFile = { kind: 'usecase'; shared: Shared } | { kind: 'pack'; file: PackFile };

/** A file read through the door its shape asks for: a use case when it names one, an add-on otherwise. */
export async function readCatalogueFile(text: string, source: PackSource = { kind: 'paste' }): Promise<Result<CatalogueFile>> {
  let usecase = false;
  try {
    const doc = JSON.parse(text) as unknown;
    usecase = isMap(doc) && typeof doc.usecase === 'string';
  } catch {
    /* Either door says it is not JSON. */
  }
  if (usecase) {
    const shared = await readShared(text, source);
    return shared.ok ? ok({ kind: 'usecase', shared: shared.value }) : (shared as Result<CatalogueFile>);
  }
  const file = await readPackFile(text, source);
  return file.ok ? ok({ kind: 'pack', file: file.value }) : (file as Result<CatalogueFile>);
}

/* ── what a file is ─────────────────────────────────────────────────────── */

/** The checksum a catalogue keeps for a file: SHA-256 over its canonical JSON. */
export async function fileChecksum(text: string): Promise<string> {
  return digest(jcs(JSON.parse(text) as Json));
}

const titleOf = (decl: Pack['declarations'][number]): string => {
  const b = decl.body as Record<string, unknown>;
  return str(b.name) || str(b.title) || decl.id.slice(decl.id.indexOf('.') + 1);
};

/** The one shape both kinds are compared in. */
type Subject = { id: string; version: string; pack: Pack | null; modules: readonly string[]; skills: string[]; words: Json };

const subjectOf = (x: Shared | PackFile | CatalogueFile): Subject => {
  const s = 'kind' in x ? (x.kind === 'usecase' ? x.shared : x.file) : x;
  if ('usecase' in s) {
    const { version: _v, pack: _p, ...words } = s.usecase as unknown as Record<string, unknown>;
    return { id: s.usecase.usecase, version: s.usecase.version, pack: s.pack, modules: s.usecase.modules, skills: s.usecase.skills.map((k) => k.name), words: words as Json };
  }
  const { version: _v, provides: _p, requires: _r, ...words } = s.pack.manifest as unknown as Record<string, unknown>;
  return { id: s.pack.manifest.pack, version: s.pack.manifest.version, pack: s.pack, modules: Object.keys(s.pack.manifest.requires.packs), skills: [], words: { ...words, title: s.title } as Json };
};

/** What a shared use case or an add-on can reach, read from what it declares. */
export function reachOf(file: Shared | PackFile | CatalogueFile): Reach {
  const s = subjectOf(file);
  const decls = s.pack?.declarations ?? [];
  const of = (kind: string) => decls.filter((d) => d.kind === kind).map(titleOf);
  return {
    modules: [...s.modules],
    lists: of('register'),
    pages: of('page'),
    rules: of('rule'),
    examples: s.pack?.seeds.length ?? 0,
    skills: s.skills,
    calls_out: decls.flatMap((d) => {
      const e = egressOf(d);
      return e ? [{ host: e.host, line: e.line, key: e.key }] : [];
    }),
  };
}

/** One declaration named in a change: its kind, its id and the words a person reads for it. */
export type Named = { kind: string; id: string; title: string };

export type Changes = {
  from: string | null;
  to: string;
  /** The bump these changes need at least. */
  bump: Bump;
  added: Named[];
  removed: Named[];
  changed: Named[];
  modules: { added: string[]; removed: string[] };
  hosts: { added: string[]; removed: string[] };
  examples: { from: number; to: number };
  /** Words, voice, labels, summary or skills differ, with no declaration changed. */
  words: boolean;
};

const hostsOf = (s: Shared | PackFile | CatalogueFile | null): string[] => [...new Set((s ? reachOf(s).calls_out : []).map((c) => c.host ?? '').filter((h) => h !== ''))];
const minus = <T>(a: readonly T[], b: readonly T[]): T[] => a.filter((x) => !b.includes(x));

/** A field a register keeps from one version to the next with its type, so a removed or retyped one is known. */
const fieldsOf = (decl: Pack['declarations'][number] | undefined): Map<string, string> => {
  const fields = decl && Array.isArray((decl.body as Record<string, unknown>).fields) ? ((decl.body as Record<string, unknown>).fields as unknown[]) : [];
  return new Map(fields.filter(isMap).map((f) => [str(f.id), `${str(f.type)}:${str(f.of)}`]));
};

/**
 * What changed from one version of a use case or an add-on to the next, declaration by declaration, and the least bump that
 * says it.
 *
 * MAJOR takes something away a record may hold rows or links to: a list, a page, a module, or a field of a list (or its
 * type). MINOR adds: a declaration, a module, or a host it calls out to. PATCH is everything else: a changed page, rule or
 * word. A new host is never a patch, because it is a new place a record's data could go.
 */
export function changesBetween<T extends Shared | PackFile | CatalogueFile>(from: T | null, to: T): Changes {
  const a = from === null ? null : subjectOf(from);
  const b = subjectOf(to);
  const before = new Map((a?.pack?.declarations ?? []).map((d) => [d.id, d]));
  const after = new Map((b.pack?.declarations ?? []).map((d) => [d.id, d]));
  const named = (d: Pack['declarations'][number]): Named => ({ kind: d.kind, id: d.id, title: titleOf(d) });
  const added = [...after.values()].filter((d) => !before.has(d.id)).map(named);
  const removed = [...before.values()].filter((d) => !after.has(d.id)).map(named);
  const changed = [...after.values()].filter((d) => before.has(d.id) && before.get(d.id)?.canonical !== d.canonical).map(named);
  const modules = { added: minus(b.modules, a?.modules ?? []), removed: minus(a?.modules ?? [], b.modules) };
  const hosts = { added: minus(hostsOf(to), hostsOf(from)), removed: minus(hostsOf(from), hostsOf(to)) };
  const narrowed = changed.some((c) => {
    if (c.kind !== 'register') return false;
    const was = fieldsOf(before.get(c.id));
    const now = fieldsOf(after.get(c.id));
    return [...was].some(([id, type]) => now.get(id) !== type);
  });
  const bump: Bump =
    removed.some((r) => r.kind === 'register' || r.kind === 'page') || modules.removed.length > 0 || narrowed
      ? 'major'
      : added.length > 0 || removed.length > 0 || modules.added.length > 0 || hosts.added.length > 0
        ? 'minor'
        : 'patch';
  return {
    from: a?.version ?? null,
    to: b.version,
    bump,
    added,
    removed,
    changed,
    modules,
    hosts,
    examples: { from: a?.pack?.seeds.length ?? 0, to: b.pack?.seeds.length ?? 0 },
    words: a !== null && jcs(a.words) !== jcs(b.words),
  };
}

/** Whether a set of changes says nothing at all: the same file under another version. */
export const unchanged = (c: Changes): boolean =>
  c.added.length + c.removed.length + c.changed.length + c.modules.added.length + c.modules.removed.length + c.hosts.added.length + c.hosts.removed.length === 0 &&
  c.examples.from === c.examples.to &&
  !c.words;

/* ── the index ──────────────────────────────────────────────────────────── */

/** An index read from anywhere, checked: its format, and every id and version safe to build a path from. */
export function readCatalogue(doc: unknown): Result<CatalogueIndex> {
  const bad = (at: string, fix: string): Result<CatalogueIndex> => no('PACK_MALFORMED', fix, { at }) as Result<CatalogueIndex>;
  if (!isMap(doc) || doc.format !== CATALOGUE_FORMAT || !Array.isArray(doc.entries))
    return bad('index', `This is not a catalogue this version of BrainDog reads: it needs format ${CATALOGUE_FORMAT} and a list of entries.`);
  const entries: CatalogueEntry[] = [];
  for (const [i, e] of doc.entries.entries()) {
    if (!isMap(e) || (e.kind !== 'usecase' && e.kind !== 'pack') || !ID.test(str(e.id)) || !Array.isArray(e.versions) || e.versions.length === 0)
      return bad(`entries[${i}]`, `Entry ${i + 1} of this catalogue is not a use case or an add-on with an id and at least one version.`);
    const versions: CatalogueVersion[] = [];
    for (const v of e.versions) {
      if (!isMap(v) || !VERSION.test(str(v.version)) || !/^[0-9a-f]{64}$/u.test(str(v.checksum)) || !isMap(v.reach))
        return bad(`entries[${i}].versions`, `A version of ${str(e.id)} in this catalogue has no version number or checksum.`);
      if (v.signature !== undefined && !isSignature(v.signature))
        return bad(`entries[${i}].versions`, `A version of ${str(e.id)} in this catalogue carries a signature that is not one.`);
      versions.push(v as unknown as CatalogueVersion);
    }
    versions.sort((a, b) => compareVersions(b.version, a.version));
    entries.push({ ...(e as unknown as CatalogueEntry), versions, latest: (versions[0] as CatalogueVersion).version });
  }
  if (doc.keys !== undefined) {
    const k = doc.keys;
    if (!isMap(k) || !Array.isArray(k.rotations) || !Array.isArray(k.revocations) || !k.rotations.every(isRotation) || !k.revocations.every(isRevocation))
      return bad('keys', 'The key statements in this catalogue are not rotations and revocations this version of BrainDog reads.');
    return ok({ format: CATALOGUE_FORMAT, name: str(doc.name), entries, keys: { rotations: k.rotations, revocations: k.revocations } });
  }
  return ok({ format: CATALOGUE_FORMAT, name: str(doc.name), entries });
}

/**
 * A rotation or revocation added to a catalogue's index, verified first: a rotation signed by the key it leaves, a revocation
 * by the key it revokes. The same statement twice is refused, and nothing else in the index changes.
 */
export async function addKeyStatement(index: CatalogueIndex, statement: KeyRotation | KeyRevocation): Promise<Result<CatalogueIndex>> {
  const keys = index.keys ?? { rotations: [], revocations: [] };
  if (isRotation(statement)) {
    if (!(await verifyRotation(statement))) return no('SIGNATURE_INVALID', 'This rotation is not signed by the key it moves from, so it was not added.', { at: 'keys' });
    if (keys.rotations.some((r) => r.from_key_id === statement.from_key_id && r.to_key_id === statement.to_key_id))
      return no('ALREADY_KNOWN', `This catalogue already says key ${statement.from_key_id} moved to ${statement.to_key_id}.`, { at: 'keys' });
    return ok({ ...index, keys: { ...keys, rotations: [...keys.rotations, statement] } });
  }
  if (isRevocation(statement)) {
    if (!(await verifyRevocation(statement))) return no('SIGNATURE_INVALID', 'This revocation is not signed by the key it revokes, so it was not added.', { at: 'keys' });
    if (keys.revocations.some((r) => r.key_id === statement.key_id)) return no('ALREADY_KNOWN', `Key ${statement.key_id} is already revoked in this catalogue.`, { at: 'keys' });
    return ok({ ...index, keys: { ...keys, revocations: [...keys.revocations, statement] } });
  }
  return no('VALUE_MALFORMED', 'This is not a key rotation or revocation.', { at: 'keys' });
}

/** A version whose key its author revoked, said in the one sentence every reader shows, or `null` when it is not. */
export const revokedNotice = (statements: KeyStatements, title: string, version: string, signature: Signature | null | undefined): string | null => {
  const revoked = signature ? revocationOf(statements, signature.key_id) : null;
  return revoked ? `${title} ${version} is signed by key ${revoked.key_id}, which its author revoked, so it is not trusted. Their reason: ${revoked.reason}` : null;
};

/** The entries a search matches, best first: by id, title, summary, author, and the lists and pages the latest adds. */
export function searchCatalogue(index: CatalogueIndex, query: string, kind?: EntryKind): CatalogueEntry[] {
  const pool = kind === undefined ? index.entries : index.entries.filter((e) => e.kind === kind);
  const words = query.toLowerCase().split(/\s+/u).filter((w) => w !== '');
  if (words.length === 0) return [...pool];
  const scored = pool.map((e) => {
    const reach = e.versions[0]?.reach;
    const head = `${e.id} ${e.title}`.toLowerCase();
    const body = [e.summary, e.author, ...(reach?.lists ?? []), ...(reach?.pages ?? [])].join(' ').toLowerCase();
    const score = words.reduce((n, w) => n + (head.includes(w) ? 2 : body.includes(w) ? 1 : -100), 0);
    return { e, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id)).map((s) => s.e);
}

/** A file fetched from a catalogue, held to the checksum the index gives for it. */
export async function verifyFile(version: Pick<CatalogueVersion, 'version' | 'checksum'>, text: string): Promise<Result<true>> {
  let sum: string;
  try {
    sum = await fileChecksum(text);
  } catch {
    return no('PACK_MALFORMED', `The file for ${version.version} is not JSON, so it was not read.`, { at: 'file' });
  }
  return sum === version.checksum
    ? ok(true)
    : no('CHECKSUM_MISMATCH', `The file for ${version.version} is not the one this catalogue published: its checksum differs. Nothing was installed.`, { at: 'file' });
}

/**
 * A fetched file held to everything the index says about it: its checksum, and its author's signature when it has one.
 * Answers the signature it verified, or `null` for an unsigned version.
 */
export async function verifyVersion(entry: Pick<CatalogueEntry, 'kind' | 'id'>, version: CatalogueVersion, text: string): Promise<Result<Signature | null>> {
  const held = await verifyFile(version, text);
  if (!held.ok) return held as Result<Signature | null>;
  if (version.signature === undefined) return ok(null);
  const signed = await verifySignature(version.signature, entry.kind, entry.id, version.version, version.checksum);
  return signed.ok ? ok(version.signature) : (signed as Result<Signature | null>);
}

export type Published = { index: CatalogueIndex; path: string; entry: CatalogueEntry; version: CatalogueVersion; changes: Changes };

/**
 * A file added to a catalogue: the index to write, and the path to write the file's text at, unchanged.
 *
 * `read` answers a file already in the catalogue by its path, or `null`, so the version before can be compared. `key` signs
 * the version; once an entry has a signed version, every later one must be signed by the same key.
 */
export async function publishTo(
  index: CatalogueIndex,
  text: string,
  read: (path: string) => string | null | Promise<string | null>,
  now: Date = new Date(),
  key?: AuthorKey,
): Promise<Result<Published>> {
  const got = await readCatalogueFile(text, { kind: 'local' });
  if (!got.ok) return got as Result<Published>;
  const file = got.value;
  const kind = file.kind;
  const s = subjectOf(file);
  const title = file.kind === 'usecase' ? file.shared.usecase.title : file.file.title;
  const noun = kind === 'usecase' ? 'a use case' : 'an add-on';
  if (!ID.test(s.id)) return no('PACK_MALFORMED', `A catalogue lists ${noun} by an id of lower-case letters, digits and dashes, and ${s.id} is not one.`, { at: kind });
  if (!VERSION.test(s.version)) return no('PACK_MALFORMED', `A catalogue lists versions as three numbers, as in 1.0.0, and ${s.version} is not one.`, { at: 'version' });

  const checksum = await fileChecksum(text);
  const was = index.entries.find((e) => e.id === s.id && e.kind === kind) ?? null;
  const same = was?.versions.find((v) => v.version === s.version);
  if (same)
    return no(
      'ALREADY_KNOWN',
      same.checksum === checksum
        ? `${title} ${s.version} is already in this catalogue, and this is the same file.`
        : `${title} ${s.version} is already in this catalogue, and a published version never changes. Publish this file as a later version.`,
      { at: 'version' },
    );
  if (was && compareVersions(s.version, was.latest) < 0)
    return no('ALREADY_KNOWN', `${title} ${was.latest} is already in this catalogue, so this file needs a later version than ${s.version}.`, { at: 'version' });

  /* ONE KEY PER ENTRY ONCE IT IS SIGNED, or a key that one rotated to, so a reader who trusted the last version's key is
     never handed another here without that key's word for it. A revoked key signs nothing more. */
  const statements = await verifiedStatements(index.keys);
  if (key && revocationOf(statements, key.key_id))
    return no('SIGNATURE_INVALID', `Key ${key.key_id} is revoked in this catalogue, so it signs nothing more. Sign with the key it rotated to.`, { at: 'signature' });
  const pinned = was?.versions.find((v) => v.signature !== undefined)?.signature ?? null;
  if (pinned && (!key || (key.key_id !== pinned.key_id && rotatedFrom(statements, [pinned.key_id], key.key_id) === null)))
    return no(
      'SIGNATURE_INVALID',
      key
        ? `Earlier versions of ${title} are signed by key ${pinned.key_id}, and this key is ${key.key_id}. Sign it with that key, or publish a rotation from it to this one first.`
        : `Earlier versions of ${title} are signed by key ${pinned.key_id}. Sign this one with that key too.`,
      { at: 'signature' },
    );

  let before: CatalogueFile | null = null;
  if (was) {
    const path = catalogueFile(s.id, was.latest, kind);
    const prior = await read(path);
    const back = prior === null ? null : await readCatalogueFile(prior, { kind: 'local' });
    if (!back?.ok || back.value.kind !== kind) return no('PACK_MALFORMED', `${path} is missing from this catalogue or no longer reads, so this version cannot be compared with it.`, { at: 'catalogue' });
    before = back.value;
  }
  const changes = changesBetween(before, file);
  if (was) {
    const declared = declaredBump(was.latest, s.version) as Bump;
    if (RANK[declared] < RANK[changes.bump]) {
      const [x, y] = partsOf(was.latest) as [number, number, number];
      const needed = changes.bump === 'major' ? `${x + 1}.0.0` : `${x}.${y + 1}.0`;
      const why = changes.bump === 'major' ? 'takes away a list, a page, a module or a field a record may hold rows in' : 'adds a declaration, a module or a host it calls out to';
      return no('PACK_MALFORMED', `This version ${why}, which is a ${changes.bump} change from ${was.latest}. Publish it as ${needed} or later, not ${s.version}.`, { at: 'version' });
    }
  }

  let signature: Signature | undefined;
  if (key) {
    const signed = await signVersion(key, kind, s.id, s.version, checksum, now);
    if (!signed.ok) return signed as Result<Published>;
    signature = signed.value;
  }

  const version: CatalogueVersion = {
    version: s.version,
    checksum,
    bytes: file.kind === 'usecase' ? file.shared.bytes : file.file.bytes,
    published_at: now.toISOString(),
    bump: was ? changes.bump : null,
    reach: reachOf(file),
    ...(signature ? { signature } : {}),
  };
  const head =
    file.kind === 'usecase'
      ? { summary: file.shared.usecase.summary, author: file.shared.usecase.author, license: file.shared.usecase.license, audience: file.shared.usecase.audience as string }
      : { summary: file.file.pack.manifest.summary, author: file.file.pack.manifest.author, license: file.file.pack.manifest.license, audience: 'addon' };
  const entry: CatalogueEntry = { kind, id: s.id, title, ...head, latest: s.version, versions: [version, ...(was?.versions ?? [])] };
  const entries = [...index.entries.filter((e) => !(e.id === s.id && e.kind === kind)), entry].sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return ok({ index: { ...index, entries }, path: catalogueFile(s.id, s.version, kind), entry, version, changes });
}

/* ── updates on offer ───────────────────────────────────────────────────── */

/** A later version of something a record holds, fetched, verified and read, with what changed when the older file is still there. */
export type CatalogueUpdate = {
  entry: CatalogueEntry;
  /** The pack id the record holds it under. */
  installed: string;
  from: string;
  to: CatalogueVersion;
  text: string;
  file: CatalogueFile;
  /** `null` when the catalogue no longer holds the installed version, so only the record's own plan can say. */
  changes: Changes | null;
  signature: Signature | null;
};

/**
 * Every entry of a catalogue a record holds at an earlier version, with the latest file fetched and held to its checksum
 * and signature. A version that does not verify or read is left out and said in `refused`, never offered.
 */
export async function catalogueUpdates(
  index: CatalogueIndex,
  held: readonly { id: string; version: string | null; disabled_at?: string | null }[],
  read: (path: string) => string | null | Promise<string | null>,
): Promise<{ updates: CatalogueUpdate[]; refused: { entry: CatalogueEntry; fix: string }[] }> {
  const updates: CatalogueUpdate[] = [];
  const refused: { entry: CatalogueEntry; fix: string }[] = [];
  const statements = await verifiedStatements(index.keys);
  for (const entry of index.entries) {
    const installed = installedIdOf(entry);
    const state = held.find((h) => h.id === installed);
    const latest = entry.versions[0];
    if (!state || !latest || state.version === null || (state.disabled_at ?? null) !== null || compareVersions(state.version, latest.version) >= 0) continue;
    const text = await read(catalogueFile(entry.id, latest.version, entry.kind));
    if (text === null) {
      refused.push({ entry, fix: `${entry.title} ${latest.version} is listed in this catalogue and its file is missing.` });
      continue;
    }
    const verified = await verifyVersion(entry, latest, text);
    if (!verified.ok) {
      refused.push({ entry, fix: 'refusal' in verified ? verified.refusal.fix : 'It does not verify.' });
      continue;
    }
    /* A VERSION SIGNED BY A REVOKED KEY IS NEVER OFFERED, and said plainly instead. */
    const revoked = revokedNotice(statements, entry.title, latest.version, verified.value);
    if (revoked !== null) {
      refused.push({ entry, fix: revoked });
      continue;
    }
    const file = await readCatalogueFile(text, { kind: 'url' });
    if (!file.ok || file.value.kind !== entry.kind) {
      refused.push({ entry, fix: !file.ok && 'refusal' in file ? file.refusal.fix : `${entry.title} ${latest.version} does not read.` });
      continue;
    }
    let changes: Changes | null = null;
    const was = entry.versions.find((v) => v.version === state.version);
    if (was) {
      const old = await read(catalogueFile(entry.id, was.version, entry.kind));
      const oldOk = old === null ? null : (await verifyFile(was, old)).ok ? await readCatalogueFile(old, { kind: 'url' }) : null;
      if (oldOk?.ok && oldOk.value.kind === entry.kind) changes = changesBetween(oldOk.value, file.value);
    }
    updates.push({ entry, installed, from: state.version, to: latest, text, file: file.value, changes, signature: verified.value });
  }
  return { updates, refused };
}
