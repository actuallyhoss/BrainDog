/**
 * What `braindog import <adapter> <export>` asks of an adapter, how it finds one, and the pack offers it resolves for
 * it (`loop/research-legacy-parity.md` brief B2, `loop/DIRECTION.md` sections 22 and 27).
 *
 * THE COMMAND WAS ONE PERSON'S MIGRATION. The importer took one word, the name of his old record, and a planner of
 * 3,589 lines that knew about 180 of that record's field names and eight of its word tables was compiled into
 * `apps/cli`. Another person's export had no way in, and section 27 moves his record only once nothing in `apps/`
 * exists because he has it. So the line is drawn where the knowledge is. What is true of any import stays here: read
 * every list to the end, find each row again by the key in its tags, write only what differs, hold back what the owner
 * deleted, and remember the night. What is true of one tool's export is the adapter's: how to read it, which rows it
 * makes, and which words mean what, the last of those in a mapping file beside it that a person can edit.
 *
 * AN ADAPTER IMPORTS NOTHING OF BRAINDOG'S. It is loaded from wherever it sits, a pack folder or a person's own file,
 * with no package of this repository installed beside it, so the three things a planner needs from the record's own
 * code are handed to it (`Tools`) rather than imported. The fixture adapter in `test/fixtures/tallybook` is twenty lines.
 *
 * AND IT IS STRUCTURAL. `packs/*` may not import `apps/*` (`tools/gates/graph.mjs`, "edge into an app"), so an adapter
 * in a pack declares these shapes again for itself, and its own test holds the two to agreeing.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { looksLikeCredential } from '@braindog/declare';
import { CATALOGUE_INDEX, catalogueFile, heldToEntry, readCatalogue, readCatalogueFile, verifyVersion, type KnownKeys } from '@braindog/declare/catalogue';
import { coerce, exponentOf } from '@braindog/kernel';

import { trustVersion } from './catalogue.ts';

type Obj = Record<string, unknown>;

/** A field value that points at another planned row, resolved to that row's id when the plan is applied. */
export type Ref = { $ref: string };

export type PlannedRow = {
  register: string;
  /** `<adapter key><kind>:<id>`, kept in the row's tags (or `client_id` for a run), so a second import finds it. */
  key: string;
  /** How the report names it. */
  label: string;
  fields: Obj;
  /**
   * THE WORD THE EXPORT USED FOR A CLOSED-LIST FIELD WHOSE LIST DOES NOT START WITH IT, by field: `{ kind: 'crypto' }`.
   * `fields` carries the list's own word, and `applyPlan` proposes this one to the list and writes it once it lands.
   */
  own?: Obj;
  /** What the row carries instead on a record without the list `register`, over `fields`. */
  lacking?: { register: string; fields: Obj };
  /**
   * What the row carries instead on a record whose list declares every field in `needs` (and holds `pack` switched on,
   * where one is named), over `fields`, with its own `lacking` in place of the row's.
   */
  ifDeclared?: { needs: string[]; pack?: string; fields: Obj; lacking?: { register: string; fields: Obj } };
  /** Fields written when the row is created and never patched after, because from then on they are the owner's. */
  onCreate?: string[];
};

/**
 * One thing to file on Decide. `options` is a question with at least two answers; `change` is a declaration to install
 * once the owner accepts it, such as a rule. `body.from` is the key, which is how a later run knows it was filed.
 */
export type PlannedAsk = { key: string; label: string; question: string; body: Obj; kind?: 'options' | 'change' };

export type Skipped = { reason: string; items: string[] };

/**
 * A number the record should poll, filed on Decide as the install of a poll pack, because a poll sends requests to
 * somebody's server and only the owner approves that. `project` and `organisation` are planned keys.
 */
export type PlannedPoll = {
  key: string;
  label: string;
  id: string;
  url: string;
  every: string;
  grant?: string;
  project?: string;
  organisation?: string;
  measures: { name: string; path: string; unit?: string; type?: 'decimal' | 'int' }[];
};

/** Rows an earlier import wrote under a key this one no longer uses, and what to leave on each of them. */
export type Retire = {
  register: string;
  prefix: string;
  /** The list they moved to: if this record has not got it, nothing is closed. */
  replaces: string;
  /** What the row must still hold to be closed at all. */
  only: Obj;
  /** What to leave on each row. Only ever enough to close it. */
  patch: Obj;
  why: string;
  titles: string[];
  inside?: { field: string; after: string; before: string };
  spoken?: string[];
};

