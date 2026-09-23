/**
 * Automatic people: someone an agent met in the work, matched to who the record already knows, or
 * added.
 *
 * A PERSON IS MATCHED BY WHAT IDENTIFIES THEM, NEVER BY NAME. An email, then a handle. Two people
 * share a name often enough that joining on it would fold strangers together, so a shared name only
 * asks the owner, as one merge proposal per pair.
 *
 * IT CHANGES AS LITTLE AS IT CAN. A match gains a dated line saying where they were met, the run's
 * project, and whichever of email, name or handle it was missing. Nothing it already holds is
 * overwritten, because what an agent saw in a commit is weaker than what a person typed.
 *
 * THE LIST IS WHICHEVER DECLARES `meets:`, and each field is the one its part names (`roles.ts`). A record older
 * than the key is met into the list called `people` under the parts' own names. A list may leave out `handles` and
 * `projects`: then a handle is refused, and nobody is linked to a project.
 *
 * PEOPLE IS A MODULE THE OWNER MAY SWITCH OFF. Without the list, or without the fields it writes, it refuses and
 * writes nothing.
 *
 * EVERY FIELD'S PATH IS A BOUND PARAMETER, `json_extract(fields, ?)`, now that the field ids come from a declaration
 * rather than from this file. They are `IDENT`-checked at install, so splicing would not have been an injection; a
 * bound path is simply the habit a file reading declared names should have.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './coerce.ts';
import type { Proposal } from './govern.ts';
import { LEGACY, PARTS, plays, type MeetsFields, type Role } from './roles.ts';

/**
 * The list `meet` wrote by name before any list declared `meets:`, and still does while none does. The record's own
 * guard and its members' names gate still name it (`packages/record/src/index.ts`), which is its follow-up to move.
 */
export const PEOPLE = LEGACY.meets;

/** The provenance lines a person keeps, newest last. */
export const MET_CAP = 20;

/** What `meet` is told. At least one of name, email and handle, and always where. */
export type MeetArgs = { name?: string; email?: string; handle?: string; where: string };

/** Who they turned out to be. `merge` is the suggestion this call opened, or `null`. */
export type Met = { person: string; created: boolean; linked: boolean; merge: string | null };

type Row = { id: string; seq: number | null; version: number; fields: Record<string, unknown> };
type FieldShape = { id: string; type: string; of?: string };

export type PeopleDeps = {
  sql: Sql;
  nowMs: number;
  /** The list playing `meets:` with its declared fields, or `undefined` when there is none. */
  list: (Role<MeetsFields> & { declaredFields: readonly FieldShape[] }) | undefined;
  /** The row id of the project the caller's run is in, or `null`. */
  project: () => string | null;
  /** A row as a person says it, `people#3`. */
  nameOf: (id: string) => string;
  /** The write path, as the caller. With `version`, compare-and-set on that row. */
  write: (ref: string | null, patch: Record<string, unknown>, version?: number) => Result<Row>;
  /** Open a suggestion, signed as the caller. */
  propose: (p: Proposal) => Result<{ id: string }>;
};

/** Where a part lives in a row's JSON, for a bound `json_extract` path. */
const path = (field: string): string => `$.${field}`;

const HANDLE = /^([a-z][a-z0-9.-]*):@?([^\s:@][^\s]*)$/;

/** A name as two mentions of one person share it: trimmed, spaces collapsed, lower case. */
const normalName = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** The `met` lines of two lists as one, oldest first, and no more than the cap. Lines start with their day, so they sort. */
/* Ordered by the date alone, and stably, so two meetings on one day keep the order they happened in
   and the cap drops the oldest, never the newest. */
const metLines = (...lists: string[][]): string[] =>
  [...new Set(lists.flat())].sort((a, b) => (a.slice(0, 10) < b.slice(0, 10) ? -1 : a.slice(0, 10) > b.slice(0, 10) ? 1 : 0)).slice(-MET_CAP);

