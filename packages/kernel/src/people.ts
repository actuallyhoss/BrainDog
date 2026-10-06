/**
 * Automatic people and organisations: someone met in the work, resolved to who the record already knows, or added.
 *
 * RESOLVE, THEN MEET (DIRECTION §38). Everything that comes in is read for who it is about, and the record answers in
 * one identity per person:
 *
 *   1. A KEY MATCH. Every identifier said is a key (`identity-keys.ts`), and `entity_key` holds which row answers to
 *      it. A match gains a dated line saying where they were met and with what source, the run's project, and
 *      whichever identifiers it was missing. Nothing it already holds is overwritten, because what an agent saw in a
 *      commit is weaker than what a person typed. The last day in touch moves forward, never back.
 *   2. A NAME ALONE NEVER MAKES A ROW. Two people share a name often enough that joining on it would fold strangers
 *      together, and making a row for every bare name made the owner's record five "Fofo"s and two of himself. It is
 *      kept as a mention (`entity_mention`), and the caller is told to give an address or a handle.
 *   3. THE STRONG RULES, written by the record as one undoable batch: the same name of two or more words, plus the
 *      same email local part of five or more characters, or a login equal to that local part, or the same organisation
 *      domain. The older row is kept and the newer folded into it, carrying every field the kept row lacks (H2).
 *   4. ONE QUESTION PER CLUSTER for the doubtful rest, worded in names and the evidence for each (M4), never in ids.
 *      Asked once: a pair the owner said no to, or a merge he undid, is never asked about again.
 *
 * NEVER: a person merged with an organisation (they live in two lists, and a key belongs to one row of one list); a row
 * another member made merged by anybody but its maker's say; a merge made without asking while money rows point at
 * both. A shared inbox or a machine sender (`info@`, `noreply@`) is an organisation speaking and never makes a person.
 *
 * THE LISTS ARE WHICHEVER DECLARE `meets:` AND `org:`, and each field is the one its part names (`roles.ts`). A record
 * older than the keys is met into `people` and `organisations` under the parts' own names. A list may leave out
 * `handles` and `projects`: then a handle is refused, and nobody is linked to a project.
 *
 * EVERY FIELD'S PATH IS A BOUND PARAMETER, `json_extract(fields, ?)`, since the field ids come from a declaration.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './coerce.ts';
import { holderOf, holders, nameKey, noteMention, sourceKeys } from './entities.ts';
import type { Proposal } from './govern.ts';
import { githubOfAddress, isOrganisationAddress, isPublicMail, keyFrom, keyOf, keysOf, kindOfKey, parseFrom, registrable, valueOfKey } from './identity-keys.ts';
import { LEGACY, PARTS, plays, type MeetsFields, type OrgFields, type Role } from './roles.ts';

/**
 * The list `meet` wrote by name before any list declared `meets:`, and still does while none does. The record's `meet`
 * guard reads `kernel.meetsList()` and not this name; only its members' names gate, `namesFor`
 * (`packages/record/src/index.ts`), still names `people`, by list and by module.
 */
export const PEOPLE = LEGACY.meets;

/** The provenance lines a person keeps, newest last. */
export const MET_CAP = 20;

/** The most doubtful pairs one night's `infer.resolve` job asks a model about. */
export const RESOLVE_PAIRS_NIGHT = 20;

/**
 * What `meet` is told: at least one of a name, an email, a handle, keys or a domain, and always where (or the source,
 * which says the same: `commit 4464966 in braindog`, `mail from encore.example`, `bank text`).
 *
 * `email` MAY BE A RAW `From` HEADER, `"Ada" <ada@x.com>`, and is read into its name and address.
 */
export type MeetArgs = {
  name?: string;
  email?: string;
  handle?: string;
  keys?: readonly string[];
  kind?: 'person' | 'organisation';
  /** The organisation they are with, by its name or its domain. */
  org?: string;
  domain?: string;
  /** For an organisation, what kind it is (`vendor`, `merchant`); for a person, kept for the record's own guard. */
  role?: string;
  where?: string;
  source?: string;
};

/** The row met, as a person reads it: its list, its id, its number and its name. */
export type MetRow = { register: string; id: string; seq: number | null; name: string };

/**
 * Who they turned out to be.
 *
 * `row` IS `null` FOR A MENTION, a name with nothing that identifies it, and `mention` is then `true`. `matched_by` is
 * `key` for a key match, `strong` when the strong rules folded the new row into one already known, and `none` for a row
 * just added. `question` is the Decide question this call opened about a doubtful cluster, `undo` the batch that undoes
 * a strong merge it made.
 *
 * `person`, `linked` AND `merge` ARE KEPT FOR CALLERS OLDER THAN THE CONTRACT: the row's spoken id, whether it was linked
 * to the caller's project, and the question's id again.
 */
export type Met = {
  row: MetRow | null;
  created: boolean;
  matched_by: 'key' | 'strong' | 'none';
  confidence?: number;
  question?: string;
  mention?: boolean;
  undo?: string;
  person: string | null;
  linked: boolean;
  merge: string | null;
};

type Row = { id: string; seq: number | null; version: number; fields: Record<string, unknown> };
type FieldShape = { id: string; type: string; of?: string; to?: string; values?: readonly string[]; retired?: boolean; derived?: unknown; unique?: boolean };
type DeclaredList<F> = Role<F> & { declaredFields: readonly FieldShape[] };

export type PeopleDeps = {
  sql: Sql;
  nowMs: number;
  mint: () => string;
  /** The list playing `meets:` with its declared fields, or `undefined` when there is none. */
  list: DeclaredList<MeetsFields> | undefined;
  /** The list playing `org:`, or `undefined`. */
  orgs?: DeclaredList<OrgFields> | undefined;
  /** The row id of the project the caller's run is in, or `null`. */
  project: () => string | null;
  /** A row as the record addresses it, `people#3`. Never shown to a person: question bodies only. */
  nameOf: (id: string) => string;
  /** A row's own name, `Ada Lovelace`, or `null`. What every sentence says. */
  titleOf: (id: string) => string | null;
  /** The write path, as the caller. With `version`, compare-and-set on that row; with `batch` and `note`, as a group. */
  write: (register: string, ref: string | null, patch: Record<string, unknown>, opts?: { version?: number; batch?: string; note?: string }) => Result<Row>;
  /** Open a suggestion, signed as the caller. */
  propose: (p: Proposal) => Result<{ id: string }>;
  /** Whether a member other than the owner made this row, so nobody merges it but by asking them. */
  othersRow?: (id: string) => boolean;
  /** Whether a live row holding money points at this one. */
  moneyAt?: (id: string) => boolean;
  /** Run writes so a refusal takes back every one of them (`tx.ts`'s `attempt`). */
  attempt?: <T>(fn: () => Result<T>) => Result<T>;
};

/** Where a part lives in a row's JSON, for a bound `json_extract` path. */
const path = (field: string): string => `$.${field}`;

