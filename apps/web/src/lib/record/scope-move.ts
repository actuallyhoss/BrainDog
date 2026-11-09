/**
 * WHERE A ROW APPLIES, AND ONE PRESS TO MOVE IT.
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
  /** What "Everywhere" means, said where the chip is pointed at: it belongs to no one project. */
  everywhereSaid: 'Not tied to one project: it shows in all of them.',
  /** The chip as a button, for a screen reader: where the row applies now, and what pressing it does. */
  moveLabel: (name: string) => `Where it applies: ${name}. Move it`,
  movedTo: (name: string) => `Moved to ${name}`,
  /** The one sentence asked before a key is opened to every project. */
  widenKey: 'Any machine with keychain access for every project can open it.',
  widenGo: 'Move to Everywhere',
  current: 'Where it applies now',
  noPlaces: 'BrainDog could not be reached.',
  /** The press under `noPlaces`, which reads the projects again. */
  retry: 'Try again',
  /** A project this tab could not name is still a project, and never its id. */
  someProject: 'A project',
  /** The verb on the bar over a selection, and the sheet's title. */
  moveMany: 'Move to…',
  /** Under the sheet's title: how many the press moves. */
  picked: (n: number) => `${n} selected`,
  movedMany: (n: number, name: string) => `Moved ${n} to ${name}.`,
  wereThere: (n: number) => (n === 1 ? '1 was already there.' : `${n} were already there.`),
  allThere: (n: number, name: string) => (n === 1 ? `It was already at ${name}.` : `All ${n} were already at ${name}.`),
  notMoved: (n: number) => (n === 1 ? '1 did not move.' : `${n} did not move.`),
  /** The verb on the bar of the list that keeps people: it asks on Decide whether the ones picked are the same one. */
  foldMany: 'Fold into one',
  /** The note on the way back, and the sentence once it is done. */
  movedBack: 'Moved back',
  backMany: (n: number) => `Moved ${n} back.`,
  /** The question before several keys are opened to every project, as `widenKey` asks it of one. */
  widenKeys: (n: number) => (n === 1 ? 'Any machine with keychain access for every project can open it.' : `Any machine with keychain access for every project can open all ${n}.`),
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
 * EACH PROJECT A ROW NAMES, AS ITS OWN CHIP (3 Nov): a person on two projects wore one chip, "Ferment & Co, Tidepool",
 * which opened neither. Each is its own place, its own mark and hue, and its own ref, so its chip can open its page.
 * Empty for a list whose rows say nothing about where they apply, or a row that names no project.
 */
export function scopesOf(register: string, fields: Readonly<Record<string, unknown>>, names?: Names): (Scope & { ref: string })[] {
  const field = scopeFieldOf(register);
  if (!field?.to) return [];
  const to = field.to;
  const value = fields[field.id];
  const said = (Array.isArray(value) ? value : [value]).filter((v): v is number | string => (typeof v === 'number' || typeof v === 'string') && v !== '');
  return said.map((v) => {
    const mark = names?.marks?.get(`${to}#${v}`);
    return {
      spoken: typeof v === 'number' ? spokenOf(to, v) : v,
      name: names?.get(`${to}#${v}`) ?? words.someProject,
      mark: mark && mark.mark !== '' ? mark.mark : null,
      hue: mark ? hueOf(mark.hue) : null,
      ref: `${to}#${v}`,
    };
  });
}

/**
 * Whether a move opens a KEY to every project: the list holds a sealed value (`secret`), and the row goes from one
 * project to everywhere. That one move is asked about first, because it hands the key to every machine
 * that holds a grant for all projects, which is more than the person who pressed it may have in mind.
 */
export function widens(register: string, from: Scope | null, to: Place | null): boolean {
  return from !== null && to === null && (REGISTERS[register]?.fields.some((f) => f.type === 'secret' && !f.retired) ?? false);
}

/* ── ONE PRESS, WHEREVER THE CHIP IS ─────────────────────────────────────────────────────────────────────────────────
   The row's own page, a list's table and its cards open the same sheet (`[seq]/ScopeMove.svelte`), and what they decide
   about a press is decided here once, so the three cannot come apart. */

/**
 * What a press on a place in the sheet does: `here` where the row applies there already, which closes the sheet and
 * writes nothing; `ask` where it would open a key to every project (`widens`); `move` for every other place.
 */
export function choiceOf(register: string, from: Scope | null, to: Place | null): 'here' | 'ask' | 'move' {
  if (to === null ? from === null : from?.spoken === to.spoken) return 'here';
  return widens(register, from, to) ? 'ask' : 'move';
}