export function meet(deps: PeopleDeps, args: MeetArgs): Result<Met> {
  const list = deps.list;
  if (!list) return no<Met>('REGISTER_UNKNOWN', 'No list declares meets:, so nobody can be met. Nothing was written.', { at: 'register' });
  const at = list.fields;
  const own = list.register;
  /* ASKED AGAIN HERE THOUGH INSTALL ASKS IT, because the named `people` list is never asked at install, and a
     declaring list's row can be written by hand. The fix no longer says "The agents pack declares it": the agents pack
     declares none of these fields, People does, and the first roles survey measured that sentence pointing at the
     wrong pack. The target of `merged_into` and `projects` is install's to check; the named list was never asked it. */
  for (const part of PARTS.meets) {
    const field = at[part.part as keyof MeetsFields];
    if (field === undefined && part.optional === true && list.declared) continue;
    if (field === undefined || !plays(part, list.declaredFields.find((f) => f.id === field)))
      return no<Met>(
        'FIELD_UNKNOWN',
        list.declared
          ? `${own} has no ${field ?? part.part} field that is ${part.says}, which its meets: names for ${part.part}. Nothing was written.`
          : `${own} has no ${part.part} field that is ${part.says}, which meet writes, and it declares no meets: naming another. Nothing was written.`,
        { at: part.part },
      );
  }

  const said = normalise(args);
  if (!said.ok) return said;
  const { name, email, handle, where } = said.value;
  if (handle !== undefined && at.handles === undefined)
    return no<Met>('FIELD_UNKNOWN', `${own}'s meets: names no handles, so there is nowhere to keep a handle. Nothing was written.`, { at: 'handle' });
  const line = `${instant(deps.nowMs).slice(0, 10)} · ${where}`;
  /* NO projects PART, NO PROJECT. The run may well be in one; the list has nowhere to say so. */
  const project = at.projects === undefined ? null : deps.project();

  const hit = (email === undefined ? null : byEmail(deps.sql, list, email)) ?? (handle === undefined ? null : byHandle(deps.sql, list, handle));

  let written: Result<Row>;
  let linked = false;
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
    if (email !== undefined && typeof f[at.email] !== 'string') patch[at.email] = email;
    if (name !== undefined && typeof f[at.name] !== 'string') patch[at.name] = name;
    if (at.handles !== undefined) {
      const handles = listOf(f[at.handles]);
      if (handle !== undefined && !handles.map((h) => h.toLowerCase()).includes(handle)) patch[at.handles] = [...handles, handle];
    }
    written = deps.write(hit.id, patch, hit.version);
  } else {
    linked = project !== null;
    written = deps.write(null, {
      ...(name === undefined ? {} : { [at.name]: name }),
      ...(email === undefined ? {} : { [at.email]: email }),
      ...(handle === undefined || at.handles === undefined ? {} : { [at.handles]: [handle] }),
      ...(project === null || at.projects === undefined ? {} : { [at.projects]: [project] }),
      [at.met]: [line],
    });
  }
  if (!written.ok) return written as Result<Met>;
  const person = written.value;

  const merge = nearMatch(deps, list, person);
  if (!merge.ok) return merge as Result<Met>;
  return ok({ person: deps.nameOf(person.id), created: !hit, linked, merge: merge.value });
}

function normalise(args: MeetArgs): Result<{ name?: string; email?: string; handle?: string; where: string }> {
  const text = (v: unknown, at: string): Result<string | undefined> =>
    v === undefined || v === null ? ok(undefined) : typeof v === 'string' ? ok(v.trim() || undefined) : no('VALUE_MALFORMED', `${at} takes a string.`, { at });

  const where = text(args?.where, 'where');
  if (!where.ok) return where as Result<never>;
  if (where.value === undefined)
    return no('REQUIRED_MISSING', 'Say where they were met, as commit 4464966 in braindog.', { at: 'where' });

  const name = text(args.name, 'name');
  if (!name.ok) return name as Result<never>;
  const email = text(args.email, 'email');
  if (!email.ok) return email as Result<never>;
  const handle = text(args.handle, 'handle');
  if (!handle.ok) return handle as Result<never>;
  if (name.value === undefined && email.value === undefined && handle.value === undefined)
    return no('REQUIRED_MISSING', 'Say who they are: a name, an email or a handle.', { at: 'name' });

  const address = email.value?.toLowerCase();
  if (address !== undefined && !/^[^@\s]+@[^@\s]+$/.test(address))
    return no('VALUE_MALFORMED', 'email takes one address, as name@example.com.', { at: 'email' });

  let tag: string | undefined;
  if (handle.value !== undefined) {
    const m = HANDLE.exec(handle.value.toLowerCase());
    if (!m) return no('VALUE_MALFORMED', 'A handle is provider:name, as github:ada.', { at: 'handle' });
    tag = `${m[1]}:${m[2]}`;
  }

  return ok({
    where: where.value,
    ...(name.value === undefined ? {} : { name: name.value.replace(/\s+/g, ' ') }),
    ...(address === undefined ? {} : { email: address }),
    ...(tag === undefined ? {} : { handle: tag }),
  });
}

/** A row of the list that is neither deleted nor folded into another. Two parameters, bound by `live`. */
const LIVE = 'register = ? AND deleted_at IS NULL AND json_extract(fields, ?) IS NULL';
const live = (list: Role<MeetsFields>): [string, string] => [list.register, path(list.fields.merged_into)];