const HANDLE = /^([a-z][a-z0-9.-]*):@?([^\s:@][^\s]*)$/;

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The later of a day and what a row holds, `undefined` for neither; a value that is not a day counts as none. */
const later = (a: unknown, b: unknown): string | undefined => {
  const days = [a, b].filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return days.at(-1);
};

/** The `met` lines of two lists as one, oldest first, and no more than the cap. Lines start with their day, so they sort. */
/* Ordered by the date alone, and stably, so two meetings on one day keep the order they happened in
   and the cap drops the oldest, never the newest. */
const metLines = (...lists: string[][]): string[] =>
  [...new Set(lists.flat())].sort((a, b) => (a.slice(0, 10) < b.slice(0, 10) ? -1 : a.slice(0, 10) > b.slice(0, 10) ? 1 : 0)).slice(-MET_CAP);

/** Legal endings an organisation's name carries in one source and not another: `Quartz Apps LLC` is `Quartz Apps`. */
const LEGAL = /\s+(?:llc|l\.l\.c\.|ltd|limited|inc|incorporated|corp|corporation|co|company|gmbh|ag|sa|s\.a\.|sae|s\.a\.e\.|plc|bv|b\.v\.|pty|pvt|private|fze|fzco|fz-llc)\.?$/i;
const orgNameKey = (name: string): string => {
  let said = nameKey(name);
  for (let i = 0; i < 2 && LEGAL.test(` ${said}`); i++) said = ` ${said}`.replace(LEGAL, '').trim();
  return said;
};

/** A name with its spaces and punctuation gone, as a login or a local part spells the same person: `rohanmehta`. */
const compact = (name: string): string => nameKey(name).replace(/[^\p{L}\p{N}]/gu, '');

/** What `meet` was told, read and checked. */
type Said = {
  name?: string;
  email?: string;
  handle?: string;
  keys: string[];
  kind: 'person' | 'organisation';
  org?: string;
  domain?: string;
  role?: string;
  source: string;
};

function normalise(args: MeetArgs): Result<Said> {
  const text = (v: unknown, at: string): Result<string | undefined> =>
    v === undefined || v === null ? ok(undefined) : typeof v === 'string' ? ok(v.trim() || undefined) : no('VALUE_MALFORMED', `${at} takes a string.`, { at });

  const read: Record<string, string | undefined> = {};
  for (const at of ['where', 'source', 'name', 'email', 'handle', 'org', 'domain', 'role'] as const) {
    const got = text((args as Record<string, unknown> | undefined)?.[at], at);
    if (!got.ok) return got as Result<never>;
    read[at] = got.value;
  }
  const source = read.where ?? read.source;
  if (source === undefined) return no('REQUIRED_MISSING', 'Say where they were met, as commit 4464966 in braindog.', { at: 'where' });

  const kind = args.kind ?? 'person';
  if (kind !== 'person' && kind !== 'organisation')
    return no('VALUE_MALFORMED', 'kind is person or organisation.', { at: 'kind', allowed: ['person', 'organisation'] });

  const keys: string[] = [];
  if (args.keys !== undefined) {
    if (!Array.isArray(args.keys)) return no('VALUE_MALFORMED', 'keys takes a list of kind:value, as github:ada.', { at: 'keys' });
    for (const [i, raw] of (args.keys as unknown[]).entries()) {
      const key = typeof raw === 'string' ? keyFrom(raw) : null;
      if (key === null) return no('VALUE_MALFORMED', 'A key is kind:value, as email:ada@example.com, github:ada or bank:chillout.', { at: `keys[${i}]` });
      if (!keys.includes(key)) keys.push(key);
    }
  }

  /* A RAW `From` HEADER IS READ INTO ITS TWO HALVES, so a mail rule passing the header whole meets the sender and not a
     refusal. A name in the header is the sender's only when nobody said one. */
  let name = read.name?.replace(/\s+/g, ' ');
  let email: string | undefined;
  if (read.email !== undefined) {
    const from = parseFrom(read.email);
    if (from === null) return no('VALUE_MALFORMED', 'email takes one address, as name@example.com.', { at: 'email' });
    email = from.address;
    name ??= from.name ?? undefined;
  }

  let handle: string | undefined;
  if (read.handle !== undefined) {
    const m = HANDLE.exec(read.handle.toLowerCase());
    if (!m) return no('VALUE_MALFORMED', 'A handle is provider:name, as github:ada.', { at: 'handle' });
    handle = `${m[1]}:${m[2]}`;
  }
  let domain: string | undefined;
  if (read.domain !== undefined) {
    domain = registrable(read.domain) ?? undefined;
    if (domain === undefined && !isPublicMail(read.domain.toLowerCase()))
      return no('VALUE_MALFORMED', 'domain takes a domain an organisation registered, as encore.example.', { at: 'domain' });
  }

  if (name === undefined && email === undefined && handle === undefined && keys.length === 0 && domain === undefined)
    return no('REQUIRED_MISSING', 'Say who they are: a name, an email or a handle.', { at: 'name' });

  return ok({
    source,
    kind,
    keys,
    ...(name === undefined ? {} : { name }),
    ...(email === undefined ? {} : { email }),
    ...(handle === undefined ? {} : { handle }),
    ...(read.org === undefined ? {} : { org: read.org }),
    ...(domain === undefined ? {} : { domain }),
    ...(read.role === undefined ? {} : { role: read.role }),
  });
}

/** Whether a declared list has every part it must, with a field that plays it. A refusal names the first that is not. */
function partsFault<F extends object>(list: DeclaredList<F>, role: 'meets' | 'org'): Result<never> | null {
  const at = list.fields as Partial<Record<string, string>>;
  const own = list.register;
  for (const part of PARTS[role]) {
    const field = at[part.part];
    if (field === undefined && part.optional === true && (list.declared || part.later === true)) continue;
    if (field === undefined || !plays(part, list.declaredFields.find((f) => f.id === field)))
      return no(
        'FIELD_UNKNOWN',
        list.declared
          ? `${own} has no ${field ?? part.part} field that is ${part.says}, which its ${role}: names for ${part.part}. Nothing was written.`
          : `${own} has no ${part.part} field that is ${part.says}, which meet writes, and it declares no ${role}: naming another. Nothing was written.`,
        { at: part.part },
      );
  }
  return null;
}

/** A row of the list that is neither deleted nor folded into another. Two parameters, bound by `live`. */
const LIVE = 'register = ? AND deleted_at IS NULL AND (? IS NULL OR json_extract(fields, ?) IS NULL)';
const live = (register: string, mergedInto: string | undefined): [string, string | null, string] => [
  register,
  mergedInto === undefined ? null : path(mergedInto),
  path(mergedInto ?? '_none'),
];

const hydrate = (r: { id: string; seq: number | null; version: number; fields: string }): Row => ({
  id: r.id,
  seq: r.seq,
  version: Number(r.version),
  fields: JSON.parse(r.fields) as Record<string, unknown>,
});