export type Plan = {
  /** The prefix every key in this plan starts with, and so every tag the import writes. */
  key: string;
  taken: string | null;
  rev: number | null;
  rows: PlannedRow[];
  asks: PlannedAsk[];
  polls: PlannedPoll[];
  skipped: Skipped[];
  /** Things carried with a change worth knowing. */
  changed: string[];
  retire?: Retire[];
};

/**
 * A pack the export shows its owner uses, BY THE ID A CATALOGUE KNOWS IT BY. The document is not the adapter's to hold:
 * `importCommand` resolves the id through the host's catalogue, the one the app's Browse lists, so the pack offered is
 * the pack published, checked against its checksum, and a pack that moves on is offered at its new version.
 * `kind: 'bank'` is counted on the report's Banks line and every other offer on its Packs line.
 */
export type Offer = { install: string; name: string; question: string; says: string; kind?: 'bank' | 'pack' };

/** A question the export says is settled, by the key an earlier run asked it under. */
export type Settled = { key: string; label: string; question: string | null; status: 'decided' | 'dismissed'; decision: string | null };

/** What the importer hands an adapter from BrainDog's own code, so an adapter imports none of it. */
export type Tools = {
  /** Whether a text is shaped like a key, so a row carrying one is left out rather than written. */
  looksLikeCredential: (text: string) => boolean;
  /** The record's own coercion of one value against one field, for an adapter that must predict a refusal. */
  coerce: (field: { id: string; type: string }, value: unknown) => { ok: true } | { ok: false; refusal: { code: string } };
  /** The number of decimals a currency's minor unit has. */
  exponentOf: (currency: string) => number;
};

export const TOOLS: Tools = { looksLikeCredential, coerce: coerce as unknown as Tools['coerce'], exponentOf };

/**
 * The mapping file's part this command reads. Everything else in it is the adapter's: its word tables, its offers.
 *
 * `targets.order` IS THE ORDER THE LISTS ARE WRITTEN IN, so a row is there before a row that points at it; `optional`
 * are the lists a record may lack, whose rows are then left out with a reason rather than stopping the run;
 * `providedBy` says what installs each, and `names` what the report calls each. `usecase` is what a missing list is
 * installed beside, and `listed` names the rows the report lists one by one, by the kind in their key.
 */
export type ImportMap = {
  targets: { order: string[]; optional: string[]; providedBy: Record<string, string>; names: Record<string, string> };
  usecase: string | null;
  listed: { heading: string; kinds: Record<string, string> } | null;
  raw: Obj;
};

export type Adapter = {
  /** What the report calls the tool the export came from. */
  source: string;
  /** The prefix every key the adapter plans starts with. */
  key: string;
  read: (text: string) => { ok: true; value: Obj } | { ok: false; fix: string };
  plan: (exp: Obj, o: { today: string; setup?: unknown; map: Obj; tools: Tools }) => Plan;
  readSetup?: (text: string, tools: Tools) => { ok: true; value: unknown } | { ok: false; fix: string };
  draftSetup?: (exp: Obj) => unknown;
  offers?: (exp: Obj, map: Obj) => Offer[];
  settled?: (exp: Obj) => Settled[];
  /**
   * The runs this machine remembers with no source are this adapter's. A run has named its adapter since adapters were
   * named on the line, and the one importer there was before that wrote its nights without one, so only the adapter
   * that importer became says `true`; any other adapter reading them would take that importer's nights for its own.
   */
  unsourced?: boolean;
};

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const texts = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== '');
const words = (v: unknown): v is Record<string, string> => isObj(v) && Object.values(v).every((x) => typeof x === 'string');

export const isRef = (v: unknown): v is Ref => isObj(v) && typeof v.$ref === 'string' && Object.keys(v).length === 1;

