/**
 * Sharing one row and the lines on it: one money account and its Ledger lines, a household view.
 *
 * NO NEW TABLE, NO MIGRATION, NO SECOND PERMISSION PATH. A row grant is a bundle of ordinary shares (`share`, migration
 * 43), which the lens already reads and every reader and writer already honours:
 *
 *   1. the row itself, `{ list: 'accounts', rows: [id] }`, at view or edit (edit never deletes it);
 *   2. for each list of lines, `{ list: 'transactions', where: { field: 'account', is: id } }`, at the same rung.
 *
 * WHAT THE RECORD ALREADY DOES WITH THAT BUNDLE, and why nothing here is wired into the read or write path:
 *   - reads: the lens turns 1 into `id in [..]` and 2 into `account is ..`, and `list`, `count`, search and the
 *     backlinks compile them as any filter (`scope`, `admitClause` in `index.ts`).
 *   - writes: a line is checked before it changes (the row must be inside what she may write, `sight.ts` `writable`)
 *     and after (`write` in `index.ts` unwinds a create or an edit that leaves the row outside `within`), so a new line
 *     written onto the account is kept and one written onto another account is refused.
 *   - moving a line off the account: `account` is a gate field of the lines list while a share condition names it
 *     (`gateFields`), so a conditional writer changing it is refused in plain words before the write.
 *   - an invite: a share made to an email waits for that address; `invite({ email })` with no level mints a link that
 *     carries only what waits (`invitations.ts`, token hashed), and accepting binds the shares to the person who signed
 *     in. Revoking is `unshare` on each share of the bundle.
 *
 * SO A RECORD WITH NO SUCH SHARE TAKES EXACTLY TODAY'S PATH: there is no new row to look for and no new branch.
 *
 * THIS FILE IS PURE: it builds the bundle from the record's declarations (the lines lists are the ones with a `ref` to the
 * row's list, by id and never by name), finds the bundles already kept, and answers `canReadRow` / `canWriteRow` from a
 * lens, the same predicates the live path compiles, for a screen or a test that holds one row in memory.
 */

import type { Refusal } from '@braindog/ports';

import { admits, schemaOf, type Catalog, type CatalogList, type Cap, type Lens, type Pred, type Share, type Target, type Who } from './lens.ts';
import type { ShareKept } from './shares.ts';

/** The two rungs a row grant is given at. */
export const ROW_GRANT_RUNGS = ['view', 'edit'] as const;
export type RowGrantRung = (typeof ROW_GRANT_RUNGS)[number];

/** One list of lines on the row: the list, and the field of it that points at the row. */
export type RowGrantLines = { list: string; field: string };

export type RowGrantArgs = {
  /** Who: an email for somebody not on the record yet (then `invite({ email })`), or a person or a group by id. */
  who: Who;
  /** The row's list, `accounts`. */
  list: string;
  /** The row's id. */
  row: string;
  /** The lists of lines on it, `['transactions']`, each with its field when the list has more than one `ref` to the row's list. */
  lines: readonly (string | { list: string; field?: string })[];
  can: RowGrantRung;
  /** When it ends, an instant. Absent, until it is stopped. */
  until?: string;
};

/** The bundle to keep: the row's share first (its sentence is the bundle's: "Sam can view Joint account."), then the lines. */
export type RowGrantBuilt = { shares: Share[]; lines: RowGrantLines[] };

const refuse = (code: string, fix: string, at: string): Refusal => ({ code, fix, at });
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The live `ref` fields of a list that point at another, by id. */
const refsTo = (l: CatalogList, to: string): string[] => l.fields.filter((f) => !f.retired && f.type === 'ref' && f.to === to).map((f) => f.id);

/**
 * The shares one row grant is kept as, or why not. Checks only what is particular to a row grant (the lists and fields
 * exist, the lines point at the row's list); the record still runs `checkShare` and its own rules on each share as it
 * keeps it (`share` in `packages/record/src/methods/sharing.ts`), so nothing here is a second gate.
 */