const rowById = (sql: Sql, id: string): Row | null => {
  const r = sql.one<{ id: string; seq: number | null; version: number; fields: string }>('SELECT id, seq, version, fields FROM entry WHERE id = ? AND deleted_at IS NULL', id);
  return r ? hydrate(r) : null;
};

/** The answer for a name met with nothing that identifies it. */
const mention = (): Met => ({ row: null, created: false, matched_by: 'none', mention: true, person: null, linked: false, merge: null });

export function meet(deps: PeopleDeps, args: MeetArgs): Result<Met> {
  const list = deps.list;
  const said = normalise(args);
  /* WHICH LIST, FIRST: a person's, unless they said organisation or the address is a shared inbox or a machine. */
  const toOrg = said.ok && (said.value.kind === 'organisation' || (said.value.email !== undefined && isOrganisationAddress(said.value.email)));
  if (!toOrg) {
    if (!list) return no<Met>('REGISTER_UNKNOWN', 'No list declares meets:, so nobody can be met. Nothing was written.', { at: 'register' });
    const fault = partsFault(list, 'meets');
    if (fault) return fault;
  }
  if (!said.ok) return said as Result<Met>;
  const s = said.value;
  if (s.handle !== undefined && !toOrg && list!.fields.handles === undefined && list!.fields.keys === undefined)
    return no<Met>('FIELD_UNKNOWN', `${list!.register}'s meets: names no handles, so there is nowhere to keep a handle. Nothing was written.`, { at: 'handle' });
  return toOrg ? meetOrg(deps, s, s.kind === 'person') : meetPerson(deps, list!, s);
}

/** The dated line a meeting leaves, and the day it is. */
const lineOf = (deps: PeopleDeps, s: Said): { day: string; line: string } => {
  const day = instant(deps.nowMs).slice(0, 10);
  return { day, line: `${day} · ${s.source}` };
};

function meetPerson(deps: PeopleDeps, list: DeclaredList<MeetsFields>, s: Said): Result<Met> {
  const at = list.fields;
  const { day, line } = lineOf(deps, s);
  /* NO projects PART, NO PROJECT. The run may well be in one; the list has nowhere to say so. */
  const project = at.projects === undefined ? null : deps.project();
  /* A DOMAIN IS AN ORGANISATION'S KEY, NEVER A PERSON'S: a person holding one would keep it from the organisation. */
  const keys = keysOf({ email: s.email, handle: s.handle, keys: s.keys }).filter((k) => kindOfKey(k) !== 'domain');
  /* A NAME ALONE IS A MENTION, kept with where it was seen, and no row. */
  if (keys.length === 0) {
    noteMention(deps.sql, { name: s.name ?? '', kind: 'person', project, source: s.source, at: instant(deps.nowMs) });
    return ok(mention());
  }

  const found = holders(deps.sql, list.register, keys);
  const org = orgFor(deps, s, keys);
  let written: Result<Row>;
  let linked = false;
  const hit = found[0] ? rowById(deps.sql, found[0].id) : null;
  if (hit) {
    const f = hit.fields;
    const patch: Record<string, unknown> = { [at.met]: metLines(listOf(f[at.met]), [line]) };
    if (at.projects !== undefined) {
      const projects = listOf(f[at.projects]);
      if (project !== null && !projects.includes(project)) {
        patch[at.projects] = [...projects, project];
        linked = true;
      }
    }
    if (at.in_touch !== undefined && later(day, f[at.in_touch]) === day) patch[at.in_touch] = day;
    Object.assign(patch, carryKeys(deps, list, hit, s, keys));
    if (s.name !== undefined && typeof f[at.name] !== 'string') patch[at.name] = s.name;
    if (at.org !== undefined && org !== null && textOf(f[at.org]) === undefined) patch[at.org] = org;
    written = deps.write(list.register, hit.id, patch, { version: hit.version });
  } else {
    linked = project !== null;
    const login = keys.find((k) => kindOfKey(k) === 'github');
    const local = s.email?.split('@')[0];
    const name = s.name ?? (login === undefined ? local : valueOfKey(login)) ?? valueOfKey(keys[0]!);
    const placed = placeKeys(list, keys, s);
    written = deps.write(list.register, null, {
      [at.name]: name,
      ...placed,
      ...(project === null || at.projects === undefined ? {} : { [at.projects]: [project] }),
      ...(at.in_touch === undefined ? {} : { [at.in_touch]: day }),
      ...(at.org === undefined || org === null ? {} : { [at.org]: org }),
      [at.met]: [line],
    });
  }
  if (!written.ok) return written as Result<Met>;
  const person = written.value;
  sourceKeys(deps.sql, person.id, keys, s.source);

  /* THE MEETING BRIDGED TWO PEOPLE THE RECORD HELD APART: one key was one row's and another key another's. Never
     joined on its own, since one wrong key would fold two people; asked. */
  const bridged = found.slice(1).map((h) => rowById(deps.sql, h.id)).filter((r): r is Row => r !== null);
  const settled = settle(deps, list, person, bridged);
  if (!settled.ok) return settled as Result<Met>;
  const { kept, undo, question } = settled.value;
  const final = kept ?? person;
  return ok({
    row: metRow(deps, list.register, final),
    created: !hit && kept === null,
    matched_by: hit ? 'key' : kept !== null ? 'strong' : 'none',
    ...(hit ? { confidence: 1 } : kept !== null ? { confidence: 0.95 } : {}),
    ...(question === null ? {} : { question }),
    ...(undo === null ? {} : { undo }),
    person: deps.nameOf(final.id),
    linked,
    merge: question,
  });
}

const metRow = (deps: PeopleDeps, register: string, row: Row): MetRow => ({
  register,
  id: row.id,
  seq: row.seq,
  name: deps.titleOf(row.id) ?? String(row.fields[deps.list?.fields.name ?? 'name'] ?? ''),
});

/**
 * Where a new person's keys go: the email field takes a real mailbox, `handles` takes logins, and `keys` the rest. A
 * key the list has nowhere for is not written, and the person simply does not answer to it.
 */
function placeKeys(list: DeclaredList<MeetsFields>, keys: readonly string[], s: Said): Record<string, unknown> {
  const at = list.fields;
  const out: Record<string, unknown> = {};
  const emailKey = keys.find((k) => kindOfKey(k) === 'email');
  /* THE ADDRESS AS SAID, since the key folds Gmail's dots and a person reads their own spelling. */
  if (emailKey !== undefined && s.email !== undefined && keyOf('email', s.email) === emailKey) out[at.email] = s.email;
  const rest = keys.filter((k) => !(k === emailKey && out[at.email] !== undefined));
  const handles = rest.filter((k) => kindOfKey(k) !== 'email' && kindOfKey(k) !== 'bank' && kindOfKey(k) !== 'domain');
  const others = rest.filter((k) => !handles.includes(k));
  if (at.handles !== undefined && handles.length > 0) out[at.handles] = handles;
  const kept = at.handles === undefined ? rest : others;
  if (at.keys !== undefined && kept.length > 0) out[at.keys] = kept;
  return out;
}

