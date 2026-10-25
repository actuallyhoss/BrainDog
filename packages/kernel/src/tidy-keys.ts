/**
 * `keys-unopened` (AGT-D17): the sealed keys nobody has opened in six months.
 *
 * WHAT WAS THERE BEFORE. Every opening adds one to its grant's `opened` and stamps `last_opened` (`keychain.ts` `openGrant`,
 * and the lease a connector's run is handed), and nothing read the two but the Keychain's own line for the key. A key
 * sealed two years ago and never opened looked the same as one opened this morning.
 *
 * WHAT IS COUNTED. A thing on any list with a sealed field, not deleted and not finished, whose sealed field names a
 * grant still in service, sealed (or last given a new value) more than 180 days ago, and never opened since or last
 * opened more than 180 days ago. An opening by a person and one by an agent's run are the same stamp. A field that holds
 * nothing is not counted, and one that names a grant revoked or gone is `keys-unopenable`'s, never this one's.
 *
 * COUNTED ONLY, AND HELD OFF THERE. The finder answers `ask: null` every time, as the finders that only count do, so the
 * tidy files nothing for it, by day or in the night: `tidy` and `tidyHour` file a question only for a finder that offers
 * one. It writes nothing, folds nothing and closes nothing. The question it would put is `askOfKeysUnopened`, here as
 * words only, for the part that later asks it once; until that part, the person's own revoke stays the only way out.
 *
 * NO NEW COLUMN: every day read here is one the keychain already keeps.
 */

import { unprivate } from '@braindog/where';
import type { Sql } from '@braindog/ports';

import type { Finder, TidyAsk } from './tidy.ts';

const DAY_MS = 86_400_000;

/** How long a sealed key may go unopened before it is counted: six months. */
export const UNOPENED_DAYS = 180;
export const UNOPENED_MS = UNOPENED_DAYS * DAY_MS;

/** A list that seals a value: its id, its sealed fields, its finished states and the field its things are called by. */
export type SealedList = { list: string; sealed: string[]; done: string[]; title: string | null };

/** Every live list with a sealed field that is not retired, read from its declaration. */
export function sealedLists(sql: Sql): SealedList[] {
  return sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'register' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)")
    .flatMap((r) => {
      const body = JSON.parse(r.body) as { id?: unknown; done?: unknown; fields?: unknown; title?: unknown };
      const sealed = (Array.isArray(body.fields) ? (body.fields as { id?: unknown; type?: unknown; retired?: unknown }[]) : [])
        .filter((f) => f?.type === 'secret' && f.retired !== true && typeof f.id === 'string')
        .map((f) => f.id as string);
      const done = Array.isArray(body.done) ? body.done.filter((d): d is string => typeof d === 'string') : [];
      const title = typeof body.title === 'string' && body.title !== '' ? body.title : null;
      return typeof body.id === 'string' && sealed.length > 0 ? [{ list: body.id, sealed, done, title }] : [];
    });
}

/** A field of a thing, read in SQL, its name quoted for both quotes. */
export const fieldOf = (field: string): string => `json_extract(fields, '$."${field.replaceAll('"', '""').replaceAll("'", "''")}"')`;

/** The test that a sealed field names a grant in service, sealed before `?` and not opened since `?`. */
const unopened = (g: string): string =>
  `EXISTS (SELECT 1 FROM grant WHERE id = ${g} AND revoked_at IS NULL
     AND julianday(coalesce(rotated_at, created_at)) < julianday(?)
     AND (last_opened IS NULL OR julianday(last_opened) < julianday(?)))`;

