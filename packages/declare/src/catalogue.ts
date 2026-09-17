/**
 * A catalogue of shared use cases: the local, file-shaped seed of the add-on index (`loop/research-marketplace.md` §2,
 * S12, and §3's `publish`, `search`, `version` and `diff`).
 *
 * A CATALOGUE IS A FOLDER OF FILES, never a service. `index.json` names every entry and its versions, and each version is
 * the shared file itself at `usecases/<id>/<version>.usecase.json`, kept byte for byte as it was published. A self-host
 * serves one folder read-only; a person publishes into one with the command line. Nothing here fetches, signs or writes:
 * the caller hands in text and a reader, and gets back the index to write.
 *
 * EVERY FILE GOES THROUGH `readShared` before it is listed, the same door the record, the app and the command line read a
 * shared file through, so a catalogue cannot list what a record would refuse. Installing from a catalogue is still a plan
 * and an approval on the record: this module only says what a file is, what it can reach, and what changed between two
 * versions of it.
 *
 * VERSIONS ARE IMMUTABLE AND THEIR BUMP IS COMPUTED. A version already published is never replaced, a version is later
 * than the one before it, and a file that takes a list or a page away cannot be published as a minor or a patch.
 *
 * TRUST IS WHAT THE FILE DECLARES, NOT WHAT ITS AUTHOR SAYS: the modules it installs first, the lists, pages and rules it
 * adds, the example rows, the skills it suggests, every host it would call out to and the key it would send by label.
 * A catalogue on this machine is not the add-on index and carries no signature, so a screen says so.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { digest, jcs, type Json } from '@braindog/kernel';

import { egressOf, type Pack } from './index.ts';
import { readShared, type Shared } from './shared.ts';

export const CATALOGUE_FORMAT = 1;
export const CATALOGUE_INDEX = 'index.json';

const ID = /^[a-z][a-z0-9-]{0,62}$/u;
const VERSION = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/u;

/** Where a version's file sits inside a catalogue. Ids and versions are checked first, so the path never leaves it. */
export const catalogueFile = (id: string, version: string): string => `usecases/${id}/${version}.usecase.json`;

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
};

export type CatalogueEntry = {
  kind: 'usecase';
  id: string;
  title: string;
  summary: string;
  author: string;
  license: string;
  audience: string;
  latest: string;
  /** Newest first. */
  versions: CatalogueVersion[];
};

export type CatalogueIndex = { format: typeof CATALOGUE_FORMAT; name: string; entries: CatalogueEntry[] };

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

/* ── what a file is ─────────────────────────────────────────────────────── */

/** The checksum a catalogue keeps for a file: SHA-256 over its canonical JSON. */
export async function fileChecksum(text: string): Promise<string> {
  return digest(jcs(JSON.parse(text) as Json));
}

const titleOf = (decl: Pack['declarations'][number]): string => {
  const b = decl.body as Record<string, unknown>;
  return str(b.name) || str(b.title) || decl.id.slice(decl.id.indexOf('.') + 1);
};

