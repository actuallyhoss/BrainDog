/**
 * A list's first page as the local copy keeps it (`lib/data/local.ts`): plain JSON, and the lists it was read from.
 *
 * THE NAMES ARE A MAP WITH MARKS ON IT, which IndexedDB and the copy's scrub would both lose, so they go as pairs and
 * come back as the same map; the pills' counts likewise. PURE, so `kept-list.test.ts` runs it under `node --test`.
 *
 * WHAT LETS IT SKIP THE RECORD. A copy that is current, holds the page's cursor and holds the counts the bar draws is
 * the screen whole, so the list draws it and asks nothing (`servedWhole`). One without them is drawn and asked behind.
 *
 * A SEARCH OVER A LIST KEPT WHOLE is answered here too (`searchKept`), as the record's search box would, and drawn
 * marked as this device's until the record's own answer replaces it.
 *
 * KEPT WHOLE PAST ITS FIRST PAGE (`walkWhole`): when a list is opened, its other pages are walked in the background when
 * the browser is idle, up to `LIST_ROWS_MOST` rows, and kept marked `whole` beside the first page, so a search, a
 * filter and a create reach every row of it here.
 */

import { compile, evaluate, type Predicate, type Schema } from '@braindog/where';

import { answersHere, localWhere, type Lands, type Spot } from '../../../lib/data/local.ts';
import { terms } from '../../../lib/record/find.ts';
import type { Names } from '../../../lib/record/remote.ts';
import type { Entry, Filter, RegisterDecl } from '../../../lib/record/schema.ts';

export type KeptList = {
  decl: RegisterDecl;
  entries: Entry[];
  matched: number;
  names: [string, string][];
  marks: [string, unknown][] | null;
  /** Where the next page starts, as the record said it; absent from a copy kept before it was kept. */
  cursor?: string | null;
  /** The pills' counts by field, or `null` when the record withheld some or they were not asked. */
  pills?: [string, [string, number][]][] | null;
  /** The rows a ref may point at, `<list> <id>` to the number, so a logged create's ref is drawn as one (`Lands.ids`). */
  ids?: [string, number][];
  /** Every row the list holds, walked to its end (`walkWhole`). */
  whole?: true;
};

/** The list itself, then every list a `ref` field of it points at, whose rows' names the page carries. */
export function listsOf(register: string, decl: RegisterDecl): string[] {
  const to = decl.fields.flatMap((f) => (f.type === 'ref' || f.of === 'ref') && typeof f.to === 'string' ? [f.to] : []);
  return [register, ...new Set(to.filter((t) => t !== register))];
}

export function keptOf(
  decl: RegisterDecl,
  entries: Entry[],
  matched: number,
  names: Names,
  more: { cursor?: string | null; pills?: ReadonlyMap<string, ReadonlyMap<string, number>> | null } = {},
): KeptList {
  return {
    decl,
    entries,
    matched,
    names: [...names],
    marks: names.marks ? [...names.marks] : null,
    ...(names.ids ? { ids: [...names.ids] } : {}),
    ...(more.cursor === undefined ? {} : { cursor: more.cursor }),
    ...(more.pills === undefined ? {} : { pills: more.pills === null ? null : [...more.pills].map(([f, m]) => [f, [...m]] as [string, [string, number][]]) }),
  };
}

export function namesOf(kept: Pick<KeptList, 'names' | 'marks'> & { ids?: KeptList['ids'] }): Names {
  const map = new Map(kept.names);
  /* NOT ENUMERABLE, as `remote.ts` puts them, so the names still spread as the map of titles. */
  if (kept.marks) Object.defineProperty(map, 'marks', { value: new Map(kept.marks), enumerable: false });
  if (kept.ids) Object.defineProperty(map, 'ids', { value: new Map(kept.ids), enumerable: false });
  return map as Names;
}

/** Two pages' names as one, the later winning, marks and ids too (`joinNames` in `remote.ts`, which node cannot load). */
function joined(first: Names, next: Names): Names {
  return namesOf({
    names: [...first, ...next],
    marks: first.marks || next.marks ? [...(first.marks ?? []), ...(next.marks ?? [])] : null,
    ...(first.ids || next.ids ? { ids: [...(first.ids ?? []), ...(next.ids ?? [])] } : {}),
  });
}

/** The pills' counts as the screen holds them. */
export const countsOf = (counted: NonNullable<KeptList['pills']>): Map<string, Map<string, number>> => new Map(counted.map(([f, m]) => [f, new Map(m)]));

/** A kept page the screen can draw whole without asking: its cursor and its counts (when the bar counts) are in it. */
export function servedWhole(kept: KeptList, counts: boolean): boolean {
  return kept.cursor !== undefined && (!counts || (kept.pills !== undefined && kept.pills !== null));
}

/**
 * Where the page's rows are, for a change to be placed on them (`local.ts` `Spot`). The fields its question was asked
 * by are the chips', the sort's and every counted pill's; a search, or the people held twice, is every field. With no
 * sort the rows are in the record's own order, last changed first.
 */
export function spotOf(
  register: string,
  ask: { filters: readonly Filter[]; q: string; sort: { field: string; dir?: 'asc' | 'desc' } | undefined; twice: boolean },
  counted: readonly string[],
  where?: Predicate | null,
): Spot {
  const every = ask.q !== '' || ask.twice || ask.filters.some((f) => typeof f.field !== 'string' || f.field === '');
  const by = every ? null : [...new Set([...ask.filters.map((f) => f.field), ...(ask.sort ? [ask.sort.field] : []), ...counted])];
  /* A CREATE OR A DELETE IS PLACED only on the chips' question said as the record's tree: a search or the people held
     twice are the record's to answer, and with no tree to hand a create drops the page as before. */
  const lands: Lands | null =
    every || where === undefined
      ? null
      : {
          where: where ?? null,
          exact: true,
          ...(ask.sort ? { sort: { field: ask.sort.field, dir: ask.sort.dir === 'desc' ? 'desc' : 'asc' } } : {}),
          more: ['cursor'],
          count: ['matched'],
          tally: ['pills'],
          ids: ['ids'],
        };
  return { list: register, at: ['entries'], by, ...(ask.sort ? {} : { newest: true }), ...(lands ? { lands } : {}) };
}

