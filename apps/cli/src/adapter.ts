/**
 * What `braindog import <adapter> <export>` asks of an adapter, how it finds one, and the pack offers it resolves for
 * it.
 *
 * THE LINE IS DRAWN WHERE THE KNOWLEDGE IS. A planner that knows one tool's field names and word tables compiled into
 * `apps/cli` leaves every other person's export with no way in, and nothing in `apps/` should exist because one
 * person has one tool. What is true of any import stays here: read
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
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
export type PlannedAsk = {
  key: string;
  label: string;
  question: string;
  body: Obj;
  kind?: 'options' | 'change';
  /**
   * THE ONE QUESTION THIS ASK IS A PART OF, so ten rules are one question with ten parts and not ten questions (the
   * import that filed 57 rules filed 57). Asks naming the same `group.key` are filed together by `gatherAsks`: their
   * declarations in one change, each part kept by its own key and label in `body.parts`. An ask that cannot ride in a
   * bundle (a choice, or a change to one field) is filed alone, as it was.
   */
  group?: { key: string; label: string; question: string };
};

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
  /**
   * THE MAPPING AS DATA (`Section`): each path of the export, the list it fills, its key and each field's move. A map
   * that has them needs no module, `braindog import --map <map.json> <export.json>` (`mapAdapter`). Absent on a map
   * that only names lists, which a module beside it still reads. `source` is what the report calls the tool, `key` the
   * prefix of every key it plans, and `taken` the path of the day the export was taken, when it says.
   */
  sections?: Section[];
  source?: string;
  key?: string;
  taken?: string;
};

/**
 * THE FIVE WORDS A VALUE MOVES BY. `text` is carried as it is written; `day` is the first ten characters of a date;
 * `money` is an amount and its currency, written in minor units (`minor` when the export already holds them, and never
 * two currencies added); `link` points at a row of another section of the same export, by that row's key; `one of`
 * turns the export's word into the list's through `values`, and a word the table has not got is proposed to the list,
 * carried as `else` until it lands.
 */
export const MOVES = ['text', 'money', 'day', 'link', 'one of'] as const;
export type Move = (typeof MOVES)[number];

export type SectionField = {
  from: string;
  as: Move;
  /** `money`: the field of the item holding its currency, or `in`, the one currency the whole section is in. */
  currency?: string;
  in?: string;
  minor?: boolean;
  /** `link`: the path of the section the value is a key of. */
  to?: string;
  /** `one of`: the export's word to the list's, and what a word not in the table is carried as. */
  values?: Record<string, string>;
  else?: string;
};

/**
 * ONE PATH OF AN EXPORT, AS A MAP SAYS IT MOVES. `path` is one or two names (`items`, `book.accounts`); what sits there
 * is a list of items, or an object of items by their key. `key` is the item's field naming it (or `$key`, the name it
 * sits under), `label` the field the report names it by, and `kind` the word between the prefix and the item's key
 * (the path's last name when the map says none), so a second import finds it again.
 */
export type Section = { path: string; register: string; key: string; label: string; kind: string; fields: Record<string, SectionField> };

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
  if (!isObj(raw)) return { ok: false, fix: `${where} holds no targets, and an import needs the lists it writes to, in order.` };
  /* SECTIONS ARE READ FIRST, because a map that has them may leave `targets` out: the lists are then written in the
     order the sections name them, each called by its section's `name`. */
  const read = readSections(raw, where);
  if (!read.ok) return read;
  const sections = read.value;
  if (!isObj(raw.targets) && sections === null) return { ok: false, fix: `${where} holds no targets, and an import needs the lists it writes to, in order.` };
  const t: Obj = isObj(raw.targets) ? raw.targets : targetsOf(raw.sections as Obj);
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
  const outside = (sections ?? []).find((x) => !order.includes(x.register));
  if (outside) return { ok: false, fix: `sections.${outside.path} in ${where} fills ${outside.register}, which targets.order does not write.` };
  if (sections !== null) {
    if (typeof raw.source !== 'string' || raw.source.trim() === '') return { ok: false, fix: `source in ${where} is what the report calls the tool the export came from, such as Tallybook.` };
    if (raw.key !== undefined && !(typeof raw.key === 'string' && /^[a-z0-9-]+:$/u.test(raw.key)))
      return { ok: false, fix: `key in ${where} is the word everything imported is found again by, in small letters and ending in a colon, such as tallybook:.` };
    if (raw.taken !== undefined && typeof raw.taken !== 'string') return { ok: false, fix: `taken in ${where} is the path of the day the export was taken, such as saved.` };
  }
  return {
    ok: true,
    value: {
      targets: { order, optional: (t.optional as string[] | undefined) ?? [], providedBy: (t.providedBy as Record<string, string> | undefined) ?? {}, names: t.names as Record<string, string> },
      usecase: typeof raw.usecase === 'string' ? raw.usecase : null,
      listed: isObj(listed) ? { heading: String(listed.heading), kinds: listed.kinds as Record<string, string> } : null,
      raw,
      ...(sections === null
        ? {}
        : {
            sections,
            source: String(raw.source).trim(),
            key: typeof raw.key === 'string' ? raw.key : keyFrom(String(raw.source)),
            ...(typeof raw.taken === 'string' ? { taken: raw.taken } : {}),
          }),
    },
  };
}