/** Every string anywhere in a value, for the credential check. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (isObj(v)) for (const x of Object.values(v)) strings(x, out);
  return out;
}
export const holdsKey = (v: unknown): boolean => strings(v).some((s) => looksLikeCredential(s));

/** The mapping file read, or the sentence saying what is wrong with it. */
export function readMap(text: string, where: string): { ok: true; value: ImportMap } | { ok: false; fix: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, fix: `${where} is not JSON.` };
  }
  if (!isObj(raw) || !isObj(raw.targets)) return { ok: false, fix: `${where} holds no targets, and an import needs the lists it writes to, in order.` };
  const t = raw.targets;
  if (!texts(t.order) || t.order.length === 0) return { ok: false, fix: `targets.order in ${where} is the list of lists the import writes, in the order it writes them.` };
  if (t.optional !== undefined && !texts(t.optional)) return { ok: false, fix: `targets.optional in ${where} is a list of list ids.` };
  if (t.providedBy !== undefined && !words(t.providedBy)) return { ok: false, fix: `targets.providedBy in ${where} maps a list id to what installs it.` };
  if (!words(t.names)) return { ok: false, fix: `targets.names in ${where} maps a list id to what the report calls it.` };
  /* EVERY LIST WRITTEN IS NAMED, AND NOTHING ELSE IS. The names were a table in `import.ts` held to the list of lists by
     a `satisfies`, because three times a list was added to one and not the other and the report printed its id at a
     person. A mapping is a file now, and a compile error cannot reach it, so the same check is this refusal. */
  const order = t.order;
  const unnamed = order.filter((r) => !Object.hasOwn(t.names as object, r));
  if (unnamed.length > 0) return { ok: false, fix: `targets.names in ${where} has no name for ${unnamed.join(', ')}, and the report would print the id at a person.` };
  const stray = Object.keys(t.names).filter((r) => !order.includes(r));
  if (stray.length > 0) return { ok: false, fix: `targets.names in ${where} names ${stray.join(', ')}, which targets.order does not write.` };
  if (raw.usecase !== undefined && typeof raw.usecase !== 'string') return { ok: false, fix: `usecase in ${where} is the name of what a missing list is installed beside.` };
  const listed = raw.listed;
  if (listed !== undefined && !(isObj(listed) && typeof listed.heading === 'string' && words(listed.kinds)))
    return { ok: false, fix: `listed in ${where} is a heading and the kinds of key the report lists one by one.` };
  if (holdsKey(raw)) return { ok: false, fix: `${where} holds something shaped like a key. A mapping names lists and words, never a key.` };
  return {
    ok: true,
    value: {
      targets: { order, optional: (t.optional as string[] | undefined) ?? [], providedBy: (t.providedBy as Record<string, string> | undefined) ?? {}, names: t.names },
      usecase: typeof raw.usecase === 'string' ? raw.usecase : null,
      listed: isObj(listed) ? { heading: String(listed.heading), kinds: listed.kinds as Record<string, string> } : null,
      raw,
    },
  };
}

/** A catalogue's refusal as its sentence. */
const fixOf = (r: { ok: false } & ({ refusal: { fix: string } } | { conflict: unknown })): string => ('refusal' in r ? r.refusal.fix : 'it changed while it was read');

/** A pack id as `packs/` names its folders. */
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/**
 * The file an adapter named on the command line is: a path to a module or to a folder holding `adapter.ts`, or a pack
 * id, which is looked for as `packs/<id>/adapter.ts` under the folder the command runs in and then under the checkout
 * this command runs from. The id is never imported by name, so the command knows no pack: it knows where packs sit.
 */
export function adapterFile(spec: string, cwd: string): string | null {
  const asFile = (path: string): string | null => {
    try {
      if (statSync(path).isDirectory()) return existsSync(join(path, 'adapter.ts')) ? join(path, 'adapter.ts') : null;
      return path;
    } catch {
      return null;
    }
  };
  const pathLike = isAbsolute(spec) || /[\\/]/u.test(spec) || /\.(?:ts|mts|js|mjs)$/u.test(spec);
  if (pathLike) return asFile(resolve(cwd, spec));
  if (!PACK_ID.test(spec)) return null;
  const checkout = fileURLToPath(new URL('../../../', import.meta.url));
  for (const root of [cwd, checkout]) {
    const found = asFile(join(root, 'packs', spec));
    if (found) return found;
  }
  return null;
}

const isAdapter = (v: unknown): v is Adapter =>
  isObj(v) && typeof v.source === 'string' && v.source !== '' && typeof v.key === 'string' && v.key !== '' && typeof v.read === 'function' && typeof v.plan === 'function';

/**
 * The adapter and its mapping, loaded, or the sentence saying why not. `map` is `--map`'s file; without it the
 * `map.json` beside the adapter is read, which is where a pack keeps it.
 */
