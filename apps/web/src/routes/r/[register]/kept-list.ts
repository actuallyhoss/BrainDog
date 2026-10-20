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

import type { Predicate } from '@braindog/where';

import { answersHere, localWhere, type Lands, type Spot } from '../../../lib/data/local.ts';
import { terms, tokensOf } from '../../../lib/record/find.ts';
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
  counted?: [string, [string, number][]][] | null;
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
  more: { cursor?: string | null; counted?: ReadonlyMap<string, ReadonlyMap<string, number>> | null } = {},
): KeptList {
  return {
    decl,
    entries,
    matched,
    names: [...names],
    marks: names.marks ? [...names.marks] : null,
    ...(names.ids ? { ids: [...names.ids] } : {}),
    ...(more.cursor === undefined ? {} : { cursor: more.cursor }),
    ...(more.counted === undefined ? {} : { counted: more.counted === null ? null : [...more.counted].map(([f, m]) => [f, [...m]] as [string, [string, number][]]) }),
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
export const countsOf = (counted: NonNullable<KeptList['counted']>): Map<string, Map<string, number>> => new Map(counted.map(([f, m]) => [f, new Map(m)]));

/** A kept page the screen can draw whole without asking: its cursor and its counts (when the bar counts) are in it. */
export function servedWhole(kept: KeptList, counts: boolean): boolean {
  return kept.cursor !== undefined && (!counts || (kept.counted !== undefined && kept.counted !== null));
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
          tally: ['counted'],
          ids: ['ids'],
        };
  return { list: register, at: ['entries'], by, ...(ask.sort ? {} : { newest: true }), ...(lands ? { lands } : {}) };
}

/** Field types whose value a kept row holds as the record stored it, so the record's index read the same words. */
const SAID_AS_STORED = new Set(['text', 'document', 'enum', 'url', 'email', 'int', 'decimal', 'bool', 'duration', 'day', 'instant']);
/** A title of these is never indexed (ruling 441, `projectedText` in the kernel's `fts.ts`). */
const UNSPOKEN = new Set(['money', 'day', 'instant']);

/**
 * The fields the record's search reads, in declared order, as `projectedText` picks them: every `search: true` field and
 * the title, but a title of money or a date. `null` when one is held here in another form than the record indexes (a ref
 * is a number on screen and an id in the record, money an object), so the browser cannot say what the record would.
 */
export function searchFieldsOf(decl: RegisterDecl, refs = false): string[] | null {
  const out: string[] = [];
  for (const f of decl.fields) {
    if ((f.search !== true && f.id !== decl.title) || f.retired === true) continue;
    if (f.id === decl.title && UNSPOKEN.has(f.type)) continue;
    if (f.type === 'secret') return null;
    /* A REF, ASKED FOR, IS READ BY THE NAME IT IS DRAWN WITH (`refsSaid`), as the screen shows it and the sample finds it. */
    const ref = refs && typeof f.to === 'string' && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref'));
    const plain = ref || (f.type === 'list' ? f.of === 'text' : SAID_AS_STORED.has(f.type));
    if (!plain) return null;
    out.push(f.id);
  }
  return out;
}

/**
 * Each ref field's values as the names its rows are drawn with, from the names the list was kept with; `null` when one
 * points at a row whose name is not kept here, which leaves the search to the record.
 */
function refsSaid(decl: RegisterDecl, fields: readonly string[], values: Record<string, unknown>, names: Names): Record<string, unknown> | null {
  const out: Record<string, unknown> = { ...values };
  for (const id of fields) {
    const f = decl.fields.find((x) => x.id === id);
    if (!f || typeof f.to !== 'string' || !(f.type === 'ref' || (f.type === 'list' && f.of === 'ref'))) continue;
    const raw = values[id];
    if (raw === undefined || raw === null || raw === '') continue;
    const name = (v: unknown): string | undefined => (typeof v === 'number' ? names.get(`${f.to}#${v}`) : undefined);
    const said = Array.isArray(raw) ? raw.map(name) : [name(raw)];
    if (said.some((n) => n === undefined)) return null;
    out[id] = said.join(' ');
  }
  return out;
}

/** One row's searched text, as the kernel projects it: lists joined by spaces, NFC, whitespace collapsed. */
function projectedOf(fields: readonly string[], values: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const id of fields) {
    const raw = values[id];
    if (raw === undefined || raw === null || raw === '') continue;
    const text = (Array.isArray(raw) ? raw.map((v) => String(v)).join(' ') : String(raw)).normalize('NFC').replace(/\s+/gu, ' ').trim();
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

/**
 * A search, a filter or both answered from a kept whole list: its rows the chips' `where` takes (asked here as the
 * record would, `answersHere`), whose searched text has every typed word as the start of a word, in the order kept (the
 * record's order for the same sort). A searchable ref is read by its row's kept name. `null` when the copy may not hold
 * every row (a next page, a count past the rows, a cut text, a copy kept before its cursor was), when nothing is asked,
 * or when a field or a filter cannot be read as the record does.
 */
export function searchKept(kept: KeptList, q: string, where: Predicate | null = null): { entries: Entry[]; matched: number } | null {
  if (kept.cursor !== null || kept.entries.length !== kept.matched) return null;
  if (kept.entries.some((e) => e.clipped === true)) return null;
  const typed = q.trim() !== '';
  const want = typed ? terms(q) : [];
  if (want === null || (!typed && where === null)) return null;
  /* A FILTER THE BROWSER CANNOT ASK (a ref, a relative day) is the record's, never answered here as none. */
  if (where !== null && !localWhere(where, kept.decl)) return null;
  const fields = typed ? searchFieldsOf(kept.decl, true) : [];
  if (fields === null) return null;
  const names = namesOf(kept);
  const entries: Entry[] = [];
  for (const e of kept.entries) {
    const values = e.fields as Record<string, unknown>;
    if (where !== null && !answersHere(kept.decl.id, kept.decl, where, values)) continue;
    if (typed) {
      const said = refsSaid(kept.decl, fields, values, names);
      if (said === null) return null;
      const has = tokensOf(projectedOf(fields, said));
      if (!want.every((w) => has.some((t) => t.startsWith(w)))) continue;
    }
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