/** The prefix a map's rows are found again by when it names none: its tool's name in small letters. */
const keyFrom = (source: string): string => `${source.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'import'}:`;

/** A path of one or two names, as a section and a link name one. */
const PATH = /^[^.\s]+(?:\.[^.\s]+)?$/u;

/** The lists a map with sections and no `targets` writes: in the order its sections name them, each by its `name`. */
function targetsOf(sections: Obj): Obj {
  const order: string[] = [];
  const names: Record<string, string> = {};
  for (const s of Object.values(sections))
    if (isObj(s) && typeof s.register === 'string') {
      if (!order.includes(s.register)) order.push(s.register);
      if (typeof s.name === 'string' && !Object.hasOwn(names, s.register)) names[s.register] = s.name;
    }
  return { order, names };
}

/** One field's move, a bare name being `text` from that name; or the sentence saying what is wrong with it. */
function readField(v: unknown, at: string): { ok: true; value: SectionField } | { ok: false; fix: string } {
  if (typeof v === 'string' && v !== '') return { ok: true, value: { from: v, as: 'text' } };
  if (!isObj(v) || typeof v.from !== 'string' || v.from === '') return { ok: false, fix: `${at} names the export's field it comes from, as "due" or {"from":"due","as":"day"}.` };
  const as = v.as ?? 'text';
  if (typeof as !== 'string' || !(MOVES as readonly string[]).includes(as)) return { ok: false, fix: `${at}.as is one of ${MOVES.join(', ')}.` };
  const f: SectionField = { from: v.from, as: as as Move };
  if (as === 'money') {
    if (typeof v.currency === 'string' && v.currency !== '') f.currency = v.currency;
    else if (typeof v.in === 'string' && /^[A-Z]{3}$/u.test(v.in)) f.in = v.in;
    else return { ok: false, fix: `${at} is money, so it names the field holding each amount's currency ("currency":"cur") or the one currency they are all in ("in":"USD").` };
    if (v.minor !== undefined && typeof v.minor !== 'boolean') return { ok: false, fix: `${at}.minor is true when the export already holds whole minor units, such as 4800 for 48.00.` };
    if (v.minor === true) f.minor = true;
  }
  if (as === 'link') {
    if (typeof v.to !== 'string' || !PATH.test(v.to)) return { ok: false, fix: `${at} is a link, so "to" names the section of the export its value is a key of.` };
    f.to = v.to;
  }
  if (as === 'one of') {
    if (!words(v.values)) return { ok: false, fix: `${at} is one of a list's words, so "values" turns each word of the export into the list's own.` };
    f.values = v.values;
    if (v.else !== undefined && typeof v.else !== 'string') return { ok: false, fix: `${at}.else is the list's word a value carries until its own is added.` };
    if (typeof v.else === 'string') f.else = v.else;
  }
  return { ok: true, value: f };
}

