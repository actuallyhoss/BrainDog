/**
 * A row split into parts: one payment over three categories, each part a patch over its row (`parts_of`).
 *
 * THE FIELD. A `json` field that declares `parts_of: <a money field of the same list>` holds a list of at least two
 * parts. Each part is an object whose keys are other fields of the list, and it is read as its row with those fields
 * put over the row's own: `{ category: <Groceries>, amount: EGP 300.00 }` is the row, filed under Groceries, for
 * EGP 300.00. A key a part leaves out is the row's.
 *
 * THE PARTS ADD UP TO THE ROW, AND A WRITE THAT SAYS OTHERWISE IS REFUSED (`splitFault`). Each part is in the row's
 * currency, and a part's amount sent as a bare number takes it. So any sum of the money field reads the same over the
 * parts as over the row, and a sum cut by a field the parts carry reads each part under its own value.
 *
 * WHERE IT IS READ. A figure that adds up only that money field (`metrics.ts`), and a block that adds it up by a
 * label (`pages.ts`, the host's grouped query in `index.ts`), read a split row as its parts. A list of rows never
 * does: a row is a row.
 */

import type { Refusal, Result, Sql } from '@braindog/ports';
import type { Schema } from '@braindog/where';

import { coerce, isAbsent, type FieldDecl, type Json, type Lookups } from './coerce.ts';
import { moneyText } from './exponent.ts';
import { holdsSplit, splitView } from './split-view.ts';

/** The parts field of a list and the money field its parts add up to, or none. */
export type SplitField = { field: string; of: string };

/** Where a schema's parts are, read from the field that declares `parts_of`. */
export function splitOf(schema: Pick<Schema, 'fields'> | null | undefined): SplitField | null {
  if (!schema) return null;
  for (const [id, spec] of Object.entries(schema.fields)) {
    const of = (spec as { parts_of?: unknown }).parts_of;
    if (spec.type === 'json' && typeof of === 'string' && of !== '') return { field: id, of };
  }
  return null;
}

/** The same, over a list's declared fields. */
export function splitOfFields(fields: readonly { id: string; type: string; parts_of?: string | undefined }[]): SplitField | null {
  for (const f of fields) if (f.type === 'json' && typeof f.parts_of === 'string' && f.parts_of !== '') return { field: f.id, of: f.parts_of };
  return null;
}

/** A statement read over the parts view, its own `WITH` kept after the view's. */
export function overSplit(statement: string, register: string, field: string): string {
  const view = splitView(register, field);
  const lead = /^\s*WITH(\s+RECURSIVE)?\s+/iu.exec(statement);
  if (!lead) return `WITH ${view} ${statement}`;
  return `WITH${lead[1] ?? ''} ${view}, ${statement.slice(lead[0].length)}`;
}

/**
 * A statement as it reads a list's rows now: over the parts view where any row of the list is split, and straight off the
 * table where none is, which is the same rows and on a ledger of 20,000 lines 40 times the speed (`holdsSplit`, asked of the
 * rows for each statement and kept nowhere).
 */
export function overSplitNow(sql: Pick<Sql, 'one'>, statement: string, register: string, field: string): string {
  return holdsSplit(sql, register, field) ? overSplit(statement, register, field) : statement;
}

/** An `Sql` whose reads see each split row of `register` as its parts. Writes pass through untouched. */
export function bySplit(sql: Sql, register: string, split: SplitField): Sql {
  return {
    exec: (statement, ...params) => sql.exec(statement, ...params),
    all: (statement, ...params) => sql.all(overSplitNow(sql, statement, register, split.field), ...params),
    one: (statement, ...params) => sql.one(overSplitNow(sql, statement, register, split.field), ...params),
    transactionSync: (fn) => sql.transactionSync(fn),
  };
}

/** RFC 7396's merge, as `json_patch` does it: a key set to null is taken out. */
function patched(base: Record<string, Json>, patch: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else if (typeof value === 'object' && !Array.isArray(value) && typeof out[key] === 'object' && out[key] !== null && !Array.isArray(out[key]))
      out[key] = patched(out[key] as Record<string, Json>, value as Record<string, Json>);
    else out[key] = value;
  }
  return out;
}