/** What a matched person gains of the keys this meeting carried, in the fields it already has. Nothing is replaced. */
function carryKeys(deps: PeopleDeps, list: DeclaredList<MeetsFields>, row: Row, s: Said, keys: readonly string[]): Record<string, unknown> {
  const at = list.fields;
  const f = row.fields;
  const has = new Set(keysOf({ email: textOf(f[at.email]), handles: at.handles === undefined ? [] : listOf(f[at.handles]), keys: at.keys === undefined ? [] : listOf(f[at.keys]) }));
  /* ONLY A KEY NOBODY ELSE ANSWERS TO: one held by another live row stays theirs, and the bridge is asked about. */
  const fresh = keys.filter((k) => !has.has(k) && (holderOf(deps.sql, k)?.id ?? row.id) === row.id);
  const placed = placeKeys(list, fresh, s);
  const patch: Record<string, unknown> = {};
  if (placed[at.email] !== undefined && textOf(f[at.email]) === undefined) patch[at.email] = placed[at.email];
  else if (placed[at.email] !== undefined) {
    const into = at.keys ?? at.handles;
    if (into !== undefined) placed[into] = [...listOf(placed[into]), keyOf('email', String(placed[at.email]))!];
  }
  for (const part of [at.handles, at.keys]) {
    if (part === undefined || placed[part] === undefined) continue;
    const now = listOf(f[part]);
    const union = [...new Set([...now, ...listOf(placed[part])])];
    if (union.length > now.length) patch[part] = union;
  }
  return patch;
}

/**
 * The organisation a person is with, as a row id, or `null`: the one named, or the one whose domain their address is
 * at. Only one the record already holds, unless they named a domain, which is a key and may add one.
 */
function orgFor(deps: PeopleDeps, s: Said, keys: readonly string[]): string | null {
  const orgs = deps.orgs;
  if (!orgs || deps.list?.fields.org === undefined) return null;
  if (s.domain !== undefined || s.org !== undefined) {
    const met = meetOrg(deps, { kind: 'organisation', keys: [], source: s.source, ...(s.org === undefined ? {} : { name: s.org }), ...(s.domain === undefined ? {} : { domain: s.domain }) }, false);
    if (met.ok && met.value.row) return met.value.row.id;
  }
  const mail = keys.find((k) => kindOfKey(k) === 'email');
  const domain = mail === undefined ? null : registrable(valueOfKey(mail));
  if (domain === null) return null;
  const held = holderOf(deps.sql, `domain:${domain}`);
  return held !== null && held.register === orgs.register ? held.id : null;
}

/**
 * An organisation: matched by a key (its domain, a payee as a bank writes it, a shared inbox) or by its name with the
 * legal ending folded, which for an organisation is a key too; added only when it carries a key the list can keep.
 *
 * `rerouted` IS A PERSON'S MEETING THAT TURNED OUT TO BE A SHARED INBOX, and with no list of organisations it is only a
 * mention: it never falls back to making a person.
 */
function meetOrg(deps: PeopleDeps, s: Said, rerouted: boolean): Result<Met> {
  const orgs = deps.orgs;
  if (!orgs) {
    if (rerouted) {
      noteMention(deps.sql, { name: s.name ?? s.email ?? '', kind: 'organisation', project: deps.project(), source: s.source, at: instant(deps.nowMs) });
      return ok(mention());
    }
    return no<Met>('REGISTER_UNKNOWN', 'No list declares org:, so no organisation can be met. Nothing was written.', { at: 'kind' });
  }
  const fault = partsFault(orgs, 'org');
  if (fault) return fault;
  const at = orgs.fields;
  const { line } = lineOf(deps, s);
  const project = at.projects === undefined ? null : deps.project();

  const fromMail = s.email === undefined ? undefined : (registrable(s.email.split('@')[1] ?? '') ?? undefined);
  const domain = s.domain ?? fromMail;
  /* A SHARED INBOX IS THE ORGANISATION'S KEY; GITHUB'S PRIVATE ADDRESS NEVER REACHES HERE, being a person's. */
  const keys = keysOf({ keys: s.keys, domain, email: s.email !== undefined && githubOfAddress(s.email) === null ? s.email : undefined, handle: s.handle });
  const said = rerouted ? senderName(s.name, domain) : s.name;
  const name = said ?? domain ?? (keys[0] === undefined ? undefined : valueOfKey(keys[0]));

  let hit = holders(deps.sql, orgs.register, keys)[0];
  if (!hit && name !== undefined) {
    const named = byOrgName(deps.sql, orgs, name);
    if (named) hit = { id: named.id, keys: [] };
  }
  const row = hit ? rowById(deps.sql, hit.id) : null;
  const kind = kindValue(orgs, s.role);
  let written: Result<Row>;
  if (row) {
    const f = row.fields;
    const patch: Record<string, unknown> = {};
    if (at.met !== undefined) patch[at.met] = metLines(listOf(f[at.met]), [line]);
    if (at.projects !== undefined && project !== null && !listOf(f[at.projects]).includes(project)) patch[at.projects] = [...listOf(f[at.projects]), project];
    if (at.domain !== undefined && domain !== undefined && textOf(f[at.domain]) === undefined && holderOf(deps.sql, `domain:${domain}`) === null) patch[at.domain] = domain;
    if (at.kind !== undefined && kind !== undefined && textOf(f[at.kind]) === undefined) patch[at.kind] = kind;
    if (at.keys !== undefined) {
      const now = listOf(f[at.keys]);
      const fresh = keys.filter((k) => !k.startsWith('domain:') && !now.includes(k) && holderOf(deps.sql, k) === null);
      if (fresh.length > 0) patch[at.keys] = [...now, ...fresh];
    }
    if (Object.keys(patch).length === 0) return ok(orgMet(deps, orgs.register, row, false));
    written = deps.write(orgs.register, row.id, patch, { version: row.version });
  } else {
    const stored = keys.filter((k) => !(k === `domain:${domain}` && at.domain !== undefined));
    const keepable = (at.domain !== undefined && domain !== undefined) || (at.keys !== undefined && stored.length > 0);
    if (!keepable || name === undefined) {
      noteMention(deps.sql, { name: name ?? '', kind: 'organisation', project, source: s.source, at: instant(deps.nowMs) });
      return ok(mention());
    }
    written = deps.write(orgs.register, null, {
      [at.name]: name,
      ...(at.domain === undefined || domain === undefined ? {} : { [at.domain]: domain }),
      ...(at.keys === undefined || stored.length === 0 ? {} : { [at.keys]: stored }),
      ...(at.kind === undefined || kind === undefined ? {} : { [at.kind]: kind }),
      ...(at.met === undefined ? {} : { [at.met]: [line] }),
      ...(at.projects === undefined || project === null ? {} : { [at.projects]: [project] }),
    });
  }
  if (!written.ok) return written as Result<Met>;
  sourceKeys(deps.sql, written.value.id, keys, s.source);
  return ok(orgMet(deps, orgs.register, written.value, !row));
}