/** A map's `sections`, read, or `null` when it has none; or the sentence saying what is wrong with them. */
function readSections(raw: Obj, where: string): { ok: true; value: Section[] | null } | { ok: false; fix: string } {
  if (raw.sections === undefined) return { ok: true, value: null };
  if (!isObj(raw.sections) || Object.keys(raw.sections).length === 0)
    return { ok: false, fix: `sections in ${where} maps each path of the export to the list it fills, such as {"items":{"register":"tasks","key":"id","label":"what","fields":{"what":"what"}}}.` };
  const out: Section[] = [];
  for (const [path, s] of Object.entries(raw.sections)) {
    const at = `sections.${path} in ${where}`;
    if (!PATH.test(path)) return { ok: false, fix: `${at} is a path of one or two names, such as items or book.accounts.` };
    if (!isObj(s) || typeof s.register !== 'string' || s.register === '') return { ok: false, fix: `${at} names the list it fills ("register").` };
    if (typeof s.key !== 'string' || s.key === '') return { ok: false, fix: `${at} names the field each item is found again by ("key"), or $key for the name it sits under.` };
    if (s.label !== undefined && typeof s.label !== 'string') return { ok: false, fix: `${at}.label is the field the report names each item by.` };
    if (s.kind !== undefined && !(typeof s.kind === 'string' && /^[a-z0-9-]+$/u.test(s.kind))) return { ok: false, fix: `${at}.kind is one word in small letters.` };
    if (!isObj(s.fields) || Object.keys(s.fields).length === 0) return { ok: false, fix: `${at} moves at least one field ("fields").` };
    const fields: Record<string, SectionField> = {};
    for (const [field, v] of Object.entries(s.fields)) {
      const got = readField(v, `${at}, field ${field}`);
      if (!got.ok) return got;
      fields[field] = got.value;
    }
    out.push({ path, register: s.register, key: s.key, label: typeof s.label === 'string' ? s.label : s.key, kind: typeof s.kind === 'string' ? s.kind : (path.split('.').at(-1) ?? path).toLowerCase(), fields });
  }
  for (const s of out)
    for (const [field, f] of Object.entries(s.fields))
      if (f.as === 'link' && !out.some((x) => x.path === f.to)) return { ok: false, fix: `sections.${s.path} in ${where} links ${field} to ${String(f.to)}, which no section reads.` };
  return { ok: true, value: out };
}

/** A catalogue's refusal as its sentence. */
const fixOf = (r: { ok: false } & ({ refusal: { fix: string } } | { conflict: unknown })): string => ('refusal' in r ? r.refusal.fix : 'it changed while it was read');

/** A pack id as `packs/` names its folders. */
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;

/**
 * The file an adapter named on the command line is: a path to a module or to a folder holding `adapter.ts`, or a pack
 * id, which is looked for as `packs/<id>/adapter.ts` under the checkout this command runs from. The id is never imported
 * by name, so the command knows no pack: it knows where packs sit.
 *
 * THE FOLDER THE COMMAND RUNS IN ONLY WHEN `here` ASKS (`--here`), and then before the checkout (security pass, 8 Nov).
 * It was looked in first and nothing was asked, so `braindog import <id>` typed in a folder somebody else filled ran their
 * `packs/<id>/adapter.ts` as this person. `here` in the answer says the file is that folder's.
 */
export function adapterFile(spec: string, cwd: string, here = false): { file: string; here: boolean } | null {
  const asFile = (path: string): string | null => {
    try {
      if (statSync(path).isDirectory()) return existsSync(join(path, 'adapter.ts')) ? join(path, 'adapter.ts') : null;
      return path;
    } catch {
      return null;
    }
  };
  const pathLike = isAbsolute(spec) || /[\\/]/u.test(spec) || /\.(?:ts|mts|js|mjs)$/u.test(spec);
  if (pathLike) {
    const file = asFile(resolve(cwd, spec));
    return file === null ? null : { file, here: false };
  }
  if (!PACK_ID.test(spec)) return null;
  const local = here ? asFile(join(cwd, 'packs', spec)) : null;
  if (local) return { file: local, here: true };
  const own = asFile(join(fileURLToPath(new URL('../../../', import.meta.url)), 'packs', spec));
  return own ? { file: own, here: false } : null;
}

const isAdapter = (v: unknown): v is Adapter =>
  isObj(v) && typeof v.source === 'string' && v.source !== '' && typeof v.key === 'string' && v.key !== '' && typeof v.read === 'function' && typeof v.plan === 'function';

/** An add-on's adapter from the catalogue, by its id: the file this machine keeps it in, once it may run. */
export type AdapterFetch = (id: string) => Promise<{ ok: true; file: string } | { ok: false; fix: string }>;

/**
 * The file an adapter named on the line is, as `adapterFile` finds it, and then, for an id no `packs/` folder holds,
 * the copy `fetch` keeps of the add-on's adapter from the catalogue (`adapter-fetch.ts`). `fetched` says which, and
 * `here` whether it is the working folder's own.
 */
