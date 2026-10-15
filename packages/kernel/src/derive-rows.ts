/**
 * A page of rows with each derived field filled, where the rows leave the kernel: one row, a page, a search hit.
 *
 * NOTHING HERE IS STORED. The rows come in as read and go out as copies with the derived fields written over whatever
 * the row held under those names, so a value somebody managed to store under a derived field's id is never the one
 * shown: the read always says what the row's own fields make.
 *
 * `via` IS ONE QUERY A PAGE, NOT ONE A ROW. The links of the whole page are collected first and handed to `resolve`
 * once for each `via` field, so fifty rows through one link cost one lookup rather than fifty. The resolver is the
 * reader's sight: it answers only the linked rows that reader may open, and a link it leaves out derives null, the
 * same as a link never written, so a derived field never shows a value from a row its reader cannot see.
 */

import type { Json } from './coerce.ts';
import { derived, isDerived, shapeOf, sourcesOf, type DeriveField } from './derive.ts';

/**
 * The far side of a `via`: for the linked list, the row ids the page links to and the field to read there, each id
 * the reader may open mapped to that field's value. An id left out is a row the reader cannot open, or one gone.
 */
export type DeriveResolve = (list: string, ids: readonly string[], field: string) => ReadonlyMap<string, Json>;

/** A row as it leaves the kernel: its own fields, and anything else it carries, which is passed through untouched. */
export type DerivableRow = { fields: Record<string, Json> };

/** The fields of a list that are worked out at read, and the link each `via` reads through. */
function derivedFields(fields: readonly DeriveField[]): DeriveField[] {
  return inOrder(fields.filter((f) => f.retired !== true && f.derive !== undefined && shapeOf(f.derive) !== null));
}

/**
 * THE DERIVED FIELDS IN THE ORDER THEY ARE WORKED OUT: each after every derived field it reads, so a chain such as
 * `least = product [cost, margin]` reads the cost this read made and never a value stored under its name. The install
 * refuses a ring (`deriveFault`); one that reached here anyway is left in declaration order rather than walked forever.
 */
function inOrder(mine: readonly DeriveField[]): DeriveField[] {
  const by = new Map(mine.map((f) => [f.id, f]));
  const out: DeriveField[] = [];
  const state = new Map<string, 'open' | 'done'>();
  const visit = (f: DeriveField): void => {
    if (state.get(f.id) !== undefined) return;
    state.set(f.id, 'open');
    for (const name of sourcesOf(f.derive)) {
      const g = by.get(name);
      if (g !== undefined && state.get(name) === undefined) visit(g);
    }
    state.set(f.id, 'done');
    out.push(f);
  };
  for (const f of mine) visit(f);
  return out;
}

/**
 * `rows` with every derived field of `fields` filled. `resolve` is called once per `via` field per page, with the
 * distinct links of the page, and not at all when the page links nowhere. A list with no derived field hands back
 * the rows it was given.
 */
export function withDerived<T extends DerivableRow>(rows: readonly T[], fields: readonly DeriveField[], resolve: DeriveResolve): T[] {
  const mine = derivedFields(fields);
  if (mine.length === 0 || rows.length === 0) return rows.slice();
  const resolved = new Map<string, ReadonlyMap<string, Json>>();
  for (const f of mine) {
    const got = shapeOf(f.derive)!;
    if (got.shape !== 'via') continue;
    const { ref, field } = got.body as { ref: string; field: string };
    const link = fields.find((g) => g.id === ref && g.type === 'ref' && !isDerived(g));
    if (link === undefined || typeof link.to !== 'string') continue;
    const ids = [...new Set(rows.map((r) => r.fields[ref]).filter((v): v is string => typeof v === 'string' && v !== ''))];
    if (ids.length === 0) continue;
    resolved.set(f.id, resolve(link.to, ids, field));
  }
  return rows.map((r) => {
    const out: Record<string, Json> = { ...r.fields };
    /* Each reads the row as worked out so far, so a field read by another is filled before it is read. */
    for (const f of mine) out[f.id] = derived(out, f, resolved.get(f.id));
    return { ...r, fields: out };
  });
}

/** One row through the same door, for a read of a single row: the resolver is still asked once, for its one link. */
export const oneWithDerived = <T extends DerivableRow>(row: T, fields: readonly DeriveField[], resolve: DeriveResolve): T =>
  withDerived([row], fields, resolve)[0]!;
