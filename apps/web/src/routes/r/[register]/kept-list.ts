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
 */

import type { Predicate } from '@braindog/where';

import type { Lands, Spot } from '../../../lib/data/local.ts';
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
    ...(more.cursor === undefined ? {} : { cursor: more.cursor }),
    ...(more.counted === undefined ? {} : { counted: more.counted === null ? null : [...more.counted].map(([f, m]) => [f, [...m]] as [string, [string, number][]]) }),
  };
}

export function namesOf(kept: Pick<KeptList, 'names' | 'marks'>): Names {
  const map = new Map(kept.names);
  return kept.marks ? Object.assign(map, { marks: new Map(kept.marks) }) as unknown as Names : map;
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
export function searchFieldsOf(decl: RegisterDecl): string[] | null {
  const out: string[] = [];
  for (const f of decl.fields) {
    if ((f.search !== true && f.id !== decl.title) || f.retired === true) continue;
    if (f.id === decl.title && UNSPOKEN.has(f.type)) continue;
    if (f.type === 'secret') return null;
    const plain = f.type === 'list' ? f.of === 'text' : SAID_AS_STORED.has(f.type);
    if (!plain) return null;
    out.push(f.id);
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
 * A search answered from a kept whole list: its rows whose searched text has every typed word as the start of a word,
 * in the order kept (the record's order for the same sort). `null` when the copy may not hold every row (a next page,
 * a count past the rows, a cut text, a copy kept before its cursor was) or its fields cannot be read as the record does.
 */
export function searchKept(kept: KeptList, q: string): { entries: Entry[]; matched: number } | null {
  if (kept.cursor !== null || kept.entries.length !== kept.matched) return null;
  if (kept.entries.some((e) => e.clipped === true)) return null;
  const want = terms(q);
  const fields = searchFieldsOf(kept.decl);
  if (want === null || fields === null) return null;
  const entries = kept.entries.filter((e) => {
    const has = tokensOf(projectedOf(fields, e.fields as Record<string, unknown>));
    return want.every((w) => has.some((t) => t.startsWith(w)));
  });
  return { entries, matched: entries.length };
}
