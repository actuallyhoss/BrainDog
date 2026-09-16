/**
 * The register list's question in the record's grammar, and the record's answer in the app's.
 *
 * PURE, AND THAT IS WHY IT IS A FILE OF ITS OWN. The screen asks in the address's words: chips like
 * `state:in:open`, a search box, a column to order by. The record answers in its own: a `where`
 * tree, and rows whose refs hold the target row's ULID. Everything that translates between the two
 * is here, with no network and no runes, so `remote.test.ts` can hold it against the mock and
 * against the kernel itself over `node:sqlite`.
 *
 * THE DECLARATION IS READ FROM THE SEED'S COPY, not from the answer to `schema`. Every helper this
 * screen already calls reads that copy, and `packages/seed/test/declarations.test.ts` pins it equal
 * to what the record returns for the seed. Two sources for one declaration on one screen is the
 * known cost of moving one screen at a time (`loop/research-phase1-steps5-6.md`, risk 9).
 */

import { REGISTERS, ROWS } from './data.ts';
import { searchable, terms } from './find.ts';
import type { Entry, Fields, Filter } from './schema.ts';
import { declaredValue } from './where.ts';

/** One register's rows, by the ULID the record stores a ref as, and back again. */
export type RefMap = {
  seqOf: ReadonlyMap<string, number>;
  idOf: ReadonlyMap<number, string>;
  /** The name a person says for each row, from the register's own declared title. */
  titleOf: ReadonlyMap<number, string>;
};

/** Every ref target's title, keyed `<register>#<seq>`: what a ref is DRAWN as on a live record. */
export type Names = ReadonlyMap<string, string>;

/** A `RefMap` for each register a ref field on the asked register points at. */
export type Refs = ReadonlyMap<string, RefMap>;

/** A `where` node: a leaf `{ field, <operator>: value }`, or a group `{ all | any: [...] }`. */
export type Tree = Record<string, unknown>;

/** A row as `list` hands it back, and only the keys read here. */
export type RecordRow = {
  id: string;
  seq: number | null;
  fields: Record<string, unknown>;
  version: number;
  created_at: string;
};

/** The registers this one's refs point at, in declared order, each once. */
export function targetsOf(register: string): string[] {
  const out: string[] = [];
  for (const f of REGISTERS[register]?.fields ?? []) if (f.type === 'ref' && f.to && !out.includes(f.to)) out.push(f.to);
  return out;
}

/**
 * A register's rows as a `RefMap`. A row with no sequence has no number to be called by.
 *
 * AND THE NAME EACH NUMBER GOES BY, because that is what a ref is drawn as. `display` renders a ref
 * as the title of the row it points at, and the only titles it had were the built-in sample's — so a
 * live record drew the SAMPLE's name against this record's number, which is worse than drawing no
 * name at all, because it is a wrong name a reader has no reason to doubt. The walk that builds this
 * map already asks for every row of the target register, and every row carries its declared title,
 * so the name is here for nothing.
 *
 * A ROW WITH NO TITLE IS LEFT OUT rather than mapped to an empty string, and `display` then draws
 * `<list>#<number>`: a row somebody can go and open, instead of a blank where a name should be.
 */
export function refMapOf(register: string, rows: readonly Pick<RecordRow, 'id' | 'seq' | 'fields'>[]): RefMap {
  const seqOf = new Map<string, number>();
  const idOf = new Map<number, string>();
  const titleOf = new Map<number, string>();
  const title = REGISTERS[register]?.title;
  for (const r of rows) {
    if (r.seq === null) continue;
    seqOf.set(r.id, r.seq);
    idOf.set(r.seq, r.id);
    const said = title === undefined ? undefined : r.fields?.[title];
    if (typeof said === 'string' && said !== '') titleOf.set(r.seq, said);
  }
  return { seqOf, idOf, titleOf };
}

/**
 * The titles behind a screen's refs, in the one shape `display` reads.
 *
 * ITS PRESENCE IS WHAT SAYS THE ROW CAME FROM A RECORD. A screen drawing the sample passes nothing
 * and `display` reads the sample's rows as it always did; a screen drawing a record passes this, and
 * it is then the only source of a ref's name. An empty map is a live answer too: it means the record
 * named none of them, not that the sample may be consulted.
 */
export function namesOf(refs: Refs): Names {
  const out = new Map<string, string>();
  for (const [register, map] of refs) for (const [seq, title] of map.titleOf) out.set(`${register}#${seq}`, title);
  return out;
}

const norm = (v: string): string => v.toLowerCase().replace(/_/g, ' ').trim();

/** The words `where.ts` reads as a question about absence, and the operator each one is. */
const ABSENCE: Readonly<Record<string, 'empty' | 'present'>> = { empty: 'empty', set: 'present', present: 'present' };
const INVERSE = { empty: 'present', present: 'empty' } as const;

/** The row of `register` a person named by its title, as the seed's copy has it. */
function titled(register: string, said: string): number | null {
  const title = REGISTERS[register]?.title;
  if (!title) return null;
  const hit = (ROWS[register] ?? []).find((e) => norm(String(e.fields[title] ?? '')) === norm(said));
  return hit ? hit.seq : null;
}

