/**
 * A list's first page as the local copy keeps it (`lib/data/local.ts`): plain JSON, and the lists it was read from.
 *
 * THE NAMES ARE A MAP WITH MARKS ON IT, which IndexedDB and the copy's scrub would both lose, so they go as pairs and
 * come back as the same map. PURE, so `kept-list.test.ts` runs it under `node --test`.
 */

import type { Names } from '../../../lib/record/remote.ts';
import type { Entry, RegisterDecl } from '../../../lib/record/schema.ts';

export type KeptList = {
  decl: RegisterDecl;
  entries: Entry[];
  matched: number;
  names: [string, string][];
  marks: [string, unknown][] | null;
};

/** The list itself, then every list a `ref` field of it points at, whose rows' names the page carries. */
export function listsOf(register: string, decl: RegisterDecl): string[] {
  const to = decl.fields.flatMap((f) => (f.type === 'ref' || f.of === 'ref') && typeof f.to === 'string' ? [f.to] : []);
  return [register, ...new Set(to.filter((t) => t !== register))];
}

export function keptOf(decl: RegisterDecl, entries: Entry[], matched: number, names: Names): KeptList {
  return { decl, entries, matched, names: [...names], marks: names.marks ? [...names.marks] : null };
}

export function namesOf(kept: Pick<KeptList, 'names' | 'marks'>): Names {
  const map = new Map(kept.names);
  return kept.marks ? Object.assign(map, { marks: new Map(kept.marks) }) as unknown as Names : map;
}
