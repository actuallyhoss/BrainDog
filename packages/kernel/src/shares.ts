/**
 * The share rows as the lens reads them, the access epoch, and the lens cache (sharing plan §2.2, §2.8).
 *
 * LOADERS, NOT DECISIONS. `lens.ts` decides what a caller holds from what these hand it, and `members.ts`'s `access` is
 * the one place both meet. Every reader here fails closed the way the lens does: a share row whose JSON cannot be read
 * makes the whole set unreadable (`null`), because a dropped allow would only hide rows and a dropped deny would show
 * them.
 *
 * THE EPOCH IS THE `access` COUNTER, made at its first bump as every register's counter is, so a fresh record holds no
 * row an import would count as content. It moves in the same transaction as any change to who holds what: a member row,
 * a suspension, a share, a group's members, the set of lists. A cached lens is keyed on it, and an open tab polls it.
 */

import type { Sql } from '@braindog/ports';

import { keyOf } from './identity-keys.ts';
import { gateFields, narrowFault, type Catalog, type CatalogField, type CatalogList, type HeldShare, type Hours, type Narrow } from './lens.ts';
import type { ScopeDecl } from './scope.ts';

/** The counter the access epoch lives in. */
export const EPOCH = 'access';

/** The access epoch now: 0 on a record whose access has never changed since sharing arrived. */
export const epochOf = (sql: Pick<Sql, 'one'>): number => Number(sql.one<{ next: number }>('SELECT next FROM counter WHERE name = ?', EPOCH)?.next ?? 0);

/**
 * Move the access epoch on, in the caller's transaction, and answer the new one. The row is made at the first bump.
 *
 * EVERY CHANGE TO WHO HOLDS WHAT CALLS THIS, so a cached lens keyed on the old epoch is never read again and an open
 * tab's version poll sees the grant move.
 */
export function bumpEpoch(sql: Pick<Sql, 'one' | 'exec'>): number {
  sql.exec('INSERT OR IGNORE INTO counter (name, next) VALUES (?, 0)', EPOCH);
  return Number(sql.one<{ next: number }>('UPDATE counter SET next = next + 1 WHERE name = ? RETURNING next', EPOCH)?.next ?? 0);
}

type ShareRow = {
  id: string;
  effect: string;
  who_kind: string;
  who: string;
  what: string;
  can: string;
  caps: string | null;
  hide: string | null;
  starts_at: string | null;
  ends_at: string | null;
  hours: string | null;
  once: number;
  first_used_at: string | null;
  revoked_at: string | null;
};

const COLUMNS = 's.id, s.effect, s.who_kind, s.who, s.what, s.can, s.caps, s.hide, s.starts_at, s.ends_at, s.hours, s.once, s.first_used_at, s.revoked_at';

/** One stored row as the grammar writes a share; throws on JSON that cannot be read. */
function shareOf(row: ShareRow): HeldShare {
  const when = {
    ...(row.starts_at === null ? {} : { from: row.starts_at }),
    ...(row.ends_at === null ? {} : { until: row.ends_at }),
    ...(row.hours === null ? {} : { hours: JSON.parse(row.hours) as Hours }),
    ...(row.once === 1 ? { once: true as const } : {}),
  };
  return {
    id: row.id,
    effect: row.effect as HeldShare['effect'],
    who: { kind: row.who_kind as HeldShare['who']['kind'], id: row.who },
    what: JSON.parse(row.what) as HeldShare['what'],
    can: row.can as HeldShare['can'],
    ...(row.caps === null ? {} : { caps: JSON.parse(row.caps) as NonNullable<HeldShare['caps']> }),
    ...(row.hide === null ? {} : { hide: JSON.parse(row.hide) as NonNullable<HeldShare['hide']> }),
    ...(Object.keys(when).length === 0 ? {} : { when }),
    first_used_at: row.first_used_at,
    revoked_at: row.revoked_at,
  };
}

const read = (rows: readonly ShareRow[]): HeldShare[] | null => {
  try {
    return rows.map(shareOf);
  } catch {
    return null;
  }
};

/**
 * The live shares one person holds, their own and their groups', or `null` when one of them cannot be read.
 *
 * A REVOKED SHARE COUNTS FOR NOTHING and is not read, and nor is a retired group's. A share by email is pending until the
 * person accepts it, which binds it to them (the plan's slice 8), so it is not theirs yet.
 */
export function sharesFor(sql: Pick<Sql, 'all'>, person: string): HeldShare[] | null {
  return read(
    sql.all<ShareRow>(
      `SELECT ${COLUMNS} FROM share s
        WHERE s.revoked_at IS NULL
          AND ((s.who_kind = 'person' AND s.who = ?)
            OR (s.who_kind = 'group' AND s.who IN (
                 SELECT m.group_id FROM share_group_member m JOIN share_group g ON g.id = m.group_id
                  WHERE m.person_id = ? AND g.retired_at IS NULL)))
        ORDER BY s.id`,
      person,
      person,
    ),
  );
}

/** Every live share on the record, anybody's, for the gate fields; `null` when one cannot be read. */
export function liveShares(sql: Pick<Sql, 'all'>): HeldShare[] | null {
  return read(sql.all<ShareRow>(`SELECT ${COLUMNS} FROM share s WHERE s.revoked_at IS NULL ORDER BY s.id`));
}