/** What a shared use case can reach, read from what it declares. */
export function reachOf(shared: Shared): Reach {
  const decls = shared.pack?.declarations ?? [];
  const of = (kind: string) => decls.filter((d) => d.kind === kind).map(titleOf);
  return {
    modules: [...shared.usecase.modules],
    lists: of('register'),
    pages: of('page'),
    rules: of('rule'),
    examples: shared.pack?.seeds.length ?? 0,
    skills: shared.usecase.skills.map((s) => s.name),
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

const hostsOf = (s: Shared | null): string[] => [...new Set((s ? reachOf(s).calls_out : []).map((c) => c.host ?? '').filter((h) => h !== ''))];
const minus = <T>(a: readonly T[], b: readonly T[]): T[] => a.filter((x) => !b.includes(x));

/** A field a register keeps from one version to the next with its type, so a removed or retyped one is known. */
const fieldsOf = (decl: Pack['declarations'][number] | undefined): Map<string, string> => {
  const fields = decl && Array.isArray((decl.body as Record<string, unknown>).fields) ? ((decl.body as Record<string, unknown>).fields as unknown[]) : [];
  return new Map(fields.filter(isMap).map((f) => [str(f.id), `${str(f.type)}:${str(f.of)}`]));
};

/**
 * What changed from one version of a use case to the next, declaration by declaration, and the least bump that says it.
 *
 * MAJOR takes something away a record may hold rows or links to: a list, a page, a module, or a field of a list (or its
 * type). MINOR adds: a declaration, a module, or a host it calls out to. PATCH is everything else: a changed page, rule or
 * word. A new host is never a patch, because it is a new place a record's data could go.
 */
export function changesBetween(from: Shared | null, to: Shared): Changes {
  const before = new Map((from?.pack?.declarations ?? []).map((d) => [d.id, d]));
  const after = new Map((to.pack?.declarations ?? []).map((d) => [d.id, d]));
  const named = (d: Pack['declarations'][number]): Named => ({ kind: d.kind, id: d.id, title: titleOf(d) });
  const added = [...after.values()].filter((d) => !before.has(d.id)).map(named);
  const removed = [...before.values()].filter((d) => !after.has(d.id)).map(named);
  const changed = [...after.values()].filter((d) => before.has(d.id) && before.get(d.id)?.canonical !== d.canonical).map(named);
  const modules = { added: minus(to.usecase.modules, from?.usecase.modules ?? []), removed: minus(from?.usecase.modules ?? [], to.usecase.modules) };
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
  const { version: _a, pack: _p, ...wordsBefore } = (from?.usecase ?? {}) as Record<string, unknown>;
  const { version: _b, pack: _q, ...wordsAfter } = to.usecase as unknown as Record<string, unknown>;
  return {
    from: from?.usecase.version ?? null,
    to: to.usecase.version,
    bump,
    added,
    removed,
    changed,
    modules,
    hosts,
    examples: { from: from?.pack?.seeds.length ?? 0, to: to.pack?.seeds.length ?? 0 },
    words: from !== null && jcs(wordsBefore as Json) !== jcs(wordsAfter as Json),
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
    if (!isMap(e) || e.kind !== 'usecase' || !ID.test(str(e.id)) || !Array.isArray(e.versions) || e.versions.length === 0)
      return bad(`entries[${i}]`, `Entry ${i + 1} of this catalogue is not a use case with an id and at least one version.`);
    const versions: CatalogueVersion[] = [];
    for (const v of e.versions) {
      if (!isMap(v) || !VERSION.test(str(v.version)) || !/^[0-9a-f]{64}$/u.test(str(v.checksum)) || !isMap(v.reach))
        return bad(`entries[${i}].versions`, `A version of ${str(e.id)} in this catalogue has no version number or checksum.`);
      versions.push(v as unknown as CatalogueVersion);
    }
    versions.sort((a, b) => compareVersions(b.version, a.version));
    entries.push({ ...(e as unknown as CatalogueEntry), versions, latest: (versions[0] as CatalogueVersion).version });
  }
  return ok({ format: CATALOGUE_FORMAT, name: str(doc.name), entries });
}

/** The entries a search matches, best first: by id, title, summary, author, and the lists and pages the latest adds. */
export function searchCatalogue(index: CatalogueIndex, query: string): CatalogueEntry[] {
  const words = query.toLowerCase().split(/\s+/u).filter((w) => w !== '');
  if (words.length === 0) return [...index.entries];
  const scored = index.entries.map((e) => {
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

export type Published = { index: CatalogueIndex; path: string; entry: CatalogueEntry; version: CatalogueVersion; changes: Changes };

/**
 * A file added to a catalogue: the index to write, and the path to write the file's text at, unchanged.
 *
 * `read` answers a file already in the catalogue by its path, or `null`, so the version before can be compared.
 */
export async function publishTo(index: CatalogueIndex, text: string, read: (path: string) => string | null | Promise<string | null>, now: Date = new Date()): Promise<Result<Published>> {
  const shared = await readShared(text, { kind: 'local' });
  if (!shared.ok) return shared as Result<Published>;
  const u = shared.value.usecase;
  if (!ID.test(u.usecase)) return no('PACK_MALFORMED', `A catalogue lists a use case by an id of lower-case letters, digits and dashes, and ${u.usecase} is not one.`, { at: 'usecase' });
  if (!VERSION.test(u.version)) return no('PACK_MALFORMED', `A catalogue lists versions as three numbers, as in 1.0.0, and ${u.version} is not one.`, { at: 'version' });

  const checksum = await fileChecksum(text);
  const was = index.entries.find((e) => e.id === u.usecase) ?? null;
  const same = was?.versions.find((v) => v.version === u.version);
  if (same)
    return no(
      'ALREADY_KNOWN',
      same.checksum === checksum
        ? `${u.title} ${u.version} is already in this catalogue, and this is the same file.`
        : `${u.title} ${u.version} is already in this catalogue, and a published version never changes. Publish this file as a later version.`,
      { at: 'version' },
    );
  if (was && compareVersions(u.version, was.latest) < 0)
    return no('ALREADY_KNOWN', `${u.title} ${was.latest} is already in this catalogue, so this file needs a later version than ${u.version}.`, { at: 'version' });

  let before: Shared | null = null;
  if (was) {
    const prior = await read(catalogueFile(u.usecase, was.latest));
    const got = prior === null ? null : await readShared(prior, { kind: 'local' });
    if (!got?.ok) return no('PACK_MALFORMED', `${catalogueFile(u.usecase, was.latest)} is missing from this catalogue or no longer reads, so this version cannot be compared with it.`, { at: 'catalogue' });
    before = got.value;
  }
  const changes = changesBetween(before, shared.value);
  if (was) {
    const declared = declaredBump(was.latest, u.version) as Bump;
    if (RANK[declared] < RANK[changes.bump]) {
      const [x, y, z] = partsOf(was.latest) as [number, number, number];
      const needed = changes.bump === 'major' ? `${x + 1}.0.0` : `${x}.${y + 1}.0`;
      const why = changes.bump === 'major' ? 'takes away a list, a page, a module or a field a record may hold rows in' : 'adds a declaration, a module or a host it calls out to';
      return no('PACK_MALFORMED', `This version ${why}, which is a ${changes.bump} change from ${was.latest}. Publish it as ${needed} or later, not ${u.version}.`, { at: 'version' });
    }
  }

  const version: CatalogueVersion = {
    version: u.version,
    checksum,
    bytes: shared.value.bytes,
    published_at: now.toISOString(),
    bump: was ? changes.bump : null,
    reach: reachOf(shared.value),
  };
  const entry: CatalogueEntry = {
    kind: 'usecase',
    id: u.usecase,
    title: u.title,
    summary: u.summary,
    author: u.author,
    license: u.license,
    audience: u.audience,
    latest: u.version,
    versions: [version, ...(was?.versions ?? [])],
  };
  const entries = [...index.entries.filter((e) => e.id !== u.usecase), entry].sort((a, b) => a.id.localeCompare(b.id));
  return ok({ index: { ...index, entries }, path: catalogueFile(u.usecase, u.version), entry, version, changes });
}