/**
 * Whether a row's chip on this list is the move: the reader may write the list, and its rows apply to one project. A
 * list whose rows name several projects keeps the chip without the move, as the row's page does (`movable`).
 */
export const movesIn = (register: string, writes: boolean): boolean => writes && movable(scopeFieldOf(register));

/**
 * The keys that open the move from a grid's cell, where the chip is not a tab stop of its own: Enter and Space, with
 * no modifier, since a modifier is the list's.
 */
export const opensMove = (e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean =>
  (e.key === 'Enter' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey;

/** A move that landed: the row, the version the write answered, and where it went. */
export type Landed = { seq: number; version: number; to: Place | null };

/**
 * The version the next write on a row goes against, and where its chip says it applies.
 *
 * A LIST READS ITS ROWS AGAIN ON THE SHELL'S NEXT POLL, NOT ON THE PRESS, so until it has, the row it holds is the row
 * from before the move: the chip would name the old project and a second move would be refused as written over. The
 * move's own answer stands in until a read at least as new arrives, and a row changed somewhere else since wins.
 */
export function afterMove(
  row: { seq: number; version: number },
  scope: Scope | null | undefined,
  landed: Landed | null | undefined,
): { version: number; scope: Scope | null | undefined } {
  if (!landed || landed.seq !== row.seq || row.version >= landed.version) return { version: row.version, scope };
  return { version: landed.version, scope: landed.to };
}

/** A project as the menu offers it, from a row of its list as `list` answers it. */
function placeOf(to: string, row: RecordRow): Place | null {
  if (row.seq === null) return null;
  const decl = REGISTERS[to];
  const title = decl ? row.fields[decl.title] : undefined;
  const mark = decl?.identity?.mark ? row.fields[decl.identity.mark] : undefined;
  return {
    id: row.id,
    ref: `${to}#${row.seq}`,
    spoken: spokenOf(to, row.seq),
    name: typeof title === 'string' && title.trim() !== '' ? title : words.someProject,
    mark: typeof mark === 'string' && mark.trim() !== '' ? mark : null,
    hue: decl?.identity?.accent ? hueOf(row.fields[decl.identity.accent]) : null,
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
  return movedOf(out, move.version, move.name);
}

/** What one write answered, as a move reads it: the version it made, or the sentence to say and whether to read again. */
function movedOf(out: Awaited<ReturnType<MoveClient['update']>>, version: number, name: string): Moved {
  if (out.ok) {
    const made = (out.value as { version?: unknown } | null)?.version;
    return { ok: true, version: typeof made === 'number' ? made : version + 1 };
  }
  if ('conflict' in out || out.refusal.code === 'VERSION_STALE') return { ok: false, fix: copy.writeConflict(name), stale: true };
  if (out.refusal.code === 'UNREACHABLE') return { ok: false, fix: copy.writeNotReached, stale: false };
  return { ok: false, fix: out.refusal.fix, stale: false };
}

/* ── MANY AT ONCE ────────────────────────────────────────────────────────────────────────────────────────────────────
   The bar over a list's selection moves every one picked with one press (`parts/BulkBar.svelte`). The record has no
   write that moves several under one name, so the gesture is kept together here: each one is an ordinary edit with the
   same note, sent one at a time so a refusal is the record's answer about that one, and what comes back is ONE answer
   with ONE way back, which writes each that moved to where it was at the version its move answered. */

/** The one write a move makes, so a test hands in a client that keeps what it was sent. */
export type MoveClient = Pick<ReturnType<typeof createClient>, 'update'>;

/** The client a screen moves with, for the record at `base`. */
export const moverAt = (base: string, io?: Fetch): MoveClient => createClient({ base, ...(io ? { fetch: io } : {}) });

/** One picked: its number, the version the list read, what it holds, and its title for the sentence a conflict says. */
export type MoveRow = { seq: number; version: number; fields: Readonly<Record<string, unknown>>; name: string };

/**
 * What a move of many answers. `ask` is the one question, with how many keys the move would open to every project and
 * nothing written. Otherwise: each that moved with the version it now has, how many were there already, how many the
 * record refused with the first reason, which of those changed somewhere else first, and the one way back, `null` where
 * nothing moved or where going back would open a key to every project (a move to be made with its question).
 */
export type MovedMany =
  | { ask: true; widening: number }
  | { ask: false; moved: { seq: number; version: number }[]; skipped: number; failed: number; fix: string | null; stale: number[]; undo: (() => Promise<MovedMany>) | null };

/** What a field holds as one place, or `null` for everywhere. A ref arrives as its row's number (`remote.ts` `entryOf`). */
const heldOf = (value: unknown): number | string | null => {
  const first = Array.isArray(value) ? value[0] : value;
  return (typeof first === 'number' || typeof first === 'string') && first !== '' ? first : null;
};

/** Whether what a field holds is this place already, by any of the three ways a place is named. */
const isAt = (list: string, held: number | string | null, to: Place | null): boolean =>
  to === null ? held === null : held !== null && (typeof held === 'number' ? `${list}#${held}` === to.ref : held === to.id || held === to.spoken || held === to.ref);

/**
 * Move every one of `rows` to a project, or to everywhere with `null`, as the person.
 *
 * ONE ALREADY THERE IS SKIPPED AND COUNTED, so the sentence can say so and its history gains no line that says nothing.
 * KEYS GOING TO EVERYWHERE ARE ASKED ABOUT FIRST (`widens`): the call answers `ask` and writes nothing until it is made
 * again with `confirmed`.
 */
export async function moveMany(client: MoveClient, register: string, rows: readonly MoveRow[], to: Place | null, opts: { confirmed?: boolean } = {}): Promise<MovedMany> {
  const field = scopeFieldOf(register);
  if (!movable(field)) return { ask: false, moved: [], skipped: 0, failed: rows.length, fix: null, stale: [], undo: null };
  const sealed = REGISTERS[register]?.fields.some((f) => f.type === 'secret' && !f.retired) ?? false;
  const going = rows.filter((r) => !isAt(field.to, heldOf(r.fields[field.id]), to));
  if (sealed && to === null && going.length > 0 && !opts.confirmed) return { ask: true, widening: going.length };

  const landed: { row: MoveRow; version: number; from: number | string | null }[] = [];
  const stale: number[] = [];
  let fix: string | null = null;
  for (const r of going) {
    const out = movedOf(
      await client.update({ register, seq: r.seq, version: r.version, patch: { [field.id]: to?.id ?? null }, note: words.movedTo(to?.name ?? words.everywhere) }),
      r.version,
      r.name,
    );
    if (out.ok) landed.push({ row: r, version: out.version, from: heldOf(r.fields[field.id]) });
    else {
      fix ??= out.fix;
      if (out.stale) stale.push(r.seq);
    }
  }

  /* THE WAY BACK, offered only where it asks nothing: one that was everywhere, in a list of keys, goes back by a move
     with its question and not by an Undo. Each goes back by its place's `<list>#<n>` form, which the kernel takes. */
  const reopens = sealed && landed.some((l) => l.from === null);
  const undo =
    landed.length === 0 || reopens
      ? null
      : async (): Promise<MovedMany> => {
          const back: { seq: number; version: number }[] = [];
          const lost: number[] = [];
          let why: string | null = null;
          for (const l of landed) {
            const value = l.from === null ? null : typeof l.from === 'number' ? `${field.to}#${l.from}` : l.from;
            const out = movedOf(
              await client.update({ register, seq: l.row.seq, version: l.version, patch: { [field.id]: value }, note: words.movedBack }),
              l.version,
              l.row.name,
            );
            if (out.ok) back.push({ seq: l.row.seq, version: out.version });
            else {
              why ??= out.fix;
              if (out.stale) lost.push(l.row.seq);
            }
          }
          return { ask: false, moved: back, skipped: 0, failed: landed.length - back.length, fix: why, stale: lost, undo: null };
        };
  return { ask: false, moved: landed.map((l) => ({ seq: l.row.seq, version: l.version })), skipped: rows.length - going.length, failed: going.length - landed.length, fix, stale, undo };
}

/**
 * The one sentence for a move of many: how many moved and where, how many were there already, how many did not move
 * and the first reason. A count and a name, never a number of the record's own.
 */
export function movedSaid(out: Extract<MovedMany, { ask: false }>, to: Place | null): string {
  const name = to?.name ?? words.everywhere;
  const said: string[] = [];
  if (out.moved.length > 0) said.push(words.movedMany(out.moved.length, name));
  if (out.skipped > 0) said.push(out.moved.length === 0 && out.failed === 0 ? words.allThere(out.skipped, name) : words.wereThere(out.skipped));
  if (out.failed > 0) said.push(words.notMoved(out.failed));
  if (out.fix) said.push(out.fix);
  return said.join(' ');
}

/** The sentence once an Undo has put them back. */
export const putBackSaid = (out: Extract<MovedMany, { ask: false }>): string =>
  [...(out.moved.length > 0 ? [words.backMany(out.moved.length)] : []), ...(out.failed > 0 ? [words.notMoved(out.failed)] : []), ...(out.fix ? [out.fix] : [])].join(' ');