const orgMet = (deps: PeopleDeps, register: string, row: Row, created: boolean): Met => ({
  row: { register, id: row.id, seq: row.seq, name: deps.titleOf(row.id) ?? String(row.fields[deps.orgs?.fields.name ?? 'name'] ?? '') },
  created,
  matched_by: created ? 'none' : 'key',
  ...(created ? {} : { confidence: 1 }),
  person: deps.nameOf(row.id),
  linked: false,
  merge: null,
});

/**
 * The organisation's name in a machine's `From`, or `undefined` when the name there is not the organisation's.
 *
 * A NOTIFICATION IS SIGNED BY WHOEVER ACTED, NOT BY THE SENDER: GitHub writes `"Ada Lovelace" <notifications@github.com>`
 * and Slack `"Rohan (via Slack)"`. So the name is the organisation's only when one of its words is in the domain
 * (`Stripe` at stripe.com, `HSBC UK` at hsbc.co.uk), and the part after "via" is read first.
 */
function senderName(name: string | undefined, domain: string | undefined): string | undefined {
  if (name === undefined || domain === undefined) return name;
  const via = /\(?\bvia\s+([^()]+?)\)?\s*$/i.exec(name)?.[1]?.trim();
  const said = via || name;
  const label = domain.split('.')[0]!.replace(/[^a-z0-9]/g, '');
  const words = nameKey(said).split(' ').map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length >= 3);
  return words.some((w) => label.includes(w) || (label.length >= 3 && w.includes(label))) ? said : undefined;
}

/** The kind an organisation is said to be, when the list's field takes it. */
function kindValue(orgs: DeclaredList<OrgFields>, role: string | undefined): string | undefined {
  if (role === undefined || orgs.fields.kind === undefined) return undefined;
  const field = orgs.declaredFields.find((f) => f.id === orgs.fields.kind);
  const said = role.toLowerCase();
  return field?.type === 'enum' ? (field.values?.includes(said) ? said : undefined) : said;
}

function byOrgName(sql: Sql, orgs: DeclaredList<OrgFields>, name: string): Row | null {
  const want = orgNameKey(name);
  if (want === '') return null;
  const first = want.split(' ')[0]!;
  return (
    sql
      .all<{ id: string; seq: number | null; version: number; fields: string }>(
        `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND lower(json_extract(fields, ?)) LIKE ? ORDER BY seq`,
        ...live(orgs.register, orgs.fields.merged_into),
        path(orgs.fields.name),
        `%${first.replace(/[%_]/g, '')}%`,
      )
      .map(hydrate)
      .find((r) => typeof r.fields[orgs.fields.name] === 'string' && orgNameKey(String(r.fields[orgs.fields.name])) === want) ?? null
  );
}

/* ── who else they might be ──────────────────────────────────────────── */

/** A person's identifiers, read off the row: emails as `{local, domain}`, logins, and the org they are with. */
function identity(list: DeclaredList<MeetsFields>, row: Row): { emails: { local: string; domain: string }[]; logins: string[]; org: string | null } {
  const at = list.fields;
  const keys = keysOf({ email: textOf(row.fields[at.email]), handles: at.handles === undefined ? [] : listOf(row.fields[at.handles]), keys: at.keys === undefined ? [] : listOf(row.fields[at.keys]) });
  const emails = keys
    .filter((k) => kindOfKey(k) === 'email')
    .map((k) => {
      const [local = '', domain = ''] = valueOfKey(k).split('@');
      return { local: local.replace(/\+.*$/, ''), domain };
    });
  return {
    emails,
    logins: keys.filter((k) => kindOfKey(k) === 'github').map(valueOfKey),
    org: at.org === undefined ? null : (textOf(row.fields[at.org]) ?? null),
  };
}

const nameOfRow = (list: DeclaredList<MeetsFields>, row: Row): string => textOf(row.fields[list.fields.name]) ?? '';

/**
 * Whether the strong rules say two people are one: the same name of two or more words, and the same email local part
 * of five or more characters, or a login equal to the other's local part, or the same organisation (by a domain that
 * is not a public mail host, or by the org they are linked to).
 */
function strong(list: DeclaredList<MeetsFields>, a: Row, b: Row): boolean {
  const name = nameKey(nameOfRow(list, a));
  if (name === '' || name.split(' ').length < 2 || name !== nameKey(nameOfRow(list, b))) return false;
  const x = identity(list, a);
  const y = identity(list, b);
  const locals = (i: typeof x) => new Set(i.emails.map((e) => e.local).filter((l) => l.length >= 5));
  const [lx, ly] = [locals(x), locals(y)];
  if ([...lx].some((l) => ly.has(l))) return true;
  if (x.logins.some((l) => ly.has(l)) || y.logins.some((l) => lx.has(l))) return true;
  const domains = (i: typeof x) => new Set(i.emails.map((e) => e.domain).filter((d) => !isPublicMail(d)));
  const dy = domains(y);
  if ([...domains(x)].some((d) => dy.has(d))) return true;
  return x.org !== null && x.org === y.org;
}

/**
 * Whether two people may be one, worth a question: the same name, or one name the other's initial ("Ahmed H." and
 * "Sam Avery"), or one's login or local part spelling the other's name ("rohanmehta" and "Rohan Mehta").
 */
function similar(list: DeclaredList<MeetsFields>, a: Row, b: Row): boolean {
  const [na, nb] = [nameKey(nameOfRow(list, a)), nameKey(nameOfRow(list, b))];
  if (na === '' || nb === '') return false;
  if (na === nb) return true;
  const [ca, cb] = [compact(na), compact(nb)];
  if (ca.length >= 5 && ca === cb) return true;
  const spelled = (row: Row) => {
    const i = identity(list, row);
    return new Set([...i.logins, ...i.emails.map((e) => e.local)].map((s) => s.replace(/[^a-z0-9]/g, '')).filter((s) => s.length >= 5));
  };
  if ((cb.length >= 5 && spelled(a).has(cb)) || (ca.length >= 5 && spelled(b).has(ca))) return true;
  const [ta, tb] = [na.split(' '), nb.split(' ')];
  if (ta.length < 2 || tb.length < 2 || ta[0] !== tb[0] || ta[0]!.length < 2) return false;
  const [sa, sb] = [ta[1]!.replace(/\.$/, ''), tb[1]!.replace(/\.$/, '')];
  return (sa.length === 1 && sb.startsWith(sa)) || (sb.length === 1 && sa.startsWith(sb));
}