export async function adapterFileOr(
  spec: string,
  cwd: string,
  fetch?: AdapterFetch,
  here = false,
): Promise<{ ok: true; file: string; fetched: boolean; here: boolean } | { ok: false; fix: string }> {
  const found = adapterFile(spec, cwd, here);
  if (found !== null) return { ok: true, ...found, fetched: false };
  if (fetch === undefined || !PACK_ID.test(spec)) return { ok: false, fix: `${spec} is neither a file nor a pack in packs/ with an adapter.ts in it.` };
  const got = await fetch(spec);
  return got.ok ? { ok: true, file: got.file, fetched: true, here: false } : got;
}

/**
 * The adapter and its mapping, loaded, or the sentence saying why not. `map` is `--map`'s file; without it the
 * `map.json` beside the adapter is read, which is where a pack keeps it. An adapter from the catalogue is one file, so
 * its mapping travels inside it as its `map` export, and the folder it is kept in is never read for one.
 *
 * A PACK FROM THE WORKING FOLDER IS SAID BEFORE IT RUNS (`say`), since nothing but `--here` vouches for it.
 */
export async function loadAdapter(
  spec: string,
  o: { cwd: string; map?: string | undefined; fetch?: AdapterFetch | undefined; here?: boolean | undefined; say?: ((line: string) => void) | undefined },
): Promise<{ ok: true; adapter: Adapter; map: ImportMap; file: string } | { ok: false; fix: string }> {
  const found = await adapterFileOr(spec, o.cwd, o.fetch, o.here === true);
  if (!found.ok) return found;
  const { file } = found;
  if (found.here) o.say?.(`Running ${relative(o.cwd, file)} from this folder, as --here asked.`);
  let mod: unknown;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (e) {
    return { ok: false, fix: `${spec} could not be loaded: ${e instanceof Error ? e.message : String(e)}` };
  }
  const adapter = isObj(mod) ? (mod.default ?? mod.adapter) : undefined;
  if (!isAdapter(adapter)) return { ok: false, fix: `${spec} is not an import adapter: its default export names no source, key, read and plan.` };
  if (found.fetched && o.map === undefined) {
    const inside = isObj(mod) ? (isObj(mod.map) ? mod.map : (adapter as unknown as Obj).map) : undefined;
    if (!isObj(inside)) return { ok: false, fix: `The import adapter of ${spec} carries no mapping. Name one with --map <file>.` };
    const map = readMap(JSON.stringify(inside), `the adapter of ${spec}`);
    return map.ok ? { ok: true, adapter, map: map.value, file } : map;
  }
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

/**
 * AN AMOUNT AS WHOLE MINOR UNITS OF ITS CURRENCY, or `null` when it is not one. Read from its written digits and never
 * by multiplying a float, so 0.29 is 29 and not 28.999999999999996; an amount with more decimals than its currency has
 * is not rounded, it is refused, because a rounded amount is a different amount.
 */
function minorOf(v: unknown, exponent: number, minor: boolean): number | null {
  if (minor) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/u.test(v.trim()) ? Number(v.trim()) : NaN;
    return Number.isSafeInteger(n) ? n : null;
  }
  const text = typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v.trim() : '';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(text);
  if (!m) return null;
  const frac = (m[3] ?? '').replace(/0+$/u, '');
  if (frac.length > exponent) return null;
  const n = Number(`${m[2]!}${frac.padEnd(exponent, '0')}`);
  return Number.isSafeInteger(n) ? (m[1] === '-' && n !== 0 ? -n : n) : null;
}

/** What sits at a path of one or two names. Read name by name, so the export's reader notes each one it was asked for. */
const atPath = (exp: Obj, path: string): unknown => path.split('.').reduce<unknown>((v, name) => (isObj(v) ? v[name] : undefined), exp);

/** The items of a section, each with the name it sits under when the section is an object of items. */
const itemsAt = (v: unknown): [string | null, unknown][] => (Array.isArray(v) ? v.map((x): [string | null, unknown] => [null, x]) : isObj(v) ? Object.entries(v) : []);