/** Rows read as their parts where they hold any, as the view reads them: for a page that adds up rows it was handed. */
export function rowsBySplit<R extends { fields: Record<string, unknown> }>(rows: readonly R[], field: string): R[] {
  return rows.flatMap((row) => {
    const held = row.fields[field];
    if (!Array.isArray(held) || held.length === 0) return [row];
    return held
      .filter((p): p is Record<string, Json> => p !== null && typeof p === 'object' && !Array.isArray(p))
      .map((p) => ({ ...row, fields: patched(row.fields as Record<string, Json>, p) }));
  });
}

/* ── the write ─────────────────────────────────────────────────────────── */

const no = (fix: string, at: string): { ok: false; refusal: Refusal } => ({ ok: false, refusal: { code: 'VALUE_MALFORMED', fix, at } });

/**
 * The parts a write leaves on a row, checked and in the shape they are kept, or the refusal that says how to fix them.
 *
 * EACH PART names fields of the list other than the parts field and the list's state, each value coerced as its field
 * takes it (`look(key)` resolves a category's name or number as the field does). Its amount is in the row's currency:
 * a bare number of minor units takes it, and another currency is refused. AT LEAST TWO, and each more than nothing,
 * since one part is the row itself.
 *
 * THEY ADD UP TO THE ROW, to the minor unit. The sentence says by how much they are out and which way to move a part,
 * since that is the fix.
 */
export function splitFault(
  fields: readonly FieldDecl[],
  split: SplitField,
  merged: Record<string, Json>,
  state: string | undefined,
  look: (key: string) => Lookups,
): Result<Json[] | null> {
  const held = merged[split.field];
  if (held === undefined || isAbsent(held as Json)) return { ok: true, value: null };
  const at = split.field;
  if (!Array.isArray(held)) return no(`${at} is a list of parts, each like { category, amount }.`, at);
  if (held.length < 2) return no('A split has two parts or more. To keep one category, take the split off.', at);
  const line = merged[split.of] as { amount?: unknown; currency?: unknown } | undefined;
  if (!line || typeof line.amount !== 'number' || typeof line.currency !== 'string')
    return no(`Give the line its ${split.of} before splitting it.`, at);
  const currency = line.currency;
  const known = new Map(fields.map((f) => [f.id, f]));
  const out: Json[] = [];
  let total = 0;
  for (const [i, raw] of held.entries()) {
    const here = `${at}[${i}]`;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return no(`Part ${i + 1} is { category, amount }.`, here);
    const part: Record<string, Json> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const field = known.get(key);
      if (!field || key === split.field || key === state || key.startsWith('_') || (field as { derived?: boolean }).derived === true)
        return no(`Part ${i + 1} names ${key}, which a part cannot hold.`, `${here}.${key}`);
      if (value === null || value === undefined || value === '') continue;
      if (key === split.of) {
        const sent = typeof value === 'number' ? { amount: value, currency } : value;
        const { currency_from: _from, ...plain } = field;
        const got = coerce(plain, sent, look(key), `${here}.${key}`);
        if (!got.ok) return got;
        const money = got.value as { amount: number; currency: string };
        if (money.currency !== currency) return no(`Part ${i + 1} is in ${money.currency} and the line is in ${currency}. Give every part in ${currency}.`, `${here}.${key}`);
        if (money.amount <= 0) return no(`Part ${i + 1} is ${moneyText(money.amount, currency)}. Each part is more than nothing.`, `${here}.${key}`);
        part[key] = money;
        total += money.amount;
        continue;
      }
      const got = coerce(field, value, look(key), `${here}.${key}`);
      if (!got.ok) return got;
      if (!isAbsent(got.value)) part[key] = got.value;
    }
    if (part[split.of] === undefined) return no(`Part ${i + 1} has no amount.`, `${here}.${split.of}`);
    out.push(part);
  }
  if (total !== line.amount) {
    const gap = line.amount - total;
    return no(
      `The parts add up to ${moneyText(total, currency)} and the line is ${moneyText(line.amount, currency)}. ${gap > 0 ? 'Add' : 'Take'} ${moneyText(Math.abs(gap), currency)} ${gap > 0 ? 'to' : 'off'} a part so they match.`,
      at,
    );
  }
  return { ok: true, value: out };
}