export function rowGrantShares(catalog: Catalog, args: RowGrantArgs): { ok: true; value: RowGrantBuilt } | { ok: false; refusal: Refusal } {
  const lists = new Map(catalog.lists.map((l) => [l.id, l]));
  const home = lists.get(args.list);
  if (!home) return { ok: false, refusal: refuse('REGISTER_UNKNOWN', `There is no list called ${args.list}.`, 'list') };
  if (!isText(args.row)) return { ok: false, refusal: refuse('REQUIRED_MISSING', `Which ${home.name} is shared?`, 'row') };
  if (!(ROW_GRANT_RUNGS as readonly string[]).includes(args.can)) return { ok: false, refusal: refuse('ENUM_VALUE_UNKNOWN', 'They can view it, or edit it.', 'can') };
  if (args.until !== undefined && !Number.isFinite(Date.parse(args.until))) return { ok: false, refusal: refuse('VALUE_MALFORMED', 'until is a date.', 'until') };

  const lines: RowGrantLines[] = [];
  for (const [i, raw] of args.lines.entries()) {
    const at = `lines.${i}`;
    const id = typeof raw === 'string' ? raw : raw.list;
    const l = lists.get(id);
    if (!l) return { ok: false, refusal: refuse('REGISTER_UNKNOWN', `There is no list called ${id}.`, at) };
    const refs = refsTo(l, home.id);
    const asked = typeof raw === 'string' ? undefined : raw.field;
    if (asked !== undefined && !refs.includes(asked)) return { ok: false, refusal: refuse('FIELD_UNKNOWN', `${l.name} has no field pointing at ${home.name} called ${asked}.`, `${at}.field`) };
    if (asked === undefined && refs.length === 0) return { ok: false, refusal: refuse('FIELD_UNKNOWN', `${l.name} has nothing pointing at ${home.name}.`, at) };
    if (asked === undefined && refs.length > 1) return { ok: false, refusal: refuse('VALUE_MALFORMED', `${l.name} points at ${home.name} in more than one way. Say which.`, `${at}.field`) };
    const field = asked ?? refs[0]!;
    if (!lines.some((x) => x.list === l.id && x.field === field)) lines.push({ list: l.id, field });
  }

  const when = args.until === undefined ? {} : { when: { until: args.until } };
  const row: Share = {
    effect: 'allow',
    who: args.who,
    what: { list: home.id, rows: [args.row] },
    can: args.can,
    /* EDITING THE ACCOUNT IS NOT REMOVING IT: its lines would be left pointing at nothing. */
    ...(args.can === 'edit' ? { caps: { delete: false } } : {}),
    ...when,
  };
  const onIt: Share[] = lines.map((x) => ({ effect: 'allow', who: args.who, what: { list: x.list, where: { field: x.field, is: args.row } }, can: args.can, ...when }));
  return { ok: true, value: { shares: [row, ...onIt], lines } };
}

/* ---------------------------------------------------------------------------------------------- the kept bundles */

/** One row grant as the record keeps it: who, the row, its lines, the rung, and the share ids that end it. */
export type RowGrant = {
  bundle: string | null;
  who: Who;
  list: string;
  row: string;
  lines: RowGrantLines[];
  can: RowGrantRung;
  until: string | null;
  made_by: string;
  made_at: string;
  /** Every share of the bundle, the row's first: `unshare` each to stop it. */
  ids: string[];
};

const oneRow = (t: Target): { list: string; row: string } | null => ('rows' in t && t.rows.length === 1 ? { list: t.list, row: t.rows[0]! } : null);

const lineOn = (t: Target, row: string): RowGrantLines | null => {
  if (!('where' in t) || 'view' in t) return null;
  const w = t.where as Record<string, unknown>;
  const keys = Object.keys(w).sort().join();
  return keys === 'field,is' && isText(w.field) && w.is === row ? { list: t.list, field: w.field } : null;
};

/**
 * The row grants among the live shares: each bundle (or a lone share) that is exactly one row's share and shares of lines
 * pointing at that row, all allows, for one grantee, at one rung, view or edit. Anything else is an ordinary share and
 * the Sharing page says it as it always has.
 */
