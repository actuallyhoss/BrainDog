/**
 * WHERE A ROW APPLIES, AND ONE PRESS TO MOVE IT (agents C8).
 *
 * A list with a `scope` field holds rows that belong to one project or to every project: a learning, a skill, a tool,
 * a key. That field was drawn as one more ref among the facts, so "applies everywhere" was an empty value, a chip
 * reading "+ Where it applies", which says the row is missing something when it is the widest a row can be. This file
 * is the one place that reads the field, names where a row applies, lists where it could go and writes the move, so
 * the chip on a row's page, the chip in a list and the chip in Decide say the same thing about the same row.
 *
 * A MOVE IS AN ORDINARY EDIT, made as the person, with a note. `client.update` with the one field and the version the
 * page read, and the note "Moved to Kiln", so the row's history says what happened in words. There is no method of its
 * own: a token still cannot widen a row, because the kernel refuses that write whoever sends it (`scope.ts`
 * `scopeFault`), and this file adds no second copy of the rule.
 *
 * ROUTE-ONLY, like `row-live.ts`: the client carries the route table as a value.
 */

import { createClient } from '@braindog/client';
import { copy } from '../copy.ts';
import { REGISTERS } from './held.ts';
import { learn, type Names, type RecordRow } from './remote.ts';
import type { Fetch } from './row-live.ts';
import type { FieldDecl } from './schema.ts';

/**
 * Where a row applies, as the chip draws it: the project's spoken id, its name, its mark and its hue. `null` in place
 * of the whole is everywhere. A project that declares no mark or no hue carries `null` in that half, as the kernel's
 * `scope_marks` answers it.
 */
export type Scope = { spoken: string; name: string; mark: string | null; hue: number | null };

/**
 * A project a row can be moved to: the chip it wears, the row id the write sends, and `ref`, its `<list>#<n>` form,
 * which the kernel takes for a ref as it takes the list's own prefix (`coerce.ts`), so a proposal may name it that way.
 */
export type Place = Scope & { id: string; ref: string };

/** What the move reads and writes, in one place. */
export const words = {
  everywhere: 'Everywhere',
  /** The chip as a button, for a screen reader: where the row applies now, and what pressing it does. */
  moveLabel: (name: string) => `Where it applies: ${name}. Move it`,
  movedTo: (name: string) => `Moved to ${name}`,
  /** The one sentence asked before a key is opened to every project (agents C8). */
  widenKey: 'Any machine with a vault grant for every project can open it.',
  widenGo: 'Move to Everywhere',
  current: 'Where it applies now',
  noPlaces: 'BrainDog could not reach this record.',
  /** The press under `noPlaces`, which reads the projects again (design SYS-8). */
  retry: 'Retry',
  /** A project this tab could not name is still a project, and never its id. */
  someProject: 'A project',
} as const;

/**
 * HOW MANY PROJECTS THE MENU WALKS, AT MOST, which is two pages of the record's `list`. A list of projects is short,
 * and a menu of more names than this is one nobody reads to the end, so the walk stops here rather than paging on.
 */
export const PLACES_MOST = 1000;

/** One page of the walk: the record's own ceiling for a `list`. */
const PAGE = 500;

/**
 * The field that says where a row of this list applies, or `undefined` for a list with none.
 *
 * THE FIELD THAT DECLARES `scope:` AND IS NOT RETIRED, which is the kernel's own reading (`scope.ts` `scopeFieldOf`).
 * The app's mirror of a field does not type `scope`, and the record's declaration carries it on the same object, so it
 * is read as an own key rather than asserted.
 */
export function scopeFieldOf(register: string): FieldDecl | undefined {
  return REGISTERS[register]?.fields.find((f) => Object.hasOwn(f, 'scope') && (f as FieldDecl & { scope?: unknown }).scope !== undefined && !f.retired);
}

/**
 * Whether one press can move a row of this list: its scope field is a ref to one project. A LIST OF PROJECTS is not
 * moved by one press, since "Everywhere" is not a list, and it is edited as the field it is.
 */
export const movable = (field: FieldDecl | undefined): field is FieldDecl & { to: string } =>
  field !== undefined && field.type === 'ref' && typeof field.to === 'string' && field.to !== '';

/** A hue the host can draw, a whole degree from 0 to 359, or `null`: the kernel's own test (`pages.ts` `markOf`). */
const hueOf = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 359 ? v : null);

/** A project's spoken id: its list's own prefix where it declares one, as a run is `S12`. */
const spokenOf = (to: string, seq: number): string => {
  const prefix = REGISTERS[to]?.seq_prefix;
  return prefix ? `${prefix}${seq}` : `${to}#${seq}`;
};

/**
 * Where one row applies, from the row as this app holds it: `null` for everywhere, and `undefined` for a list whose
 * rows do not say. A ref arrives as its row's number (`remote.ts` `entryOf`), and `names` is the record's title and
 * mark for that number; a project the record did not name is "A project", never its number.
 *
 * A ROW THAT NAMES SEVERAL PROJECTS is named by all of them and marked by the first, as the kernel names it
 * (`pages.ts` `scopesOf`), because a chip draws one mark.
 */