const idOf = (item: Obj, name: string | null, key: string): string | null => {
  const v = key === '$key' ? name : item[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
};

/**
 * THE ROWS A MAP'S SECTIONS MAKE OF AN EXPORT, with what was left out and why. Everything here is what the map says and
 * nothing is one tool's, which is the point: a person writes twenty lines of map and no module.
 */
export function planSections(exp: Obj, map: ImportMap, tools: Tools): { rows: PlannedRow[]; skipped: Skipped[]; changed: string[] } {
  const prefix = map.key ?? 'import:';
  const sections = map.sections ?? [];
  const left = new Map<string, string[]>();
  const leave = (reason: string, item: string) => left.set(reason, [...(left.get(reason) ?? []), item]);
  const changed: string[] = [];
  /* EVERY SECTION'S KEYS FIRST, so a link to an item the export does not hold is known before the row is planned. */
  const keys = new Map<string, Set<string>>();
  for (const s of sections) {
    const got = new Set<string>();
    for (const [name, item] of itemsAt(atPath(exp, s.path))) {
      const id = isObj(item) ? idOf(item, name, s.key) : null;
      if (id !== null) got.add(id);
    }
    keys.set(s.path, got);
  }
  const kindOf = (path: string) => sections.find((s) => s.path === path)?.kind ?? path;
  const rows: PlannedRow[] = [];
  const seen = new Set<string>();
  for (const s of sections) {
    for (const [name, item] of itemsAt(atPath(exp, s.path))) {
      if (!isObj(item)) {
        leave(`Not an item in ${s.path}`, name ?? String(item));
        continue;
      }
      const id = idOf(item, name, s.key);
      const label = typeof item[s.label] === 'string' && String(item[s.label]).trim() !== '' ? String(item[s.label]).trim() : (id ?? s.path);
      if (id === null) {
        leave(`No ${s.key} to find it again by, in ${s.path}`, label);
        continue;
      }
      const key = `${prefix}${s.kind}:${id}`;
      if (seen.has(key)) {
        leave(`In ${s.path} twice, so only the first was carried`, label);
        continue;
      }
      seen.add(key);
      const fields: Obj = {};
      const own: Obj = {};
      for (const [field, f] of Object.entries(s.fields)) {
        const v = item[f.from];
        if (v === undefined || v === null || v === '') continue;
        if (f.as === 'text') {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') fields[field] = String(v);
          else leave(`${f.from} is not text, so it was not carried`, label);
        } else if (f.as === 'day') {
          const day = typeof v === 'string' ? /^\d{4}-\d{2}-\d{2}/u.exec(v.trim())?.[0] : undefined;
          if (day) fields[field] = day;
          else leave(`${f.from} is not a day, so it was not carried`, label);
        } else if (f.as === 'money') {
          const code = f.in ?? (typeof item[f.currency ?? ''] === 'string' ? String(item[f.currency ?? '']).trim().toUpperCase() : '');
          const amount = /^[A-Z]{3}$/u.test(code) ? minorOf(v, tools.exponentOf(code), f.minor === true) : null;
          if (amount === null) leave(`${f.from} is not an amount in a currency, so it was not carried`, label);
          else fields[field] = { amount, currency: code };
        } else if (f.as === 'link') {
          const to = typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
          if (keys.get(f.to ?? '')?.has(to)) fields[field] = { $ref: `${prefix}${kindOf(f.to ?? '')}:${to}` } satisfies Ref;
          else changed.push(`${label} arrived without its ${field}, because ${f.to ?? ''} in the export holds nothing called ${to}.`);
        } else {
          const word = typeof v === 'string' ? v.trim() : String(v);
          /* OWN WORDS ONLY: an export word such as "constructor" is not the table's. */
          const mapped = f.values !== undefined && Object.hasOwn(f.values, word) ? f.values[word] : undefined;
          if (mapped !== undefined) fields[field] = mapped;
          else {
            own[field] = word;
            if (f.else !== undefined) fields[field] = f.else;
          }
        }
      }
      rows.push({ register: s.register, key, label, fields, ...(Object.keys(own).length > 0 ? { own } : {}) });
    }
  }
  return { rows, skipped: [...left].map(([reason, items]) => ({ reason, items })), changed };
}

/**
 * THE ADAPTER A MAP WITH SECTIONS IS, so `braindog import --map <map.json> <export.json>` needs no module. The export is
 * one JSON object; the map says which of its paths become which rows. A module stays for what a map cannot say.
 */
export function mapAdapter(map: ImportMap): Adapter {
  const key = map.key ?? 'import:';
  return {
    source: map.source ?? 'the export',
    key,
    read: (text) => {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        return { ok: false, fix: 'The export is not JSON.' };
      }
      return isObj(value) ? { ok: true, value } : { ok: false, fix: 'An export a map reads is one JSON object, with its sections inside it.' };
    },
    plan: (exp, o) => {
      const got = planSections(exp, map, o.tools);
      const taken = map.taken === undefined ? undefined : atPath(exp, map.taken);
      return { key, taken: typeof taken === 'string' ? taken : null, rev: null, rows: got.rows, asks: [], polls: [], skipped: got.skipped, changed: got.changed };
    },
  };
}