/**
 * A value as the record stores it, from a value as the address carries it.
 *
 * AN ENUM IS ITS DECLARED SPELLING, because the address may carry the readable one (`owed to me`)
 * and the record holds `owed_to_me`. `declaredValue` is the same reconciliation the mock uses.
 *
 * A REF IS THE TARGET ROW'S ULID. A link says `thing:is:1`, because a link should not break when a
 * row is renamed, and a declared metric says `thing is Kiln`; the record stores neither. A value that
 * resolves to no row is passed through unchanged, so the record compares it and matches nothing,
 * which is what the mock answered for a row that does not exist.
 */
function valueOf(register: string, field: string, said: string, refs: Refs): string {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  if (f?.type === 'enum') return declaredValue(register, field, said);
  if (f?.type === 'ref' && f.to) {
    const seq = /^\d+$/u.test(said) ? Number(said) : titled(f.to, said);
    return (seq === null ? undefined : refs.get(f.to)?.idOf.get(seq)) ?? said;
  }
  return said;
}

/** Whether a field holds this word as one of its values, so it is a value and not a question. */
function declares(register: string, field: string, word: string): boolean {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  if (f?.type === 'enum') return (f.values ?? []).some((v) => norm(v) === word);
  if (f?.type === 'ref' && f.to) return titled(f.to, word) !== null;
  return false;
}

/**
 * One chip, as one leaf.
 *
 * THE OPERATORS ARE `whereOf`'S, read the same way. `in` of one value is `is`, `not-in` of one is
 * `not`, and `before` and `after` take their first value. Anything else is `is` with its first
 * value, which is how `whereOf` reads an operator it does not name.
 *
 * A LONE WORD THE FIELD DOES NOT HOLD MAY BE THE QUESTION ABOUT ABSENCE: `is empty`, `is set`, and
 * their negations, in the order `where.ts` checks them, declared values first.
 */
function leafOf(register: string, f: Filter, refs: Refs): Tree {
  const one = f.values[0] ?? '';
  if (f.op === 'before' || f.op === 'after') return { field: f.field, [f.op]: one };

  const negated = f.op === 'not-in';
  const single = f.op !== 'in' && f.op !== 'not-in' ? true : f.values.length === 1;
  const absence = single ? ABSENCE[norm(one)] : undefined;
  if (absence && !declares(register, f.field, norm(one)))
    return { field: f.field, [negated ? INVERSE[absence] : absence]: true };

  const values = f.values.map((v) => valueOf(register, f.field, v, refs));
  const first = values[0] ?? '';
  if (f.op === 'in') return values.length === 1 ? { field: f.field, is: first } : { field: f.field, in: values };
  if (negated) return values.length === 1 ? { field: f.field, not: first } : { field: f.field, not_in: values };
  return { field: f.field, is: first };
}

/**
 * The chips and the search box as one `where` tree, or `undefined` when nothing narrows the list.
 *
 * THE BOX IS A SUBSTRING TEST, AND THE MOCK'S IS A WORD PREFIX. Each word must appear in one of the
 * register's `search:` fields, as `contains`, which keeps the record's paging and its exact count.
 * A word found inside another word therefore matches here and did not in the mock, and
 * `remote.test.ts` pins the case. The words are `terms(q)`, the same folding the mock and the
 * record's full-text index use, so punctuation separates words on both sides.
 */
export function treeOf(register: string, filters: readonly Filter[], q: string, refs: Refs): Tree | undefined {
  const nodes: Tree[] = filters.map((f) => leafOf(register, f, refs));
  const words = terms(q);
  if (words) {
    const fields = searchable(register);
    for (const word of words) nodes.push({ any: fields.map((f) => ({ field: f.id, contains: word })) });
  }
  if (nodes.length === 0) return undefined;
  return nodes.length === 1 ? nodes[0] : { all: nodes };
}

/**
 * One row, as the helpers on this screen read one.
 *
 * A REF BECOMES THE NUMBER A PERSON SAYS, because every helper that draws one (`display`,
 * `identityOf`, the sort) looks its target up by sequence. A ref whose target is not in the map
 * stays the ULID it arrived as, and draws as that id rather than as a wrong name.
 *
 * `by` IS EMPTY BECAUSE `list` DOES NOT SAY. The row's history does, and nothing on the list reads it.
 */
export function entryOf(register: string, row: RecordRow, refs: Refs): Entry {
  const decl = REGISTERS[register];
  const fields: Fields = {};
  for (const [key, value] of Object.entries(row.fields)) {
    const f = decl?.fields.find((x) => x.id === key);
    const to = f?.type === 'ref' ? f.to : undefined;
    const seq = to !== undefined && typeof value === 'string' ? refs.get(to)?.seqOf.get(value) : undefined;
    fields[key] = (seq ?? value) as Fields[string];
  }
  return { seq: row.seq ?? 0, fields, version: row.version, created: row.created_at, by: '' };
}

/** The sort in the address, as the record's `order`. */
export const orderOf = (
  sort: { field: string; dir: 'asc' | 'desc' } | undefined,
): { field: string; dir: 'asc' | 'desc' }[] | undefined => (sort ? [{ field: sort.field, dir: sort.dir }] : undefined);