/** The live people who may be this one, oldest first: a narrow read in SQL, then `similar`. */
function candidates(deps: PeopleDeps, list: DeclaredList<MeetsFields>, person: Row): Row[] {
  const at = list.fields;
  const name = nameKey(nameOfRow(list, person));
  if (name === '') return [];
  const first = name.split(' ')[0]!.replace(/[%_\\]/g, '');
  const spelled = [compact(name), ...identity(list, person).logins, ...identity(list, person).emails.map((e) => e.local)].filter((s) => s.length >= 5);
  const byKey = spelled.length === 0
    ? []
    : deps.sql
        .all<{ row_id: string }>(
          `SELECT DISTINCT row_id FROM entity_key WHERE register = ? AND row_id <> ? AND (${spelled.map(() => "key = 'github:' || ? OR key LIKE 'email:' || ? || '@%'").join(' OR ')})`,
          list.register,
          person.id,
          ...spelled.flatMap((s) => [s, s]),
        )
        .map((r) => r.row_id);
  const rows = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND id <> ? AND (lower(json_extract(fields, ?)) LIKE ? OR replace(lower(json_extract(fields, ?)), ' ', '') IN (${spelled.length === 0 ? "''" : spelled.map(() => '?').join(', ')}) OR id IN (${byKey.length === 0 ? "''" : byKey.map(() => '?').join(', ')})) ORDER BY seq`,
      ...live(list.register, at.merged_into),
      person.id,
      path(at.name),
      `${first}%`,
      path(at.name),
      ...spelled,
      ...byKey,
    )
    .map(hydrate);
  return rows.filter((r) => similar(list, person, r));
}

/**
 * After a person is met: fold them into the one the strong rules say they are, or ask once about the doubtful rest.
 *
 * `bridged` ARE ROWS THIS MEETING'S OWN KEYS FOUND BESIDE THE ONE IT MATCHED, always asked, never folded.
 */
function settle(deps: PeopleDeps, list: DeclaredList<MeetsFields>, person: Row, bridged: Row[]): Result<{ kept: Row | null; undo: string | null; question: string | null }> {
  const fresh = rowById(deps.sql, person.id) ?? person;
  const others = [...bridged, ...candidates(deps, list, fresh).filter((c) => !bridged.some((b) => b.id === c.id))];
  const mine = (r: Row) => deps.othersRow?.(r.id) === true;
  const doubtful: Row[] = [];
  for (const other of others) {
    if (mine(other) || mine(fresh)) continue;
    if (refused(deps, list, fresh, other)) continue;
    const bridge = bridged.some((b) => b.id === other.id);
    if (!bridge && strong(list, fresh, other) && !(deps.moneyAt?.(fresh.id) && deps.moneyAt?.(other.id))) {
      const [keep, fold] = order(list, fresh, other);
      const note = `Merged ${deps.titleOf(fold.id) ?? 'a duplicate'} into ${deps.titleOf(keep.id) ?? 'the person already known'}: the same name and the same address or organisation.`;
      /* A MERGE THE RECORD REFUSES IS ASKED INSTEAD, and its writes taken back: a link that cannot move (a desk only one
         person may hold) must not stop the meeting itself, on this call and every one after it. */
      const merged = deps.attempt ? deps.attempt(() => fold_(deps, list, keep, [fold], note)) : fold_(deps, list, keep, [fold], note);
      if (merged.ok) return ok({ kept: rowById(deps.sql, keep.id), undo: merged.value, question: null });
      if (!deps.attempt) return merged as Result<never>;
    }
    /* NOT BESIDE ONE HE SAID IS SOMEBODY ELSE: a question about three, two of whom he kept apart, would fold them. */
    if (doubtful.some((d) => refused(deps, list, d, other))) continue;
    doubtful.push(other);
  }
  if (doubtful.length === 0) return ok({ kept: null, undo: null, question: null });
  const asked = askCluster(deps, list, [fresh, ...doubtful]);
  return asked.ok ? ok({ kept: null, undo: null, question: asked.value }) : (asked as Result<never>);
}

/** Which of two is kept: the record's own person always, then the older. */
function order(list: DeclaredList<MeetsFields>, a: Row, b: Row): [Row, Row] {
  const self = list.fields.self;
  if (self !== undefined && a.fields[self] === true && b.fields[self] !== true) return [a, b];
  if (self !== undefined && b.fields[self] === true && a.fields[self] !== true) return [b, a];
  return (b.seq ?? 0) < (a.seq ?? 0) ? [b, a] : [a, b];
}

/**
 * What the kept row gains from the folded ones (H2): every field it leaves empty, filled from the first fold that has
 * it; every list joined; the later day in touch; and each fold's address, kept as a key when the kept row has its own.
 * A fold's other name joins `aliases`.
 */
function carried(list: DeclaredList<MeetsFields>, keep: Row, folds: readonly Row[]): Record<string, unknown> {
  const at = list.fields;
  const patch: Record<string, unknown> = {};
  const now = (field: string): unknown => (field in patch ? patch[field] : keep.fields[field]);
  const skip = new Set([at.merged_into, at.self].filter((f): f is string => f !== undefined));
  for (const fold of folds) {
    for (const f of list.declaredFields) {
      if (f.retired === true || f.derived !== undefined || skip.has(f.id) || f.id.startsWith('_')) continue;
      const theirs = fold.fields[f.id];
      if (theirs === undefined || theirs === null) continue;
      const ours = now(f.id);
      if (f.type === 'list') {
        const union = f.id === at.met ? metLines(listOf(ours), listOf(theirs)) : [...new Set([...listOf(ours), ...listOf(theirs)])];
        if (!same(union, ours ?? [])) patch[f.id] = union;
      } else if (ours === undefined || ours === null || ours === '') patch[f.id] = theirs;
    }
    if (at.in_touch !== undefined) {
      const touched = later(now(at.in_touch), fold.fields[at.in_touch]);
      if (touched !== undefined && touched !== now(at.in_touch)) patch[at.in_touch] = touched;
    }
    /* THE FOLD'S ADDRESS IS NEVER LOST: the kept row holds its own, so the other one goes in as a key. */
    const theirs = textOf(fold.fields[at.email]);
    const into = at.keys ?? at.handles;
    if (theirs !== undefined && textOf(now(at.email)) !== theirs && into !== undefined) {
      const key = keyOf('email', theirs);
      if (key !== null && !listOf(now(into)).includes(key)) patch[into] = [...listOf(now(into)), key];
    }
    const named = textOf(fold.fields[at.name]);
    if (at.aliases !== undefined && named !== undefined && nameKey(named) !== nameKey(textOf(now(at.name)) ?? '') && !listOf(now(at.aliases)).includes(named))
      patch[at.aliases] = [...listOf(now(at.aliases)), named];
  }
  return patch;
}

/**
 * Fold rows into one, now, as one batch the record can undo (`undoMerge` in `index.ts`). Each fold is pointed at the
 * kept row first, which moves every row that pointed at it there too (the write path's merge step), then taken out;
 * the kept row gains what they carried last, once the address it may take is free. Answers the batch.
 */
function fold_(deps: PeopleDeps, list: DeclaredList<MeetsFields>, keep: Row, folds: readonly Row[], note: string): Result<string> {
  const batch = deps.mint();
  const register = list.register;
  for (const fold of folds) {
    const pointed = deps.write(register, fold.id, { [list.fields.merged_into]: keep.id }, { version: fold.version, batch, note });
    if (!pointed.ok) return pointed as Result<never>;
    const gone = deps.write(register, fold.id, { deleted_at: instant(deps.nowMs) }, { version: pointed.value.version, batch, note });
    if (!gone.ok) return gone as Result<never>;
  }
  const kept = rowById(deps.sql, keep.id) ?? keep;
  const patch = carried(list, kept, folds);
  if (Object.keys(patch).length > 0) {
    const wrote = deps.write(register, kept.id, patch, { version: kept.version, batch, note });
    if (!wrote.ok) return wrote as Result<never>;
  }
  return ok(batch);
}

/** What a person is known by, for a question: where they were met, how often, what they answer to. Never an id. */
function evidence(deps: PeopleDeps, list: DeclaredList<MeetsFields>, row: Row): string {
  const at = list.fields;
  const said: string[] = [];
  const org = at.org === undefined ? undefined : textOf(row.fields[at.org]);
  const orgName = org === undefined ? null : deps.titleOf(org);
  if (orgName) said.push(orgName);
  if (at.projects !== undefined)
    for (const p of listOf(row.fields[at.projects]).slice(0, 2)) {
      const named = deps.titleOf(p);
      if (named && named !== orgName) said.push(named);
    }
  const met = listOf(row.fields[at.met]).length;
  if (met > 0) said.push(met === 1 ? 'met once' : `met ${met} times`);
  const i = identity(list, row);
  const work = [...new Set(i.emails.map((e) => e.domain).filter((d) => !isPublicMail(d)))];
  if (work.length > 0) said.push(`an address at ${work.slice(0, 2).join(' and ')}`);
  else if (i.emails.length > 0) said.push('a personal address');
  if (i.logins.length > 0) said.push('GitHub');
  return said.length === 0 ? '' : ` (${said.join(', ')})`;
}

/** Names as a sentence lists them: `A`, `A and B`, `A, B and C`. */
const listed = (names: readonly string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * One question for a cluster of people who may be one, in names and evidence: "Are Rohan Mehta (Encore, met 6 times)
 * and rohanmehta (GitHub) one person?" Accepting it folds every other into the oldest, carrying what they hold.
 *
 * THE FOLDS COME FIRST IN THE BODY, the kept row last, so an address moving to the kept row is free by the time it
 * arrives (the email field is unique among live rows).
 */
function askCluster(deps: PeopleDeps, list: DeclaredList<MeetsFields>, rows: readonly Row[], confidence?: number): Result<string | null> {
  const sorted = [...rows].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const keep = sorted.reduce((k, r) => order(list, k, r)[0], sorted[0]!);
  const folds = sorted.filter((r) => r.id !== keep.id);
  if (folds.length === 0) return ok(null);
  const keepName = deps.nameOf(keep.id);
  const patch = carried(list, keep, folds);
  const body = {
    register: list.register,
    rows: [
      ...folds.map((f) => ({ at: deps.nameOf(f.id), version: f.version, patch: { [list.fields.merged_into]: keepName, deleted_at: instant(deps.nowMs) } })),
      ...(Object.keys(patch).length === 0 ? [] : [{ at: keepName, version: keep.version, patch }]),
    ],
    /* THE NAMES IT IS ABOUT, for the merge card Decide draws: each by its handle, with where they were seen and which one
       Yes keeps. The rows above are what accepting writes; this is only what the card reads. */
    candidates: sorted.map((r) => ({ at: deps.nameOf(r.id), name: nameOfRow(list, r) || 'someone unnamed', seen: seenOf(deps, list, r), ...(r.id === keep.id ? { kept: true } : {}) })),
  };
  const named = (r: Row) => `${nameOfRow(list, r) || 'someone unnamed'}${evidence(deps, list, r)}`;
  const one = nameOfRow(list, keep) || 'the first';
  const likely = confidence === undefined ? '' : ' They look likely to be.';
  const question = `Are ${listed(sorted.map(named))} one person?${likely} Yes keeps ${one} and carries over the other${folds.length === 1 ? "'s" : "s'"} addresses, handles and where they were met.`;
  const opened = deps.propose({ question, body_kind: 'rowset', body });
  return opened.ok ? ok(opened.value.id) : (opened as Result<never>);
}

/**
 * Whether a pair is settled against merging: a question that named both, answered or not, or a merge of the two that
 * was undone. Asking again on every commit would make the question noise, and an undo is a no.
 */
function refused(deps: Pick<PeopleDeps, 'sql' | 'nameOf'>, list: DeclaredList<MeetsFields>, a: Row, b: Row): boolean {
  const [x, y] = [deps.nameOf(a.id), deps.nameOf(b.id)];
  const bodies = deps.sql.all<{ body: string }>("SELECT body FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = ?", list.register);
  const asked = bodies.some(({ body }) => {
    try {
      const rows = (JSON.parse(body) as { rows?: { at?: unknown; patch?: Record<string, unknown> }[] }).rows ?? [];
      const named = new Set(rows.flatMap((r) => [r?.at, r?.patch?.[list.fields.merged_into]]));
      return named.has(x) && named.has(y);
    } catch {
      return false;
    }
  });
  if (asked) return true;
  /* AN UNDONE MERGE IS A `merged_into` THAT WENT FROM ONE OF THE PAIR BACK TO NOTHING. */
  return deps.sql.one<{ n: number }>(
    `SELECT 1 AS n FROM event WHERE kind = 'edit' AND field = ? AND to_v IS NULL
       AND ((target = ? AND instr(from_v, ?) > 0) OR (target = ? AND instr(from_v, ?) > 0)) LIMIT 1`,
    list.fields.merged_into,
    `entry:${a.id}`,
    b.id,
    `entry:${b.id}`,
    a.id,
  ) !== undefined;
}

/* ── the nightly question to a model ─────────────────────────────────── */

/** One side of a pair as a model sees it: a name, where they were seen, and no address. */
export type ResolveSide = { name: string; kind: 'person' | 'organisation'; domain?: string; masked?: string; seen: string[] };

/**
 * An `infer.resolve` job: the pairs, and which two rows each hash is about. `rows` is the record's, read back by the
 * ack; a host builds the model's prompt from `pairs` alone.
 */
export type ResolveJob = { pairs: { hash: string; a: ResolveSide; b: ResolveSide }[]; rows: Record<string, [string, string]> };

/** A stable name for a pair, the same whichever way round: FNV-1a over the two ids, sorted. */
export function pairHash(a: string, b: string): string {
  const text = [a, b].sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** A local part as a model may see it: its first and last letter and how long it is, `s*********a`. */
const masked = (local: string): string => (local.length <= 2 ? '*'.repeat(local.length) : `${local[0]}${'*'.repeat(local.length - 2)}${local.at(-1)}`);

/**
 * Tonight's doubtful pairs, at most `RESOLVE_PAIRS_NIGHT`, or `null` when there are none or a job is already out, or
 * one went out in the last twenty hours. A pair already asked, refused, undone, or handed to a model before is not
 * handed again.
 */
export function resolveJob(deps: Pick<PeopleDeps, 'sql' | 'nowMs' | 'list' | 'nameOf' | 'titleOf'>, max = RESOLVE_PAIRS_NIGHT): ResolveJob | null {
  const list = deps.list;
  if (!list) return null;
  const since = instant(deps.nowMs - 20 * 3_600_000);
  if (deps.sql.one("SELECT 1 AS n FROM outbox WHERE kind = 'infer.resolve' AND (state IN ('pending', 'leased', 'failed') OR created > ?) LIMIT 1", since)) return null;
  const sent = new Set<string>();
  /* ONLY A JOB THAT WAS ANSWERED COUNTS, and only for the pairs its answer spoke about (`answeredOnly` rewrites a done
     job's payload to those). A job that died, or a pair the host could not show a model, is handed again another night. */
  for (const { payload } of deps.sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.resolve' AND state = 'done'")) {
    try {
      for (const hash of Object.keys((JSON.parse(payload) as ResolveJob).rows ?? {})) sent.add(hash);
    } catch {
      /* a payload nobody can read names no pair */
    }
  }
  const people = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} ORDER BY seq DESC LIMIT 2000`,
      ...live(list.register, list.fields.merged_into),
    )
    .map(hydrate);
  /* BUCKETED, NOT EVERY PAIR: two thousand people are two million pairs, and `similar` only ever says yes to two that
     share a first word, or where one's name run together is the other's login or local part. So each person is filed
     under those words, and only people sharing a bucket are compared. */
  const buckets = new Map<string, Row[]>();
  const file = (word: string, row: Row): void => {
    if (word === '') return;
    const held = buckets.get(word) ?? [];
    if (!held.includes(row)) buckets.set(word, [...held, row]);
  };
  for (const row of people) {
    const name = nameKey(nameOfRow(list, row));
    file(`first:${name.split(' ')[0] ?? ''}`, row);
    const run = compact(name);
    if (run.length >= 5) file(`run:${run}`, row);
    const i = identity(list, row);
    for (const s of [...i.logins, ...i.emails.map((e) => e.local)].map((x) => x.replace(/[^a-z0-9]/g, ''))) if (s.length >= 5) file(`run:${s}`, row);
  }
  const job: ResolveJob = { pairs: [], rows: {} };
  const seen = new Set<string>();
  for (const held of buckets.values())
    for (let i = 0; i < held.length && job.pairs.length < max; i++)
      for (let j = i + 1; j < held.length && job.pairs.length < max; j++) {
        const [a, b] = [held[i]!, held[j]!];
        const hash = pairHash(a.id, b.id);
        if (seen.has(hash)) continue;
        seen.add(hash);
        if (sent.has(hash) || !similar(list, a, b) || strong(list, a, b) || refused(deps, list, a, b)) continue;
        job.pairs.push({ hash, a: sideOf(deps, list, a), b: sideOf(deps, list, b) });
        job.rows[hash] = [a.id, b.id];
      }
  return job.pairs.length === 0 ? null : job;
}

