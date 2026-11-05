/**
 * The share rows as the lens reads them, the access epoch, and the lens cache.
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
import { gateFields, narrowFault, shareFault, targetReaches, type Catalog, type CatalogField, type CatalogList, type HeldShare, type Hours, type Narrow, type Share } from './lens.ts';
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
  personal?: true;
  fields: readonly (Record<string, unknown> & { id: string; type: string; retired?: boolean; scope?: ScopeDecl })[];
};

/**
 * The record's lists as the lens knows them: each field as the `where` package's spec, the title and scope fields
 * marked, and the roles. `keys` is the keychain's index list, `people` the list `meet` writes, and the projects list is the
 * one declaring `scopes:`.
 */
export function catalogOf(lists: Iterable<ListLike>, roles: { keys: string; people: string | null; kernel?: readonly string[] }): Catalog {
  const out: CatalogList[] = [];
  for (const l of lists) {
    const fields: CatalogField[] = l.fields.map((f) => ({ ...(f as unknown as CatalogField), ...(f.id === l.title ? { title: true } : {}) }));
    const role: CatalogList['role'] = l.id === roles.keys ? 'keys' : l.id === roles.people ? 'meets' : l.scopes !== undefined ? 'projects' : undefined;
    out.push({
      id: l.id,
      name: l.name,
      fields,
      ...(role === undefined ? {} : { role }),
      ...(l.owner_only === true ? { ownerOnly: true } : {}),
      ...(l.personal === true ? { personal: true } : {}),
      ...(roles.kernel?.includes(l.id) === true ? { kernel: true } : {}),
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

/* ------------------------------------------------------------------------------------------------ writes (§2.10) */

/** One share as the record keeps it: the grammar, and who made it, when, its version, and whether it ended. */
export type ShareKept = HeldShare & {
  bundle: string | null;
  template: string | null;
  note: string | null;
  parent_id: string | null;
  version: number;
  made_by: string;
  made_at: string;
  revoked_by: string | null;
};

/** What a write is handed: the share in the grammar, with its id when it changes one already kept. */
export type ShareInput = Share & { id?: string; bundle?: string | null; template?: string | null; note?: string | null; parent_id?: string | null };

export type ShareWriteDeps = { sql: Pick<Sql, 'one' | 'all' | 'exec'>; at: string; mint: () => string };

type KeptRow = ShareRow & {
  bundle: string | null;
  template: string | null;
  note: string | null;
  parent_id: string | null;
  version: number;
  made_by: string;
  made_at: string;
  revoked_by: string | null;
};

const KEPT = `${COLUMNS}, s.bundle, s.template, s.note, s.parent_id, s.version, s.made_by, s.made_at, s.revoked_by`;

const keptOf = (row: KeptRow): ShareKept | null => {
  try {
    return {
      ...shareOf(row),
      bundle: row.bundle,
      template: row.template,
      note: row.note,
      parent_id: row.parent_id,
      version: Number(row.version),
      made_by: row.made_by,
      made_at: row.made_at,
      revoked_by: row.revoked_by,
    };
  } catch {
    return null;
  }
};

/** One kept share by id, ended or not, or `null` when there is none or its JSON cannot be read. */
export function shareKept(sql: Pick<Sql, 'one'>, id: string): ShareKept | null {
  const row = sql.one<KeptRow>(`SELECT ${KEPT} FROM share s WHERE s.id = ?`, id);
  return row ? keptOf(row) : null;
}

/**
 * Every share on the record, newest first: the live ones, and the ones revoked since `since` when it is given. A row
 * that cannot be read is left out here and nowhere else: the lens already reads it as the stranger's answer.
 */
export function sharesKept(sql: Pick<Sql, 'all'>, since?: string): ShareKept[] {
  const rows =
    since === undefined
      ? sql.all<KeptRow>(`SELECT ${KEPT} FROM share s WHERE s.revoked_at IS NULL ORDER BY s.made_at DESC, s.id DESC`)
      : sql.all<KeptRow>(`SELECT ${KEPT} FROM share s WHERE s.revoked_at IS NULL OR s.revoked_at >= ? ORDER BY s.made_at DESC, s.id DESC`, since);
  return rows.map(keptOf).filter((s): s is ShareKept => s !== null);
}

/** The share as its event holds it (`from_v`/`to_v`): the grammar and its parent, so a past grant can be replayed. */
const said = (s: Share & { id: string; parent_id?: string | null }): string =>
  JSON.stringify({
    id: s.id,
    effect: s.effect,
    who: s.who,
    what: s.what,
    can: s.can,
    ...(s.caps === undefined ? {} : { caps: s.caps }),
    ...(s.hide === undefined ? {} : { hide: s.hide }),
    ...(s.when === undefined ? {} : { when: s.when }),
    ...(s.parent_id ? { parent_id: s.parent_id } : {}),
  });

/** Who a share is for, as an event's `field` says it: `person:p_1`, `group:g_1`, `email:a@b.c`. */
const granteeOf = (s: Share): string => `${s.who.kind}:${s.who.id}`;

/**
 * One grant change as the ledger keeps it (§2.10): the target is `share:<id>` of kind `share`, `field` the grantee, and
 * `from_v`/`to_v` the share's JSON before and after, so "who could see this row on 12 March" replays from them.
 */
function shareEvent(
  deps: ShareWriteDeps,
  by: string,
  kind: 'access.grant' | 'access.revoke',
  id: string,
  grantee: string,
  was: string | null,
  now: string | null,
  note: string | null,
): void {
  deps.sql.exec(
    'INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    deps.mint(),
    deps.at,
    by,
    kind,
    `share:${id}`,
    'share',
    grantee,
    was,
    now,
    note,
  );
}

/**
 * Keep one share, new or changed, with its `access.grant` event and the epoch moved, IN THE CALLER'S TRANSACTION.
 *
 * THE CALLER HAS CHECKED IT (`checkShare`, who may target whom): this refuses only what would corrupt the table, a
 * share that is not the grammar and a change to one that is not kept or has ended. A change keeps the id, moves the
 * version, and its event carries the share as it was.
 */
export function putShare(deps: ShareWriteDeps, by: string, input: ShareInput): { id: string; version: number } | { fault: string } {
  if (shareFault(input) !== null) return { fault: 'A share is the grammar: effect, who, what and can.' };
  const was = input.id === undefined ? null : shareKept(deps.sql, input.id);
  if (input.id !== undefined && (was === null || was.revoked_at)) return { fault: 'There is no live share with that id.' };
  const id = was?.id ?? `sh_${deps.mint()}`;
  const w = input.when ?? {};
  const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
  const cols = [
    input.bundle ?? was?.bundle ?? null,
    input.effect,
    input.who.kind,
    input.who.id,
    JSON.stringify(input.what),
    input.can,
    json(input.caps),
    json(input.hide),
    w.from ?? null,
    w.until ?? null,
    json(w.hours),
    w.once === true ? 1 : 0,
    input.template ?? was?.template ?? null,
    input.note ?? was?.note ?? null,
  ];
  let version = 1;
  if (was === null) {
    deps.sql.exec(
      `INSERT INTO share (id, bundle, effect, who_kind, who, what, can, caps, hide, starts_at, ends_at, hours, once, template, note, parent_id, version, made_by, made_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      id,
      ...cols,
      input.parent_id ?? null,
      by,
      deps.at,
    );
  } else {
    version = was.version + 1;
    deps.sql.exec(
      `UPDATE share SET bundle = ?, effect = ?, who_kind = ?, who = ?, what = ?, can = ?, caps = ?, hide = ?, starts_at = ?, ends_at = ?,
              hours = ?, once = ?, template = ?, note = ?, version = ? WHERE id = ?`,
      ...cols,
      version,
      id,
    );
  }
  const parent = was === null ? (input.parent_id ?? null) : was.parent_id;
  shareEvent(deps, by, 'access.grant', id, granteeOf(input), was === null ? null : said(was), said({ ...input, id, parent_id: parent }), input.note ?? null);
  /* A SHARE CHANGED SO IT REACHES LESS ENDS WHAT WAS SHARED ONWARD FROM IT. Each onward share was checked against this
     one as it was, and the lens reads every share on its own, so a manager held to less kept handing on what they had
     before. Only a change that keeps everything and at most runs longer leaves them be. */
  if (was !== null && !onlyLonger(was, input))
    for (const child of deps.sql.all<{ id: string }>('SELECT id FROM share WHERE parent_id = ? AND revoked_at IS NULL ORDER BY id', id))
      revokeShare(deps, by, child.id, `ended when ${id} changed`);
  bumpEpoch(deps.sql);
  return { id, version };
}

/** Whether a change to a share keeps everything it gave, and at most moves its end later or takes it away. */
function onlyLonger(was: ShareKept, now: ShareInput): boolean {
  const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const before = was.when ?? {};
  const after = now.when ?? {};
  const later = after.until === undefined || (before.until !== undefined && after.until >= before.until);
  return (
    was.effect === now.effect &&
    same(was.who, now.who) &&
    same(was.what, now.what) &&
    was.can === now.can &&
    same(was.caps, now.caps) &&
    same(was.hide, now.hide) &&
    same(before.from, after.from) &&
    same(before.hours, after.hours) &&
    (before.once ?? false) === (after.once ?? false) &&
    later
  );
}

/**
 * End one share AND EVERY SHARE MADE ONWARD FROM IT, at any depth (`parent_id`), each with its own `access.revoke`, and
 * the epoch moved once, IN THE CALLER'S TRANSACTION. Answers the ids ended, the asked one first; none when it had ended.
 */
export function revokeShare(deps: ShareWriteDeps, by: string, id: string, why?: string | null): string[] {
  const rows = deps.sql.all<{ id: string }>(
    `WITH RECURSIVE down(id, depth) AS (
       SELECT id, 0 FROM share WHERE id = ? AND revoked_at IS NULL
       UNION SELECT s.id, d.depth + 1 FROM share s JOIN down d ON s.parent_id = d.id WHERE s.revoked_at IS NULL AND d.depth < 64)
     SELECT id FROM down ORDER BY depth, id`,
    id,
  );
  const ended: string[] = [];
  for (const { id: one } of rows) {
    const kept = shareKept(deps.sql, one);
    deps.sql.exec('UPDATE share SET revoked_at = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL', deps.at, by, one);
    shareEvent(deps, by, 'access.revoke', one, kept ? granteeOf(kept) : 'unknown', kept ? said(kept) : null, null, one === id ? (why ?? null) : `ended with ${id}`);
    ended.push(one);
  }
  if (ended.length > 0) bumpEpoch(deps.sql);
  return ended;
}

/**
 * A list just installed that falls under somebody's whole-record or money share (§2.15): one `access.grant` per such
 * share, its grantee in `field` and the new list in the note, so the ledger says the grant widened and the Sharing page
 * can ask "Payroll is new. Lee can edit it. Keep it from Lee?". Answers how many were written. IN THE CALLER'S TRANSACTION.
 */
export function newListGrants(deps: ShareWriteDeps, catalog: Catalog, added: readonly string[]): number {
  if (added.length === 0) return 0;
  const lists = catalog.lists.filter((l) => added.includes(l.id));
  if (lists.length === 0) return 0;
  const broad = (s: ShareKept): boolean => 'record' in s.what || ('lists' in s.what && !Array.isArray(s.what.lists) && 'has' in s.what.lists);
  const live = sharesKept(deps.sql).filter((s) => s.effect === 'allow' && broad(s));
  let n = 0;
  for (const l of lists)
    for (const s of live) {
      if (!targetReaches(s.what, l)) continue;
      shareEvent(deps, 'system', 'access.grant', s.id, granteeOf(s), null, JSON.stringify({ list: l.id, share: JSON.parse(said(s)) as unknown }), `${l.name} is new`);
      n++;
    }
  return n;
}

/** The note a share's own end is said with in the ledger (§2.8), by the nightly pass and nowhere else. */
export const ENDED_ON_ITS_DATE = 'Ended on its date';

/**
 * WHEN SHARES END ON THEIR OWN (§2.8): one `access.revoke` per share whose date has passed, its note "Ended on its
 * date", so the log says when access stopped, IN THE CALLER'S TRANSACTION. A share's end is its `until`, or a day after
 * its first use for a once share, whichever is sooner. The row is left as it is: the lens already reads it as over, and
 * an owner may still give it a later date. So it is said once for each end: a share whose event already stands at or
 * after its end is not said again, and one given a later date and run out again is. Answers the ids said.
 */
export function endedShares(deps: ShareWriteDeps, nowMs: number): string[] {
  const rows = deps.sql.all<KeptRow>(
    `SELECT ${KEPT} FROM share s WHERE s.revoked_at IS NULL AND (s.ends_at IS NOT NULL OR (s.once = 1 AND s.first_used_at IS NOT NULL)) ORDER BY s.id`,
  );
  const out: string[] = [];
  for (const row of rows) {
    const ends = [row.ends_at === null ? NaN : Date.parse(row.ends_at), row.once === 1 && row.first_used_at !== null ? Date.parse(row.first_used_at) + 86_400_000 : NaN].filter(Number.isFinite);
    if (ends.length === 0) continue;
    const end = Math.min(...ends);
    if (end > nowMs) continue;
    const said_ = deps.sql.one(
      "SELECT 1 AS y FROM event WHERE target = ? AND kind = 'access.revoke' AND note = ? AND ts >= ? LIMIT 1",
      `share:${row.id}`,
      ENDED_ON_ITS_DATE,
      new Date(end).toISOString(),
    );
    if (said_ !== undefined) continue;
    const kept = keptOf(row);
    shareEvent(deps, 'system', 'access.revoke', row.id, kept ? granteeOf(kept) : `${row.who_kind}:${row.who}`, kept ? said(kept) : null, null, ENDED_ON_ITS_DATE);
    out.push(row.id);
  }
  return out;
}

/* ------------------------------------------------------------------------- people not on the record yet (slice 8) */

/**
 * The live shares waiting for an address, allow and deny, oldest first: what an invitation to it carries and what
 * accepting binds. A row that cannot be read is left out, as `sharesKept` leaves it.
 */
export function sharesWaiting(sql: Pick<Sql, 'all'>, email: string): ShareKept[] {
  return sql
    .all<KeptRow>(`SELECT ${KEPT} FROM share s WHERE s.who_kind = 'email' AND lower(s.who) = lower(?) AND s.revoked_at IS NULL ORDER BY s.made_at, s.id`, email)
    .map(keptOf)
    .filter((s): s is ShareKept => s !== null);
}

/**
 * Whether an address has something waiting for it now: a live allow that has not run out. AN INVITATION THAT CARRIES
 * NOTHING BUT SHARES IS GOOD ONLY WHILE THIS HOLDS, so stopping the last of them withdraws its link as well.
 */
export const waitingFor = (sql: Pick<Sql, 'all'>, email: string, nowMs: number): boolean =>
  sharesWaiting(sql, email).some((s) => s.effect === 'allow' && (s.when?.until === undefined || Date.parse(s.when.until) > nowMs));

/**
 * Every share waiting for an address, bound to the person who proved it, IN THE CALLER'S TRANSACTION: each moves from
 * `email` to `person`, its version on, with an `access.grant` whose `from_v` is the share as it was, and the epoch moves
 * once. Answers the ids bound.
 */
export function bindWaiting(deps: ShareWriteDeps, by: string, email: string, person: string, note: string | null): string[] {
  const out: string[] = [];
  for (const was of sharesWaiting(deps.sql, email)) {
    deps.sql.exec("UPDATE share SET who_kind = 'person', who = ?, version = version + 1 WHERE id = ? AND revoked_at IS NULL", person, was.id);
    const now = { ...was, who: { kind: 'person' as const, id: person } };
    shareEvent(deps, by, 'access.grant', was.id, granteeOf(now), said(was), said(now), note);
    out.push(was.id);
  }
  if (out.length > 0) bumpEpoch(deps.sql);
  return out;
}

/* ------------------------------------------------------------------------------------------------ groups (slice 8) */

/** One group as the Sharing page draws it: its name, its people by id, and how many live shares it holds. */
export type GroupKept = { id: string; name: string; made_by: string; made_at: string; retired_at: string | null; people: string[]; shares: number };

/** One group by id, retired or not, or `null` when there is none. */
export function groupKept(sql: Pick<Sql, 'one' | 'all'>, id: string): GroupKept | null {
  const g = sql.one<{ id: string; name: string; made_by: string; made_at: string; retired_at: string | null }>(
    'SELECT id, name, made_by, made_at, retired_at FROM share_group WHERE id = ?',
    id,
  );
  if (!g) return null;
  const people = sql.all<{ person_id: string }>('SELECT person_id FROM share_group_member WHERE group_id = ? ORDER BY added_at, person_id', id).map((r) => r.person_id);
  const shares = Number(sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM share WHERE who_kind = 'group' AND who = ? AND revoked_at IS NULL", id)?.n ?? 0);
  return { ...g, people, shares };
}

/** The live shares a group holds, oldest first. */
export const groupShares = (sql: Pick<Sql, 'all'>, group: string): ShareKept[] =>
  sql
    .all<KeptRow>(`SELECT ${KEPT} FROM share s WHERE s.who_kind = 'group' AND s.who = ? AND s.revoked_at IS NULL ORDER BY s.made_at, s.id`, group)
    .map(keptOf)
    .filter((s): s is ShareKept => s !== null);

/**
 * Make a group, or rename one (`id`), IN THE CALLER'S TRANSACTION. A group holds nothing until a share names it, so
 * neither writes an event; a group nobody can find is the only refusal.
 */
export function putGroup(deps: ShareWriteDeps, by: string, args: { id?: string; name: string }): { id: string } | { fault: string } {
  if (args.id !== undefined) {
    const g = groupKept(deps.sql, args.id);
    if (g === null || g.retired_at !== null) return { fault: 'There is no live group with that id.' };
    deps.sql.exec('UPDATE share_group SET name = ? WHERE id = ?', args.name, args.id);
    return { id: args.id };
  }
  const id = `gr_${deps.mint()}`;
  deps.sql.exec('INSERT INTO share_group (id, name, made_by, made_at) VALUES (?, ?, ?, ?)', id, args.name, by, deps.at);
  return { id };
}

/**
 * Retire a group, IN THE CALLER'S TRANSACTION: every share it holds ends with its own `access.revoke` (and every share
 * made onward from one), and the group is kept, retired, so the ledger's `group:` grantees still have a name. Answers
 * the ids ended.
 */
export function retireGroup(deps: ShareWriteDeps, by: string, id: string, why: string | null): string[] {
  const ended: string[] = [];
  for (const s of groupShares(deps.sql, id)) ended.push(...revokeShare(deps, by, s.id, why));
  deps.sql.exec('UPDATE share_group SET retired_at = ? WHERE id = ? AND retired_at IS NULL', deps.at, id);
  bumpEpoch(deps.sql);
  return ended;
}

/**
 * Put somebody in a group or take them out, IN THE CALLER'S TRANSACTION. EACH SHARE THE GROUP HOLDS IS SAID FOR THEM:
 * one `access.grant` per share on joining and one `access.revoke` per share on leaving, the grantee in `field` as
 * `person:<id>` and the group in the note, so "who could see this row on 12 March" replays a membership as it replays
 * a share. The epoch moves. Answers the ids of the shares said, or `null` when nothing changed.
 */
export function setGroupMember(deps: ShareWriteDeps, by: string, group: string, person: string, on: boolean): string[] | null {
  const g = groupKept(deps.sql, group);
  if (g === null || g.retired_at !== null) return null;
  if (g.people.includes(person) === on) return null;
  if (on) deps.sql.exec('INSERT INTO share_group_member (group_id, person_id, added_by, added_at) VALUES (?, ?, ?, ?)', group, person, by, deps.at);
  else deps.sql.exec('DELETE FROM share_group_member WHERE group_id = ? AND person_id = ?', group, person);
  const ids: string[] = [];
  for (const s of groupShares(deps.sql, group)) {
    const shape = said(s);
    shareEvent(deps, by, on ? 'access.grant' : 'access.revoke', s.id, `person:${person}`, on ? null : shape, on ? shape : null, `${on ? 'joined' : 'left'} ${g.name}`);
    ids.push(s.id);
  }
  bumpEpoch(deps.sql);
  return ids;
}
