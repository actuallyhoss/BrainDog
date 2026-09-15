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
 * PEOPLE IS A MODULE THE OWNER MAY SWITCH OFF, and the fields `meet` writes arrive with the agents
 * pack. Without the register, or without those fields, it refuses and writes nothing.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { instant } from './coerce.ts';
import type { Proposal } from './govern.ts';

/** The register `meet` writes. */
export const PEOPLE = 'people';

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
  /** The people register's fields, or `undefined` when there is no people register. */
  fields: readonly FieldShape[] | undefined;
  /** The row id of the project the caller's run is in, or `null`. */
  project: () => string | null;
  /** A row as a person says it, `people#3`. */
  nameOf: (id: string) => string;
  /** The write path, as the caller. With `version`, compare-and-set on that row. */
  write: (ref: string | null, patch: Record<string, unknown>, version?: number) => Result<Row>;
  /** Open a suggestion, signed as the caller. */
  propose: (p: Proposal) => Result<{ id: string }>;
};

/** The fields `meet` reads and writes, in the shape the agents pack declares them (plan 5.2). */
const NEEDS: readonly { id: string; types: readonly string[]; of?: string; says: string }[] = [
  { id: 'name', types: ['text'], says: 'a text' },
  { id: 'email', types: ['email', 'text'], says: 'an email' },
  { id: 'handles', types: ['list'], of: 'text', says: 'a list of text' },
  { id: 'projects', types: ['list'], of: 'ref', says: 'a list of refs to projects' },
  { id: 'met', types: ['list'], of: 'text', says: 'a list of text' },
  { id: 'merged_into', types: ['ref'], says: 'a ref to people' },
];

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
  if (!deps.fields)
    return no<Met>('REGISTER_UNKNOWN', 'There is no people register, so nobody can be met. Nothing was written.', { at: 'register' });
  for (const need of NEEDS) {
    const field = deps.fields.find((f) => f.id === need.id);
    if (!field || !need.types.includes(field.type) || (need.of !== undefined && field.of !== need.of))
      return no<Met>(
        'FIELD_UNKNOWN',
        `people has no ${need.id} field that is ${need.says}, which meet writes. The agents pack declares it. Nothing was written.`,
        { at: need.id },
      );
  }

  const said = normalise(args);
  if (!said.ok) return said;
  const { name, email, handle, where } = said.value;
  const line = `${instant(deps.nowMs).slice(0, 10)} · ${where}`;
  const project = deps.project();

  const hit = (email === undefined ? null : byEmail(deps.sql, email)) ?? (handle === undefined ? null : byHandle(deps.sql, handle));

  let written: Result<Row>;
  let linked = false;
  if (hit) {
    const f = hit.fields;
    const patch: Record<string, unknown> = { met: metLines(listOf(f.met), [line]) };
    const projects = listOf(f.projects);
    if (project !== null && !projects.includes(project)) {
      patch.projects = [...projects, project];
      linked = true;
    }
    if (email !== undefined && typeof f.email !== 'string') patch.email = email;
    if (name !== undefined && typeof f.name !== 'string') patch.name = name;
    const handles = listOf(f.handles);
    if (handle !== undefined && !handles.map((h) => h.toLowerCase()).includes(handle)) patch.handles = [...handles, handle];
    written = deps.write(hit.id, patch, hit.version);
  } else {
    linked = project !== null;
    written = deps.write(null, {
      ...(name === undefined ? {} : { name }),
      ...(email === undefined ? {} : { email }),
      ...(handle === undefined ? {} : { handles: [handle] }),
      ...(project === null ? {} : { projects: [project] }),
      met: [line],
    });
  }
  if (!written.ok) return written as Result<Met>;
  const person = written.value;

  const merge = nearMatch(deps, person);
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

const LIVE = `register = '${PEOPLE}' AND deleted_at IS NULL AND json_extract(fields, '$.merged_into') IS NULL`;