function sideOf(deps: Pick<PeopleDeps, 'titleOf'>, list: DeclaredList<MeetsFields>, row: Row): ResolveSide {
  const i = identity(list, row);
  const work = i.emails.find((e) => !isPublicMail(e.domain));
  const local = i.emails[0]?.local ?? i.logins[0];
  return {
    name: nameOfRow(list, row),
    kind: 'person',
    ...(work === undefined ? {} : { domain: work.domain }),
    ...(local === undefined ? {} : { masked: masked(local) }),
    seen: seenOf(deps, list, row),
  };
}

/** Where somebody was seen, in at most three plain phrases: their projects by name, then where they were met, newest first. */
function seenOf(deps: Pick<PeopleDeps, 'titleOf'>, list: DeclaredList<MeetsFields>, row: Row): string[] {
  const at = list.fields;
  const seen = [
    ...(at.projects === undefined ? [] : listOf(row.fields[at.projects]).map((p) => deps.titleOf(p)).filter((t): t is string => t !== null)),
    ...listOf(row.fields[at.met]).map((l) => l.slice(l.indexOf(' · ') + 3)).reverse(),
  ];
  return [...new Set(seen)].slice(0, 3);
}

/**
 * A done job's payload cut to the pairs its answer spoke about, so `resolveJob` hands the rest again on a later night. A
 * host answers at most forty pairs and says nothing about one it could not show, and silence is not a verdict.
 */