/** The WHERE for one list's unopened keys, and its parameters after the list's id and finished states. */
function whereOf(l: SealedList, since: string): { where: string; params: string[] } {
  /* A KEY ROW ITS MAKER KEPT PRIVATE IS NOT COUNTED OR NAMED: this answer is shared, so it reads as nobody (`''`). */
  const where = `register = ? AND deleted_at IS NULL AND coalesce(state, '') NOT IN (SELECT value FROM json_each(?))
    AND (${l.sealed.map((f) => unopened(fieldOf(f))).join(' OR ')}) AND ${unprivate('entry.id')}`;
  return { where, params: [l.list, JSON.stringify(l.done), ...l.sealed.flatMap(() => [since, since]), ''] };
}

/**
 * How many sealed keys nobody has opened in six months, at `nowMs`. NOTHING, NEVER NOUGHT, on a record where no list
 * seals a value: there nought would say the keys were looked at.
 */
export function countKeysUnopened(sql: Sql, nowMs: number): number | null {
  const lists = sealedLists(sql);
  if (lists.length === 0) return null;
  const since = new Date(nowMs - UNOPENED_MS).toISOString();
  let n = 0;
  for (const l of lists) {
    const { where, params } = whereOf(l, since);
    n += Number(sql.one<{ n: number }>(`SELECT COUNT(*) AS n FROM entry WHERE ${where}`, ...params)?.n ?? 0);
  }
  return n;
}

/** One unopened key as the question names it: what it is called, what it opens, and the day it was last opened. */
export type UnopenedKey = { name: string; opens: string; last_opened: string | null };

/**
 * The unopened keys by name, oldest opening first and never-opened before them, at most `most`. The name is the thing's
 * own title, else the grant's label; never an id. The day is `YYYY-MM-DD`, or `null` for a key never opened.
 */
export function unopenedKeys(sql: Sql, nowMs: number, most = 20): UnopenedKey[] {
  const since = new Date(nowMs - UNOPENED_MS).toISOString();
  const out: UnopenedKey[] = [];
  for (const l of sealedLists(sql)) {
    const { where, params } = whereOf(l, since);
    /* SQLite's `coalesce` takes two or more, so a list with one sealed field names it alone. */
    const grantOf = l.sealed.length === 1 ? fieldOf(l.sealed[0]!) : `coalesce(${l.sealed.map(fieldOf).join(', ')})`;
    const rows = sql.all<{ name: string | null; label: string | null; opens: string | null; last_opened: string | null }>(
      `SELECT ${l.title === null ? 'NULL' : fieldOf(l.title)} AS name, g.label AS label, g.opens AS opens, g.last_opened AS last_opened
         FROM entry LEFT JOIN grant g ON g.id = ${grantOf} WHERE ${where}`,
      ...params,
    );
    for (const r of rows)
      out.push({ name: (r.name ?? '').trim() || (r.label ?? '').trim() || 'A key with no name', opens: r.opens ?? '', last_opened: r.last_opened?.slice(0, 10) ?? null });
  }
  const day = (k: UnopenedKey): string => k.last_opened ?? '';
  return out.sort((a, b) => day(a).localeCompare(day(b)) || a.name.localeCompare(b.name)).slice(0, most);
}

/**
 * The unit's one question, as words only: "12 keys have not been opened in six months. Retire them?". Nothing here
 * files it. Retiring moves the things to their list's finished state and never destroys a value.
 */
export function askOfKeysUnopened(n: number): TidyAsk {
  const one = n === 1;
  return {
    question: `${n} ${one ? 'key has' : 'keys have'} not been opened in six months. Retire ${one ? 'it' : 'them'}?`,
    does: `Moves ${one ? 'it' : 'them'} to ${one ? 'its' : 'their'} list's finished state. No value is destroyed: revoking one stays yours.`,
  };
}

/** `keys-unopened`, the finder. Counted only: its `ask` is always `null`, so nothing is ever filed for it. */
export const keysUnopened: Finder = {
  id: 'keys-unopened',
  name: 'Sealed keys nobody has opened',
  find: (sql, nowMs) => ({ stale: countKeysUnopened(sql, nowMs) ?? 0, did: 0, ask: null }),
};