/**
 * A key's narrowing chain from `token_lens`: its parent's, then its own, as `verifyToken` reads them. `[]` for a key
 * narrowed to nothing more, and `undefined` when a link cannot be read, which opens nothing.
 */
export function narrowsOf(sql: Pick<Sql, 'one'>, token: string): Narrow[] | undefined {
  const row = sql.one<{ narrow: string | null; parent_narrow: string | null }>(
    `SELECT l.narrow AS narrow, pl.narrow AS parent_narrow
       FROM token_lens l LEFT JOIN token_lens pl ON pl.token_id = l.parent_id
      WHERE l.token_id = ?`,
    token,
  );
  if (!row) return [];
  const out: Narrow[] = [];
  for (const text of [row.parent_narrow, row.narrow]) {
    if (text === null) continue;
    try {
      const n = JSON.parse(text) as unknown;
      if (narrowFault(n) !== null) return undefined;
      out.push(n as Narrow);
    } catch {
      return undefined;
    }
  }
  return out;
}

/**
 * What `$me` means for one person: the rows of the People list holding the address they sign in with, found through
 * the record's own key index (`entity_key`). None, and `$me` matches nothing.
 */
export function meOf(sql: Pick<Sql, 'one' | 'all'>, person: string, people: string | null): string[] {
  if (people === null) return [];
  const email = sql.one<{ email: string | null }>('SELECT email FROM person WHERE id = ?', person)?.email ?? null;
  const key = email === null ? null : keyOf('email', email);
  if (key === null) return [];
  return sql
    .all<{ row_id: string }>(
      `SELECT k.row_id AS row_id FROM entity_key k JOIN entry e ON e.id = k.row_id
        WHERE k.key = ? AND e.register = ? AND e.deleted_at IS NULL`,
      key,
      people,
    )
    .map((r) => r.row_id);
}

/** Whether any of these shares says `$me`, so the People rows are read only when one does. */
export const saysMe = (shares: readonly HeldShare[]): boolean => shares.some((s) => JSON.stringify(s.what).includes('"$me"'));

/** A list as the kernel's cache holds it, as much of it as the catalog reads. */
export type ListLike = {
  id: string;
  name: string;
  title?: string;
  state?: string;
  scopes?: unknown;
  owner_only?: true;
  fields: readonly (Record<string, unknown> & { id: string; type: string; retired?: boolean; scope?: ScopeDecl })[];
};

/**
 * The record's lists as the lens knows them: each field as the `where` package's spec, the title and scope fields
 * marked, and the roles. `keys` is the vault's index list, `people` the list `meet` writes, and the projects list is the
 * one declaring `scopes:`.
 */
export function catalogOf(lists: Iterable<ListLike>, roles: { keys: string; people: string | null }): Catalog {
  const out: CatalogList[] = [];
  for (const l of lists) {
    const fields: CatalogField[] = l.fields.map((f) => ({ ...(f as unknown as CatalogField), ...(f.id === l.title ? { title: true } : {}) }));
    const role: CatalogList['role'] = l.id === roles.keys ? 'keys' : l.id === roles.people ? 'people' : l.scopes !== undefined ? 'projects' : undefined;
    out.push({
      id: l.id,
      name: l.name,
      fields,
      ...(role === undefined ? {} : { role }),
      ...(l.owner_only === true ? { ownerOnly: true } : {}),
      ...(l.state === undefined ? {} : { state: l.state }),
    });
  }
  return { lists: out };
}

/**
 * The gate fields of one list (§2.6) read from the shares the record holds now: what any active share condition on it
 * names, and its scope field under a project share. A share set that cannot be read gates every field it could name,
 * which is every declared one.
 */
export function gateFieldsOf(sql: Pick<Sql, 'all'>, catalog: Catalog, list: string, nowMs: number, tz = 'UTC'): string[] {
  const shares = liveShares(sql);
  if (shares === null) return (catalog.lists.find((l) => l.id === list)?.fields ?? []).filter((f) => !f.retired).map((f) => f.id).sort();
  return gateFields(shares, catalog, list, nowMs, tz);
}

/**
 * The lens cache (§2.8): one answer per (person, token, epoch, declaration revision, member rows), good until the
 * instant the clock alone would change it, holding `size` of them and dropping the one used longest ago first.
 *
 * THE ANSWER IS FROZEN, so a caller that changes what it was handed cannot change the next caller's.
 */
export class LensCache<T> {
  readonly #held = new Map<string, { value: T; until: number }>();
  readonly size: number;
  constructor(size = 256) {
    this.size = size;
  }

  get(key: string, nowMs: number): { value: T } | undefined {
    const hit = this.#held.get(key);
    if (hit === undefined) return undefined;
    this.#held.delete(key);
    if (!(nowMs < hit.until)) return undefined;
    this.#held.set(key, hit);
    return { value: hit.value };
  }

  set(key: string, value: T, until: number): T {
    const frozen = freeze(value);
    this.#held.delete(key);
    this.#held.set(key, { value: frozen, until });
    while (this.#held.size > this.size) this.#held.delete(this.#held.keys().next().value as string);
    return frozen;
  }

  clear(): void {
    this.#held.clear();
  }

  get length(): number {
    return this.#held.size;
  }
}

const freeze = <T>(v: T): T => {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) freeze(x);
  }
  return v;
};