export function answeredOnly(payload: string, result: unknown): string {
  let job: Partial<ResolveJob>;
  try {
    job = JSON.parse(payload) as Partial<ResolveJob>;
  } catch {
    return payload;
  }
  const said = (result as { verdicts?: unknown } | null | undefined)?.verdicts;
  const answered = new Set(
    (Array.isArray(said) ? (said as { hash?: unknown }[]) : []).map((v) => v?.hash).filter((h): h is string => typeof h === 'string'),
  );
  return JSON.stringify({
    pairs: (job.pairs ?? []).filter((p) => answered.has(p.hash)),
    rows: Object.fromEntries(Object.entries(job.rows ?? {}).filter(([hash]) => answered.has(hash))),
  });
}

/**
 * A model's answer to an `infer.resolve` job, filed: a pair it is at least 0.6 sure of becomes the cluster question,
 * worded as any other and saying it looks likely; under that is left alone, and the pair is never handed again. The
 * answer may speak only about the pairs it was handed: a hash the job did not carry is passed by.
 *
 * NOTHING IS MERGED ON A MODEL'S WORD. A model only proposes (`slash.ts`); a merge made without asking is the strong
 * rules', which are the record's own.
 */
export function fileVerdicts(deps: PeopleDeps, payload: string, result: unknown): Result<string[]> {
  const list = deps.list;
  if (!list) return ok([]);
  let job: Partial<ResolveJob>;
  try {
    job = JSON.parse(payload) as Partial<ResolveJob>;
  } catch {
    return ok([]);
  }
  const said = (result as { verdicts?: unknown } | null | undefined)?.verdicts;
  if (!Array.isArray(said)) return no('VALUE_MALFORMED', 'An answer about pairs carries verdicts: [{ hash, same, confidence }].', { at: 'result.verdicts' });
  const opened: string[] = [];
  for (const v of said as { hash?: unknown; same?: unknown; confidence?: unknown }[]) {
    const pair = typeof v?.hash === 'string' ? job.rows?.[v.hash] : undefined;
    const confidence = typeof v?.confidence === 'number' ? v.confidence : 0;
    if (!pair || v.same !== true || confidence < 0.6) continue;
    const [a, b] = [rowById(deps.sql, pair[0]), rowById(deps.sql, pair[1])];
    if (!a || !b || deps.othersRow?.(a.id) === true || deps.othersRow?.(b.id) === true || refused(deps, list, a, b)) continue;
    const asked = askCluster(deps, list, [a, b], confidence);
    if (!asked.ok) return asked as Result<never>;
    if (asked.value !== null) opened.push(asked.value);
  }
  return ok(opened);
}