export function scopeOf(register: string, fields: Readonly<Record<string, unknown>>, names?: Names): Scope | null | undefined {
  const field = scopeFieldOf(register);
  if (!field?.to) return undefined;
  const to = field.to;
  const value = fields[field.id];
  const said = (Array.isArray(value) ? value : [value]).filter((v): v is number | string => (typeof v === 'number' || typeof v === 'string') && v !== '');
  const first = said[0];
  if (first === undefined) return null;
  const nameOf = (v: number | string): string => names?.get(`${to}#${v}`) ?? words.someProject;
  const mark = names?.marks?.get(`${to}#${first}`);
  return {
    spoken: typeof first === 'number' ? spokenOf(to, first) : first,
    name: said.map(nameOf).join(', '),
    mark: mark && mark.mark !== '' ? mark.mark : null,
    hue: mark ? hueOf(mark.hue) : null,
  };
}

/**
 * Whether a move opens a KEY to every project: the list holds a sealed value (`secret`), and the row goes from one
 * project to everywhere. That one move is asked about first (agents C8), because it hands the key to every machine
 * that holds a grant for all projects, which is more than the person who pressed it may have in mind.
 */
export function widens(register: string, from: Scope | null, to: Place | null): boolean {
  return from !== null && to === null && (REGISTERS[register]?.fields.some((f) => f.type === 'secret' && !f.retired) ?? false);
}

/** A project as the menu offers it, from a row of its list as `list` answers it. */
function placeOf(to: string, row: RecordRow): Place | null {
  if (row.seq === null) return null;
  const decl = REGISTERS[to];
  const title = decl ? row.fields[decl.title] : undefined;
  const mark = decl?.identity ? row.fields[decl.identity.mark] : undefined;
  return {
    id: row.id,
    ref: `${to}#${row.seq}`,
    spoken: spokenOf(to, row.seq),
    name: typeof title === 'string' && title.trim() !== '' ? title : words.someProject,
    mark: typeof mark === 'string' && mark.trim() !== '' ? mark : null,
    hue: decl?.identity ? hueOf(row.fields[decl.identity.accent]) : null,
  };
}

/* ONE WALK A LIST FOR THE TAB, so the menu opened twice and Decide drawing three moves ask once. A walk that failed is
   dropped, so the next opening asks again rather than holding the failure for the life of the tab. */
const walked = new Map<string, Promise<Place[] | null>>();
/* The lists this module has asked the record to declare, which `learn` asks about once each. */
const asked = new Map<string, Promise<void>>();

/**
 * Every project a row can be moved to, in the order the record lists them, or `null` when the record would not list
 * them. At most `PLACES_MOST`.
 */
export function placesIn(base: string, to: string, io?: Fetch): Promise<Place[] | null> {
  const key = `${base} ${to}`;
  const kept = walked.get(key);
  if (kept) return kept;
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const walk = (async (): Promise<Place[] | null> => {
    /* THE LIST IS LEARNED FIRST, because its title and its identity fields are what a place is named and marked by,
       and Decide may be the first screen in the tab to read the projects at all. */
    await learn(client.schema, to, asked);
    const out: Place[] = [];
    let cursor: string | null = null;
    do {
      const got = await client.list({ register: to, limit: PAGE, ...(cursor === null ? {} : { cursor }) });
      if (!got.ok) return null;
      for (const r of got.value.rows as RecordRow[]) {
        const place = placeOf(to, r);
        if (place) out.push(place);
      }
      cursor = got.value.cursor;
    } while (cursor !== null && out.length < PLACES_MOST);
    return out.slice(0, PLACES_MOST);
  })();
  walked.set(key, walk);
  void walk.then((got) => {
    if (got === null) walked.delete(key);
  });
  return walk;
}

/**
 * A place by what a proposal named it with: its row id, its spoken id, or its `<list>#<n>` form. A proposal written by
 * an agent may name a project any of those ways, and one this tab cannot find is left unnamed rather than drawn by its id.
 */
export const placeNamed = (places: readonly Place[] | null, said: string | null): Place | null | undefined =>
  said === null ? null : (places?.find((p) => p.id === said || p.spoken === said || p.ref === said) ?? undefined);

export type Moved = { ok: true; version: number } | { ok: false; fix: string; stale: boolean };

/**
 * Move one row to a project, or to everywhere with `null`, as the person, against the version they read.
 *
 * `name` IS THE ROW'S TITLE, for the sentence a conflict says: "Kiln deploy key was changed somewhere else first".
 */
export async function moveScope(
  base: string,
  move: { register: string; seq: number; version: number; field: string; to: Place | null; name: string },
  io?: Fetch,
): Promise<Moved> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.update({
    register: move.register,
    seq: move.seq,
    version: move.version,
    patch: { [move.field]: move.to?.id ?? null },
    note: words.movedTo(move.to?.name ?? words.everywhere),
  });
  if (out.ok) {
    const version = (out.value as { version?: unknown } | null)?.version;
    return { ok: true, version: typeof version === 'number' ? version : move.version + 1 };
  }
  if ('conflict' in out || out.refusal.code === 'VERSION_STALE') return { ok: false, fix: copy.writeConflict(move.name), stale: true };
  if (out.refusal.code === 'UNREACHABLE') return { ok: false, fix: copy.writeNotReached, stale: false };
  return { ok: false, fix: out.refusal.fix, stale: false };
}