/** The types `contains` reads (`TEXTUAL` in `@braindog/where`) that a kept row holds as the record stored them. */
const CONTAINED = new Set(['text', 'document', 'url', 'email', 'enum']);

/**
 * The fields the record's search box reads, in declared order: the register's `search: true` fields, as `searchable` in
 * `find.ts` and `treeOf` in `remote.ts` pick them, and the title only if it says so. `null` when one is held here in
 * another form than the record reads it (a ref is an id there and a number here, a list or money has no `contains`),
 * so the browser cannot say what the record would.
 */
export function searchFieldsOf(decl: RegisterDecl): string[] | null {
  const out: string[] = [];
  for (const f of decl.fields) {
    if (f.search !== true || f.retired === true) continue;
    if (!CONTAINED.has(f.type)) return null;
    out.push(f.id);
  }
  return out;
}

/** The record's box as a `where`: each word is a part of some searched field (`treeOf` in `remote.ts`, same words). */
function boxTree(fields: readonly string[], want: readonly string[]): Predicate {
  return { all: want.map((word) => ({ any: fields.map((field) => ({ field, contains: word })) })) } as Predicate;
}

/**
 * A search, a filter or both answered from a kept whole list: its rows the chips' `where` takes (asked here as the
 * record would, `answersHere`), and the box asked as the record asks it: each typed word a part of a word, in some
 * field the register marks searchable, by the same `evaluate` the record's rules use. Rows in the order kept (the
 * record's order for the same sort). `null` when the copy may not hold every row (a next page, a count past the rows, a
 * cut text, a copy kept before its cursor was), when nothing is asked, or when a field or a filter cannot be read as the
 * record does, a searchable ref among them: the record reads it by an id this copy does not hold.
 */
export function searchKept(kept: KeptList, q: string, where: Predicate | null = null): { entries: Entry[]; matched: number } | null {
  if (kept.cursor !== null || kept.entries.length !== kept.matched) return null;
  if (kept.entries.some((e) => e.clipped === true)) return null;
  const typed = q.trim() !== '';
  const want = typed ? terms(q) : [];
  if (want === null || (!typed && where === null)) return null;
  /* A FILTER THE BROWSER CANNOT ASK (a ref, a relative day) is the record's, never answered here as none. */
  if (where !== null && !localWhere(where, kept.decl)) return null;
  const fields = typed ? searchFieldsOf(kept.decl) : [];
  if (fields === null) return null;
  let box: Predicate | null = null;
  const schema: Schema = { register: kept.decl.id, fields: {} };
  if (typed) {
    for (const f of kept.decl.fields) if (fields.includes(f.id)) schema.fields[f.id] = { type: f.type };
    box = boxTree(fields, want);
    /* A refusal the record would make (a word past the `contains` cap) is its answer, not an empty one. */
    if (compile(box, schema).bad.length > 0) return null;
  }
  const entries: Entry[] = [];
  for (const e of kept.entries) {
    const values = e.fields as Record<string, unknown>;
    if (where !== null && !answersHere(kept.decl.id, kept.decl, where, values)) continue;
    if (box !== null && !evaluate(box, values, schema)) continue;
    entries.push(e);
  }
  return { entries, matched: entries.length };
}

/** A page of a list as the screen's source answers it. */
export type Paged = { entries: Entry[]; matched: number; names: Names; cursor: string | null };

/**
 * The whole list from its first page, its next pages asked one at a time when the browser is idle (`idle`), or `null`
 * when it cannot be kept whole: more than `most` rows, a page refused, the screen gone (`gone`), or the record moved
 * under the walk (a row past the seam missed, one made or gone meanwhile), which the count no longer matching says.
 */
export async function walkWhole(
  first: Paged,
  page: (cursor: string) => Promise<Paged | null>,
  opts: { most: number; idle: () => Promise<void>; gone: () => boolean },
): Promise<Paged | null> {
  if (first.matched > opts.most) return null;
  const entries = [...first.entries];
  let names = first.names;
  let cursor = first.cursor;
  let matched = first.matched;
  while (cursor !== null) {
    if (entries.length >= opts.most) return null;
    await opts.idle();
    if (opts.gone()) return null;
    const next = await page(cursor);
    if (next === null || opts.gone()) return null;
    entries.push(...next.entries);
    names = joined(names, next.names);
    cursor = next.cursor;
    matched = next.matched;
  }
  if (entries.length !== matched || entries.length > opts.most || new Set(entries.map((e) => e.seq)).size !== entries.length) return null;
  return { entries, matched, names, cursor: null };
}

/**
 * THE LAST LIVE ANSWER THIS TAB DREW FOR A LIST, by the record and the question it answered: Back to a list is drawn
 * from it at once, as Back to Needs you and to a page are, and the record's read lands over it. Held only while the tab
 * is open, and only the newest, so a list left by another one is asked as ever.
 */
let shown: { base: string; said: string; value: unknown } | null = null;

/** Keep the newest live answer drawn for `said` on `base`. */
export function keepShown(base: string, said: string, value: unknown): void {
  shown = { base, said, value };
}

/** The answer kept for `said` on `base`, or `null`. */
export const shownFor = <T>(base: string, said: string): T | null => (shown !== null && shown.base === base && shown.said === said ? (shown.value as T) : null);
