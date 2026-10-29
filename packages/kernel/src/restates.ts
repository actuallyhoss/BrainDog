/**
 * NET WORTH RESTATED BY A PRICE A LIST KEEPS (`restates:` on a register). The night's net worth is said again in a unit
 * that does not move with the home currency: a list of prices declares which money field is the price of one unit,
 * which day field dates it, which of its rows are the price in use, and the night's field the worth over that price is
 * written to.
 *
 *   restates: { night: 'worth_in_units', price: 'per_unit', day: 'on', match: { grade: 'pure', live: true } }
 *
 * THE LIST SAYS IT, AND THE KERNEL NAMES NO LIST, FIELD OR UNIT. Before this file the kernel read one add-on's list of
 * gold rates by its id, the 24k row by its karat and the night's field by its name (`worth-grams.ts`). An add-on that
 * keeps prices of anything now declares the same four things and the night is restated by it, with nothing here
 * changed. The night's field is the night list's to declare: a decimal, and nothing is written where it does not.
 *
 * THE NEWEST PRICE IN USE: the rows `match` lets through, by `day` newest first, then by number, converted into the
 * night's currency the way every figure is (`into`). A price that cannot be read or converted writes nothing.
 *
 * NOTHING HERE IMPORTS THE REST OF THE KERNEL BUT ITS TYPES. `declare.ts` checks a declared `restates` with
 * `restatesFault` at install, and `index.ts` reads it each night with `restatedWorth`.
 */

import type { Refusal, Sql } from '@braindog/ports';

import type { Json } from './coerce.ts';

/** What a list says with `restates:`, each part naming a field. */
export type Restates = { night: string; price: string; day: string; match?: Readonly<Record<string, string | number | boolean>> };

type FieldSeen = { id: string; type: string; retired?: boolean };

const ID = /^[a-z][a-z0-9_]{0,62}$/u;
const KEYS = ['night', 'price', 'day', 'match'];
const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** `restates` as read off a list's body, or `null` when it does not say one. */
export function restatesOf(body: unknown): Restates | null {
  if (!isMap(body) || !isMap(body.restates)) return null;
  const r = body.restates;
  if (typeof r.night !== 'string' || typeof r.price !== 'string' || typeof r.day !== 'string') return null;
  const match = isMap(r.match) ? (r.match as Restates['match']) : undefined;
  return { night: r.night, price: r.price, day: r.day, ...(match ? { match } : {}) };
}

/** Why a list's `restates` cannot be read, or `null`. */
export function restatesFault(id: string, fields: readonly FieldSeen[], said: unknown): Refusal | null {
  const bad = (fix: string, at: string): Refusal => ({ code: 'DECLARATION_INVALID', fix, at } as Refusal);
  const live = fields.filter((f) => f.retired !== true);
  const of = (type: string): string[] => live.filter((f) => f.type === type).map((f) => f.id);
  if (!isMap(said) || Object.keys(said).some((k) => !KEYS.includes(k)))
    return bad(`${id}'s restates is { night, price, day, match }: the night's field it fills, the money field that is one unit's price, the day it is of, and which rows are in use.`, 'restates');
  if (typeof said.night !== 'string' || !ID.test(said.night)) return bad(`${id}'s restates night is the id of a decimal field of the night list.`, 'restates.night');
  if (typeof said.price !== 'string' || !of('money').includes(said.price))
    return bad(`${id}'s restates price is one of its money fields${of('money').length > 0 ? ` (${of('money').join(', ')})` : ', and it has none'}.`, 'restates.price');
  if (typeof said.day !== 'string' || !of('day').includes(said.day))
    return bad(`${id}'s restates day is one of its day fields${of('day').length > 0 ? ` (${of('day').join(', ')})` : ', and it has none'}.`, 'restates.day');
  if (said.match !== undefined) {
    if (!isMap(said.match)) return bad(`${id}'s restates match is { field: value }, the rows that are the price in use.`, 'restates.match');
    for (const [k, v] of Object.entries(said.match)) {
      if (!live.some((f) => f.id === k)) return bad(`${id}'s restates match names ${k}, which is not one of its fields.`, `restates.match.${k}`);
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') return bad(`${id}'s restates match gives ${k} a text, a number or true or false.`, `restates.match.${k}`);
    }
  }
  return null;
}

/**
 * The night's worth restated by every list that declares `restates`, each into the night field it names where the night
 * list declares it. `into` converts an amount in minor units from one currency to another, or answers `null`.
 */
export function restatedWorth(
  sql: Sql,
  lists: Iterable<{ id: string; body: unknown }>,
  nightFields: ReadonlyMap<string, string>,
  worth: number,
  currency: string,
  into: (amount: number, from: string, to: string) => number | null,
): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const list of lists) {
    const r = restatesOf(list.body);
    if (r === null || nightFields.get(r.night) !== 'decimal' || Object.hasOwn(out, r.night)) continue;
    const match = Object.entries(r.match ?? {});
    /* EVERY NAME IN THE QUERY IS A DECLARED ID, held to `ID` at install, and every value is bound. */
    if (![r.price, r.day, ...match.map(([k]) => k)].every((f) => ID.test(f))) continue;
    const where = match.map(([k]) => `AND json_extract(fields, '$.${k}') = ?`).join(' ');
    const bound = match.map(([, v]) => (v === true ? 1 : v === false ? 0 : v));
    const row = sql.one<{ price: string | null }>(
      `SELECT json_extract(fields, '$.${r.price}') AS price FROM entry
        WHERE register = ? AND deleted_at IS NULL ${where}
        ORDER BY json_extract(fields, '$.${r.day}') DESC, seq DESC LIMIT 1`,
      list.id,
      ...bound,
    );
    let unit: { amount?: unknown; currency?: unknown } | null = null;
    try {
      unit = row?.price ? (JSON.parse(row.price) as { amount?: unknown; currency?: unknown }) : null;
    } catch {
      unit = null;
    }
    if (!unit || typeof unit.amount !== 'number' || unit.amount <= 0 || typeof unit.currency !== 'string') continue;
    const per = into(unit.amount, unit.currency, currency);
    if (per !== null && per > 0) out[r.night] = Math.round((worth / per) * 100) / 100;
  }
  return out;
}
