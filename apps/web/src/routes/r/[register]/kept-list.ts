/**
 * A list's first page as the local copy keeps it (`lib/data/local.ts`): plain JSON, and the lists it was read from.
 *
 * THE NAMES ARE A MAP WITH MARKS ON IT, which IndexedDB and the copy's scrub would both lose, so they go as pairs and
 * come back as the same map; the pills' counts likewise. PURE, so `kept-list.test.ts` runs it under `node --test`.
 *
 * WHAT LETS IT SKIP THE RECORD. A copy that is current, holds the page's cursor and holds the counts the bar draws is
 * the screen whole, so the list draws it and asks nothing (`servedWhole`). One without them is drawn and asked behind.
 */

import type { Spot } from '../../../lib/data/local.ts';
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
  ask: { filters: readonly Filter[]; q: string; sort: { field: string } | undefined; twice: boolean },
  counted: readonly string[],
): Spot {
  const every = ask.q !== '' || ask.twice || ask.filters.some((f) => typeof f.field !== 'string' || f.field === '');
  const by = every ? null : [...new Set([...ask.filters.map((f) => f.field), ...(ask.sort ? [ask.sort.field] : []), ...counted])];
  return { list: register, at: ['entries'], by, ...(ask.sort ? {} : { newest: true }) };
}