/** A map file read as an adapter of its own, or the sentence saying why it cannot be one. */
export function loadMap(file: string, cwd: string): { ok: true; adapter: Adapter; map: ImportMap } | { ok: false; fix: string } {
  let text: string;
  try {
    text = readFileSync(resolve(cwd, file), 'utf8');
  } catch {
    return { ok: false, fix: `${file} could not be read.` };
  }
  const map = readMap(text, file);
  if (!map.ok) return map;
  if (map.value.sections === undefined) return { ok: false, fix: `${file} names no sections, so it needs an adapter beside it: braindog import <adapter> <export.json> --map ${file}.` };
  return { ok: true, adapter: mapAdapter(map.value), map: map.value };
}

/** Whether a change's `to` can ride in a bundle: one declaration, or a bundle already. A change to one field cannot. */
const bundles = (to: unknown): boolean => isObj(to) && (Array.isArray(to.declarations) || (typeof to.id === 'string' && typeof to.kind === 'string'));

/**
 * THE QUESTIONS A PLAN FILES, MANY ASKS MADE ONE. `asked` is every key Decide already holds, a part's own key among them
 * (`body.parts`), so a part asked on an earlier night is not asked again whichever question it rode in, and `before`
 * counts the questions they were, a group once. Asks of one `group` that are changes become one change installing every part's declarations, in the
 * order the plan gave them, its parts listed by key and label so each can be read, and left out, on its own. A group
 * left with one ask is filed as that ask, under its own key. Everything else is filed as it came.
 */
export function gatherAsks(asks: readonly PlannedAsk[], asked: ReadonlySet<string>): { asks: PlannedAsk[]; before: number } {
  let before = 0;
  const out: PlannedAsk[] = [];
  const groups = new Map<string, PlannedAsk[]>();
  /* A QUESTION ASKED BEFORE IS COUNTED ONCE, however many of its parts it held. */
  const counted = new Set<string>();
  for (const ask of asks) {
    if (asked.has(ask.key)) {
      const one = ask.group === undefined ? null : ask.group.key;
      if (one === null || !counted.has(one)) before++;
      if (one !== null) counted.add(one);
      continue;
    }
    if (ask.group === undefined || (ask.kind ?? 'options') !== 'change' || !bundles(ask.body.to)) {
      out.push(ask);
      continue;
    }
    const held = groups.get(ask.group.key);
    if (held) held.push(ask);
    else {
      groups.set(ask.group.key, [ask]);
      /* ITS PLACE AMONG THE OTHER QUESTIONS IS ITS FIRST PART'S, filled in below. */
      out.push(ask);
    }
  }
  return {
    before,
    asks: out.map((ask) => {
      const parts = ask.group === undefined ? undefined : groups.get(ask.group.key);
      if (parts === undefined || parts[0] !== ask || parts.length < 2) return ask;
      const group = ask.group!;
      const declarations = parts.flatMap((p) => {
        const to = p.body.to as Obj;
        return Array.isArray(to.declarations) ? (to.declarations as unknown[]) : [to];
      });
      /* THE RECORD FILES A BUNDLE UNDER ONE OF THE IDS IT INSTALLS (`namesFault`), so a first part that named none, or
         one the bundle does not hold, is filed under the bundle's first declaration. */
      const ids = declarations.map((d) => (isObj(d) && typeof d.id === 'string' ? d.id : null));
      const named = typeof ask.body.declaration_id === 'string' && ids.includes(ask.body.declaration_id) ? ask.body.declaration_id : ids.find((id) => id !== null);
      return {
        key: group.key,
        label: group.label,
        question: group.question,
        kind: 'change',
        body: { declaration_id: named ?? null, to: { declarations }, from: group.key, parts: parts.map((p) => ({ from: p.key, label: p.label, question: p.question })) },
      };
    }),
  };
}
