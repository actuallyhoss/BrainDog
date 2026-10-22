/**
 * What a fold carries onto the one kept, split in two: what is written, and what is only offered.
 *
 * A FOLD SAYS TWO ROWS ARE ONE PERSON, and what the folded row held is evidence of that one person: the later day they
 * were in touch, the lists they were on, an address that goes in as a key, the other name they went by. That is written
 * with the fold, in its batch, and its Undo takes it back.
 *
 * WHO SOMEBODY IS IS NEVER FILLED BEHIND THE OWNER'S BACK. A field on the identity floor
 * (`change-kind.ts`, `ListShape.identity`: the organisation a person is with, above all) that the kept row leaves empty
 * and a folded row holds is not written. The folded row's own address and name are not new facts about anybody: they
 * are what it was matched on, and move with it as a key and an alias. It is offered: one line, the field, the value and the row it
 * came from, for the owner to press ("Use Northbank for Sara? It came from the other Sara."). Before this, the first
 * fold that held an organisation gave the kept person that organisation, which the floor says is never a write without
 * a person.
 *
 * PURE: no record, no clock. The caller hands the list's fields, the rows, and which fields the floor holds.
 */

import type { ListShape } from './change-kind.ts';
import { keyOf, nameWords } from './identity-keys.ts';
import type { MeetsFields } from './roles.ts';

/** A row as a fold reads it: its id and what it holds. */
export type FoldRow = { id: string; fields: Record<string, unknown> };

/** One declared field, as much of it as a fold reads: a declaration's own, or `shapeIn`'s (`ListShape.fields`). */
export type FoldField = { id: string; type?: string; retired?: boolean; derived?: unknown };

/** The list a fold is in: its declared fields, which field plays each part, and how many lines `met` keeps. */
export type FoldFields = { declared: readonly FoldField[]; at: MeetsFields; metCap: number };

/** A value a fold held for a field on the identity floor that the kept row leaves empty: offered, never written. */
export type Offered = { field: string; value: unknown; from: string };

/** What a fold carries: the patch the kept row is written with, and the lines offered beside it. */
export type FoldFilled = { write: Record<string, unknown>; offered: Offered[] };

const listOf = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const textOf = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (v: unknown): boolean => v === undefined || v === null || v === '';

/** The later of two days, `undefined` for neither; a value that is not a day counts as none. */
const later = (a: unknown, b: unknown): string | undefined =>
  [a, b].filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1);

/** The `met` lines of two lists as one, by their day and stably, the oldest dropped past the cap. */
const metLines = (cap: number, ...lists: string[][]): string[] =>
  [...new Set(lists.flat())].sort((a, b) => (a.slice(0, 10) < b.slice(0, 10) ? -1 : a.slice(0, 10) > b.slice(0, 10) ? 1 : 0)).slice(-cap);

/**
 * Which fields the identity floor holds for a list, as `change-kind.ts` reads it from the roles the list plays.
 *
 * A LIST WHOSE SHAPE CANNOT BE READ HOLDS EVERY IDENTITY PART IT PLAYS, so a fold with no floor to read offers rather than
 * writes: asking once too often is the cheaper mistake. The parts are the people's half of the floor's own.
 */
export function identityFloor(shape: ListShape | null, at?: MeetsFields): (field: string) => boolean {
  if (shape !== null) {
    const held = new Set(shape.identity ?? []);
    return (field) => held.has(field);
  }
  const parts = ['merged_into', 'email', 'handles', 'keys', 'self', 'name', 'aliases', 'org'] as const;
  const played = new Set(parts.map((p) => at?.[p]).filter((f): f is string => typeof f === 'string'));
  return (field) => played.has(field);
}