export function rowGrantsIn(kept: readonly ShareKept[]): RowGrant[] {
  const groups = new Map<string, ShareKept[]>();
  for (const s of kept) {
    if (s.revoked_at) continue;
    const key = s.bundle ?? `solo:${s.id}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: RowGrant[] = [];
  for (const group of groups.values()) {
    const heads = group.filter((s) => oneRow(s.what) !== null);
    if (heads.length !== 1) continue;
    const head = heads[0]!;
    const { list, row } = oneRow(head.what)!;
    if (!(ROW_GRANT_RUNGS as readonly string[]).includes(head.can)) continue;
    const rest = group.filter((s) => s !== head);
    const lines = rest.map((s) => lineOn(s.what, row));
    const same = (s: ShareKept): boolean => s.effect === 'allow' && s.can === head.can && s.who.kind === head.who.kind && s.who.id === head.who.id;
    if (head.effect !== 'allow' || !rest.every(same) || lines.some((x) => x === null)) continue;
    out.push({
      bundle: head.bundle,
      who: head.who,
      list,
      row,
      lines: lines as RowGrantLines[],
      can: head.can as RowGrantRung,
      until: head.when?.until ?? null,
      made_by: head.made_by,
      made_at: head.made_at,
      ids: [head.id, ...rest.map((s) => s.id)],
    });
  }
  return out.sort((a, b) => (a.made_at < b.made_at ? 1 : a.made_at > b.made_at ? -1 : 0));
}

/** The row grants on one row: who holds it, for its "Shared with" line. */
export const rowGrantsOn = (kept: readonly ShareKept[], list: string, row: string): RowGrant[] => rowGrantsIn(kept).filter((g) => g.list === list && g.row === row);

/* ------------------------------------------------------------------------------------------------ the checks */

/** A row as `admits` reads it: its id and the kernel's columns beside its fields. */
export type RowLike = Readonly<Record<string, unknown>> & { id: string; fields: Readonly<Record<string, unknown>> };

const predOf = (lens: Lens, cap: Cap, list: string): Pred => lens.pred[cap][list] ?? false;

const holds = (p: Pred, l: CatalogList, row: RowLike): boolean => {
  if (typeof p === 'boolean') return p;
  try {
    return admits(p, row.fields as Record<string, unknown>, schemaOf(l), row);
  } catch {
    /* A PREDICATE THAT CANNOT BE ANSWERED ABOUT THIS ROW ADMITS IT TO NOTHING, as `narrowed` holds an unreadable rule. */
    return false;
  }
};

/** The fields a predicate tests, kernel columns left out: what a conditional writer may not change. */
function testedIn(p: Pred, out = new Set<string>()): Set<string> {
  if (typeof p === 'boolean' || p === null || typeof p !== 'object') return out;
  const o = p as Record<string, unknown>;
  for (const k of ['all', 'any', 'none']) if (Array.isArray(o[k])) for (const kid of o[k] as Pred[]) testedIn(kid, out);
  if (typeof o.field === 'string' && !['id', 'seq', 'created_at', 'updated_at'].includes(o.field)) out.add(o.field);
  return out;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Whether this lens reads this row: the read predicate on its list admits it. `null` is the stranger's lens. The same
 * predicate `list` compiles to SQL, answered for one row in memory.
 */
export function canReadRow(lens: Lens | null, catalog: Catalog, list: string, row: RowLike): boolean {
  if (lens === null) return false;
  const l = catalog.lists.find((x) => x.id === list);
  return l !== undefined && holds(predOf(lens, 'read', list), l, row);
}

/**
 * Whether this lens may make this write: `before` null is a create, `after` null a delete.
 *
 *   - a create: she may add to the list, and the new row is one she reads (a line written onto the shared account).
 *   - an edit: she may change the row as it is and as it would be, and, where her write on the list is conditional,
 *     leaves each gate field as it was (moving a line off the account is refused even when she could see both).
 *   - a delete: she may delete the row as it is.
 *
 * `gates` is the list's gate fields record-wide (`gateFields`), which the live path uses; absent, the fields her own
 * conditions on the list test, which is all a row grant ever adds.
 */
export function canWriteRow(lens: Lens | null, catalog: Catalog, list: string, before: RowLike | null, after: RowLike | null, gates?: readonly string[]): boolean {
  if (lens === null) return false;
  const l = catalog.lists.find((x) => x.id === list);
  if (l === undefined) return false;
  if (before === null) return after !== null && holds(predOf(lens, 'append', list), l, after) && holds(predOf(lens, 'read', list), l, after);
  if (after === null) return holds(predOf(lens, 'delete', list), l, before);
  const write = predOf(lens, 'write', list);
  if (!holds(write, l, before) || !holds(write, l, after)) return false;
  if (write === true && predOf(lens, 'read', list) === true) return true;
  const gated = gates ?? [...testedIn(write, testedIn(predOf(lens, 'read', list)))];
  return gated.every((f) => sameValue(before.fields[f], after.fields[f]));
}