const hydrate = (r: { id: string; seq: number | null; version: number; fields: string }): Row => ({
  id: r.id,
  seq: r.seq,
  version: Number(r.version),
  fields: JSON.parse(r.fields) as Record<string, unknown>,
});

function byEmail(sql: Sql, email: string): Row | null {
  const r = sql.one<{ id: string; seq: number | null; version: number; fields: string }>(
    `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND lower(json_extract(fields, '$.email')) = ? ORDER BY seq LIMIT 1`,
    email,
  );
  return r ? hydrate(r) : null;
}

function byHandle(sql: Sql, handle: string): Row | null {
  const r = sql.one<{ id: string; seq: number | null; version: number; fields: string }>(
    `SELECT id, seq, version, fields FROM entry WHERE ${LIVE}
       AND EXISTS (SELECT 1 FROM json_each(entry.fields, '$.handles') AS h WHERE lower(h.value) = ?) ORDER BY seq LIMIT 1`,
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
function nearMatch(deps: PeopleDeps, person: Row): Result<string | null> {
  if (typeof person.fields.name !== 'string') return ok(null);
  const others = deps.sql
    .all<{ id: string; seq: number | null; version: number; fields: string }>(
      `SELECT id, seq, version, fields FROM entry WHERE ${LIVE} AND id <> ? AND lower(trim(json_extract(fields, '$.name'))) = ? ORDER BY seq`,
      person.id,
      normalName(person.fields.name),
    )
    .map(hydrate);

  const email = typeof person.fields.email === 'string' ? person.fields.email.toLowerCase() : null;
  for (const other of others) {
    const theirs = typeof other.fields.email === 'string' ? other.fields.email.toLowerCase() : null;
    if (email !== null && email === theirs) continue;

    const [keep, fold] = (other.seq ?? 0) < (person.seq ?? 0) ? [other, person] : [person, other];
    const keepName = deps.nameOf(keep.id);
    const foldName = deps.nameOf(fold.id);
    if (asked(deps.sql, keepName, foldName)) continue;

    const patch: Record<string, unknown> = {};
    for (const key of ['handles', 'projects'] as const) {
      const now = listOf(keep.fields[key]);
      const union = [...new Set([...now, ...listOf(fold.fields[key])])];
      if (union.length > now.length) patch[key] = union;
    }
    const met = metLines(listOf(keep.fields.met), listOf(fold.fields.met));
    if (JSON.stringify(met) !== JSON.stringify(listOf(keep.fields.met))) patch.met = met;

    const rows = [
      ...(Object.keys(patch).length === 0 ? [] : [{ at: keepName, version: keep.version, patch }]),
      { at: foldName, version: fold.version, patch: { merged_into: keepName, deleted_at: instant(deps.nowMs) } },
    ];
    const opened = deps.propose({
      question: `Are ${keepName} and ${foldName} the same person, ${String(keep.fields.name)}? Accepting folds ${foldName} into ${keepName}.`,
      body_kind: 'rowset',
      body: { register: PEOPLE, rows },
    });
    return opened.ok ? ok(opened.value.id) : (opened as Result<never>);
  }
  return ok(null);
}

/** Whether a rowset on people already names both of this pair, by the rows it updates or the row it folds into. */
function asked(sql: Sql, a: string, b: string): boolean {
  const bodies = sql.all<{ body: string }>(
    `SELECT body FROM suggestion WHERE body_kind = 'rowset' AND json_extract(body, '$.register') = '${PEOPLE}'`,
  );
  return bodies.some(({ body }) => {
    try {
      const rows = (JSON.parse(body) as { rows?: { at?: unknown; patch?: { merged_into?: unknown } }[] }).rows ?? [];
      const named = new Set(rows.flatMap((r) => [r?.at, r?.patch?.merged_into]));
      return named.has(a) && named.has(b);
    } catch {
      return false;
    }
  });
}