const hydrate = (r: { id: string; seq: number | null; version: number; fields: string }): Row => ({
  id: r.id,
  seq: r.seq,
  version: Number(r.version),
  fields: JSON.parse(r.fields) as Record<string, unknown>,
});

function byEmail(sql: Sql, list: Role<MeetsFields>, email: string): Row | null {
  const r = sql.one<{ id: string; seq: number | null; version: number; fields: string }>(
    `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND lower(json_extract(fields, ?)) = ? ORDER BY seq LIMIT 1`,
    ...live(list),
    path(list.fields.email),
    email,
  );
  return r ? hydrate(r) : null;
}

/** Asked only when the list names `handles`: `meet` refuses a handle before this otherwise. */
function byHandle(sql: Sql, list: Role<MeetsFields>, handle: string): Row | null {
  if (list.fields.handles === undefined) return null;
  const r = sql.one<{ id: string; seq: number | null; version: number; fields: string }>(
    `SELECT id, seq, version, fields FROM entry WHERE ${LIVE}
       AND EXISTS (SELECT 1 FROM json_each(entry.fields, ?) AS h WHERE lower(h.value) = ?) ORDER BY seq LIMIT 1`,
    ...live(list),
    path(list.fields.handles),
    handle,
  );
  return r ? hydrate(r) : null;
}

/**
 * One merge proposal for a person who shares a name with another, and never a second for the pair.
 *
 * NEVER A SECOND, ANSWERED OR NOT. A pair the owner said no to stays two people, and asking again on
 * every commit would make the question noise. The older row is the one kept.
 */
function nearMatch(deps: PeopleDeps, list: Role<MeetsFields>, person: Row): Result<string | null> {
  const at = list.fields;
  const called = person.fields[at.name];
  if (typeof called !== 'string') return ok(null);
  const others = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND id <> ? AND lower(trim(json_extract(fields, ?))) = ? ORDER BY seq`,
      ...live(list),
      person.id,
      path(at.name),
      normalName(called),
    )
    .map(hydrate);

  const mail = (row: Row): string | null => {
    const v = row.fields[at.email];
    return typeof v === 'string' ? v.toLowerCase() : null;
  };
  const email = mail(person);
  for (const other of others) {
    const theirs = mail(other);
    if (email !== null && email === theirs) continue;

    const [keep, fold] = (other.seq ?? 0) < (person.seq ?? 0) ? [other, person] : [person, other];
    const keepName = deps.nameOf(keep.id);
    const foldName = deps.nameOf(fold.id);
    if (asked(deps.sql, list, keepName, foldName)) continue;

    const patch: Record<string, unknown> = {};
    for (const key of [at.handles, at.projects]) {
      if (key === undefined) continue;
      const now = listOf(keep.fields[key]);
      const union = [...new Set([...now, ...listOf(fold.fields[key])])];
      if (union.length > now.length) patch[key] = union;
    }
    const met = metLines(listOf(keep.fields[at.met]), listOf(fold.fields[at.met]));
    if (JSON.stringify(met) !== JSON.stringify(listOf(keep.fields[at.met]))) patch[at.met] = met;

    const rows = [
      ...(Object.keys(patch).length === 0 ? [] : [{ at: keepName, version: keep.version, patch }]),
      { at: foldName, version: fold.version, patch: { [at.merged_into]: keepName, deleted_at: instant(deps.nowMs) } },
    ];
    const opened = deps.propose({
      question: `Are ${keepName} and ${foldName} the same person, ${String(keep.fields[at.name])}? Accepting folds ${foldName} into ${keepName}.`,
      body_kind: 'rowset',
      body: { register: list.register, rows },
    });
    return opened.ok ? ok(opened.value.id) : (opened as Result<never>);
  }
  return ok(null);
}

/**
 * Whether a rowset on the list already names both of this pair, by the rows it updates or the row it folds into.
 */
function asked(sql: Sql, list: Role<MeetsFields>, a: string, b: string): boolean {
  const bodies = sql.all<{ body: string }>(
    "SELECT body FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = ?",
    list.register,
  );
  return bodies.some(({ body }) => {
    try {
      const rows = (JSON.parse(body) as { rows?: { at?: unknown; patch?: Record<string, unknown> }[] }).rows ?? [];
      const named = new Set(rows.flatMap((r) => [r?.at, r?.patch?.[list.fields.merged_into]]));
      return named.has(a) && named.has(b);
    } catch {
      return false;
    }
  });
}