/**
 * What the kept row gains from the folded ones (H2), and what is only offered.
 *
 * WRITTEN, as before: every list joined (`met` by its day, under its cap); the later day in touch; each fold's address,
 * kept as a key when the kept row holds another; a fold's other name joined to `aliases`, once, and never the kept row's
 * own name again; and every field the kept row leaves empty that the floor does not hold, filled from the first fold
 * that has it.
 *
 * OFFERED, never written: a field the floor holds that the kept row leaves empty and a fold holds, the fold's own
 * address and name apart (they move with it, H2: the second address must find one person). One line for each
 * value, from the first fold that held it, so two folds with two organisations offer both and one organisation held
 * twice is one line. A field the kept row already holds is not offered, whatever a fold says.
 *
 * `merged_into` and `self` are never carried: who a row was folded into, and which row is the record's own person.
 */
export function foldFill(fields: FoldFields, keep: FoldRow, folds: readonly FoldRow[], isIdentity: (field: string) => boolean): FoldFilled {
  const at = fields.at;
  const write: Record<string, unknown> = {};
  const offered: Offered[] = [];
  const now = (field: string): unknown => (field in write ? write[field] : keep.fields[field]);
  const skip = new Set([at.merged_into, at.self].filter((f): f is string => f !== undefined));
  /* THE FOLD'S OWN ADDRESS AND NAME MOVE WITH IT: they are what the two were matched on, and kept as a key and an alias
     whatever happens, so filling the kept row's empty one with them says nothing new about who that person is. */
  const own = new Set([at.email, at.name]);
  for (const fold of folds) {
    for (const f of fields.declared) {
      if (f.retired === true || f.derived !== undefined || skip.has(f.id) || f.id.startsWith('_')) continue;
      const theirs = fold.fields[f.id];
      if (theirs === undefined || theirs === null) continue;
      const ours = now(f.id);
      if (f.type === 'list') {
        const union = f.id === at.met ? metLines(fields.metCap, listOf(ours), listOf(theirs)) : [...new Set([...listOf(ours), ...listOf(theirs)])];
        if (!same(union, ours ?? [])) write[f.id] = union;
      } else if (!empty(ours)) continue;
      /* THE DAY IN TOUCH IS NEVER WHO SOMEBODY IS, whatever a floor that cannot be read says: it is the later of two. */
      else if (f.id !== at.in_touch && !own.has(f.id) && isIdentity(f.id)) {
        if (theirs !== '' && !offered.some((o) => o.field === f.id && same(o.value, theirs))) offered.push({ field: f.id, value: theirs, from: fold.id });
      } else write[f.id] = theirs;
    }
    if (at.in_touch !== undefined) {
      const touched = later(now(at.in_touch), fold.fields[at.in_touch]);
      if (touched !== undefined && touched !== now(at.in_touch)) write[at.in_touch] = touched;
    }
    /* THE FOLD'S ADDRESS IS NEVER LOST: the kept row holds its own, so the other one goes in as a key. */
    const theirs = textOf(fold.fields[at.email]);
    const into = at.keys ?? at.handles;
    if (theirs !== undefined && textOf(now(at.email)) !== theirs && into !== undefined) {
      const key = keyOf('email', theirs);
      if (key !== null && !listOf(now(into)).includes(key)) write[into] = [...listOf(now(into)), key];
    }
    const named = textOf(fold.fields[at.name]);
    if (at.aliases !== undefined && named !== undefined) write[at.aliases] = [...listOf(now(at.aliases)), named];
  }
  /* ONE OF EACH NAME, NOT THE KEPT ROW'S OWN: three folds called Karim Assaf are one alias, and "kas" beside Kas none. */
  if (at.aliases !== undefined && at.aliases in write) {
    const had = new Set([nameWords(textOf(now(at.name)) ?? '')]);
    const aliases = listOf(write[at.aliases]).filter((n) => {
      const key = nameWords(n);
      if (key === '' || had.has(key)) return false;
      had.add(key);
      return true;
    });
    if (same(aliases, keep.fields[at.aliases] ?? [])) delete write[at.aliases];
    else write[at.aliases] = aliases;
  }
  /* AN OFFER THE WRITE ANSWERED ITSELF is none: a later fold's name or address the kept row now holds as written. */
  return { write, offered: offered.filter((o) => empty(now(o.field))) };
}