export async function loadAdapter(spec: string, o: { cwd: string; map?: string | undefined }): Promise<{ ok: true; adapter: Adapter; map: ImportMap; file: string } | { ok: false; fix: string }> {
  const file = adapterFile(spec, o.cwd);
  if (file === null) return { ok: false, fix: `${spec} is neither a file nor a pack in packs/ with an adapter.ts in it.` };
  let mod: unknown;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (e) {
    return { ok: false, fix: `${spec} could not be loaded: ${e instanceof Error ? e.message : String(e)}` };
  }
  const adapter = isObj(mod) ? (mod.default ?? mod.adapter) : undefined;
  if (!isAdapter(adapter)) return { ok: false, fix: `${spec} is not an import adapter: its default export names no source, key, read and plan.` };
  const mapFile = o.map !== undefined ? resolve(o.cwd, o.map) : join(dirname(file), 'map.json');
  let text: string;
  try {
    text = readFileSync(mapFile, 'utf8');
  } catch {
    return { ok: false, fix: o.map !== undefined ? `${o.map} could not be read.` : `${spec} has no map.json beside it. Name one with --map <file>.` };
  }
  const map = readMap(text, o.map ?? 'map.json');
  if (!map.ok) return map;
  return { ok: true, adapter, map: map.value, file };
}

/** How a catalogue is read: a path inside it, answered as text, or `null` when it has no such file. */
export type CatalogueRead = { where: string; read: (path: string) => Promise<string | null> };

/** A catalogue folder on this machine, read as the host's is. */
export const folderCatalogue = (dir: string): CatalogueRead => ({
  where: dir,
  read: async (path) => {
    try {
      return readFileSync(join(dir, ...path.split('/')), 'utf8');
    } catch {
      return null;
    }
  },
});

/**
 * One pack's document, found by its id in a catalogue at its latest version and held to the index's checksum, or the
 * sentence saying why not. This is `pack install <id>`'s read and not a copy of what it installs: the same index, the
 * same `verifyVersion`, the same door the file is read through, and the same `trustVersion`, so a version signed by a
 * revoked key or stripped of its signature is not offered. `known` is the keys this machine has seen, which the
 * install reads beside the hosts file.
 */
export async function packFrom(catalogue: CatalogueRead, id: string, index?: Promise<string | null>, known: KnownKeys = {}): Promise<{ ok: true; doc: Obj; version: string } | { ok: false; fix: string }> {
  const text = await (index ?? catalogue.read(CATALOGUE_INDEX));
  if (text === null) return { ok: false, fix: `the catalogue at ${catalogue.where} could not be read` };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, fix: `the catalogue index at ${catalogue.where} is not JSON` };
  }
  const got = readCatalogue(doc);
  if (!got.ok) return { ok: false, fix: `the catalogue at ${catalogue.where} could not be read: ${fixOf(got)}` };
  const entry = got.value.entries.find((e) => e.kind === 'pack' && e.id === id);
  if (!entry) return { ok: false, fix: `the catalogue at ${catalogue.where} holds no pack called ${id}` };
  const chosen = entry.versions.find((v) => v.version === entry.latest);
  if (!chosen) return { ok: false, fix: `the catalogue lists ${id} at ${entry.latest} and holds no such version` };
  const path = catalogueFile(entry.id, chosen.version, 'pack');
  const file = await catalogue.read(path);
  if (file === null) return { ok: false, fix: `${path} is listed in the catalogue and missing from it` };
  const held = await verifyVersion(entry, chosen, file);
  if (!held.ok) return { ok: false, fix: fixOf(held) };
  const read = await readCatalogueFile(file, { kind: 'url', ref: catalogue.where });
  if (!read.ok) return { ok: false, fix: fixOf(read) };
  if (read.value.kind !== 'pack') return { ok: false, fix: `${path} is not a pack` };
  const matches = heldToEntry(entry, chosen.version, read.value);
  if (!matches.ok) return { ok: false, fix: fixOf(matches) };
  /* THE SENTENCE IS SAID INSIDE ANOTHER, which ends it, so its own full stop is dropped. */
  const trusted = await trustVersion(entry, chosen.version, held.value, got.value.keys, known);
  if (!trusted.ok) return { ok: false, fix: trusted.fix.replace(/.$/u, '') };
  return { ok: true, doc: read.value.file.doc as Obj, version: chosen.version };
}
