/**
 * The list's and a row's writes against the record: add a row, change a row, and a note on a row.
 *
 * A ROUTE-ONLY MODULE, like `row-live.ts`: the client carries the route table as a value, so only the two register
 * screens that write import it.
 *
 * ONLY A LIVE SCREEN CALLS THIS. A screen drawing the sample never gets here and says `notWritten` as it always did.
 *
 * THE VALUES GO OUT IN THE RECORD'S SPELLING AND COME BACK IN THE SCREEN'S. The screen holds a ref as the number a
 * person says and an enum as whichever spelling the address carried; the record stores the target row's ULID and the
 * declared value. `entryOf` is the same reading the list's own answer goes through, so a row that was just written is
 * drawn exactly like one that was just read.
 *
 * THREE WAYS A WRITE DOES NOT LAND, and the screen treats each differently:
 * - `refused`: the record's own `fix` sentence, shown as it is.
 * - `conflict`: somebody moved the row first. The row as it now stands comes back (from the conflict, or read again),
 *   so the screen can draw it and say so.
 * - `unreachable`: nothing answered. A calm sentence rather than the socket's error text.
 */

import { createClient } from '@braindog/client';

import { copy } from '../copy.ts';
import { currencyFor, display, labelOf } from './api.ts';
import { REGISTERS } from './data.ts';
import { currencyOf } from './money.ts';
import { entryOf, orderOf, refMapOf, targetsOf, treeOf, type RecordRow, type RefMap, type Refs } from './remote.ts';
import type { Fetch } from './row-live.ts';
import type { Entry, Fields, Filter } from './schema.ts';
import { declaredValue } from './where.ts';

export type Wrote =
  | { ok: true; entry: Entry }
  | { ok: false; why: 'refused'; fix: string }
  | { ok: false; why: 'conflict'; fix: string; entry: Entry | null }
  | { ok: false; why: 'unreachable'; fix: string };

export type Noted = { ok: true } | { ok: false; why: 'refused' | 'unreachable'; fix: string };

type Failed = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: { current: unknown } };

const isRow = (v: unknown): v is RecordRow => v !== null && typeof v === 'object' && 'fields' in v && 'seq' in v;

/**
 * Fields as the record stores them.
 *
 * A REF GIVEN AS A NUMBER BECOMES ITS ROW'S ULID; one the map does not hold goes as it is, and the record names it. An
 * enum goes in its declared spelling. A number typed into a box arrives as text and goes as a number, unless it is not
 * one, in which case the record gets the text and says what is wrong with it.
 *
 * AND A `list<ref>` IS A REF EIGHT TIMES OVER, which this function did not know until a read-side repair made it
 * matter. The reader learned to resolve a list of row numbers back to their rows; this path still only resolved a
 * SINGLE ref, so a `because` cell holding `[3, 4]` drew as `3, 4`, and dropping one element sent `{because: ['4']}`
 * and came back `VALUE_MALFORMED: because[0] takes a row id or a spoken id like learnings#41`. Nothing was corrupted,
 * because the record refused, and every edit of every `list<ref>` cell on every live row page failed until this line.
 * Measured on a seeded kernel through the row page's own chain, `listFromDraft` then `outbound` then `update`.
 */
export function outbound(register: string, fields: Fields, refs: ReadonlyMap<string, RefMap>): Record<string, unknown> {
  const decl = REGISTERS[register];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const f = decl?.fields.find((x) => x.id === key);
    if (value === null || value === '') out[key] = null;
    else if (f?.type === 'ref' && f.to && (typeof value === 'number' || (typeof value === 'string' && /^\d+$/u.test(value))))
      out[key] = refs.get(f.to)?.idOf.get(Number(value)) ?? value;
    else if (f?.type === 'list' && f.of === 'ref' && f.to && Array.isArray(value))
      out[key] = value.map((one) =>
        typeof one === 'number' || (typeof one === 'string' && /^\d+$/u.test(one))
          ? (refs.get(f.to as string)?.idOf.get(Number(one)) ?? one)
          : one,
      );
    else if (f?.type === 'enum' && typeof value === 'string') out[key] = declaredValue(register, key, value);
    else if ((f?.type === 'int' || f?.type === 'decimal') && typeof value === 'string')
      out[key] = Number.isFinite(Number(value)) ? Number(value) : value;
    else out[key] = value;
  }
  return out;
}

/** What the list's address says about the rows on screen: the chips, the search box and the order. */
export type Address = { filters: readonly Filter[]; q: string; sort: { field: string; dir: 'asc' | 'desc' } | undefined };

export type Saved = { ok: true; slug: string; id: string } | { ok: false; why: 'refused' | 'unreachable'; fix: string };

/**
 * A saved view, as a page the kernel already validates: one table over the list, with the address's filter and order.
 *
 * A PAGE AND NOT A NAMED PREDICATE. `02 §5` makes a saved view a register's `predicates:`, and the kernel still refuses
 * that key (`REGISTER_UNBUILT`), so the view is the declaration the record can hold today: a page under Views, drawn
 * live at `/p/<slug>`, which `retireDeclaration` takes back out. The columns are the ones the list was drawing.
 */
export function viewPage(register: string, slug: string, title: string, address: Address, columns: readonly string[], refs: Refs): Record<string, unknown> {
  const where = treeOf(register, address.filters, address.q, refs);
  const order = orderOf(address.sort);
  return {
    page: slug,
    title,
    nav: { section: copy.viewsSection, order: 900 },
    requires: [`register.${register}`],
    blocks: [
      {
        kind: 'table',
        span: 12,
        source: `register.${register}`,
        ...(where ? { where } : {}),
        ...(order ? { order } : {}),
        ...(columns.length > 0 ? { columns: columns.slice(0, 16).map((field) => ({ field })) } : {}),
        empty: copy.viewEmpty,
      },
    ],
  };
}

/** A row the screen is holding still: where it was drawn, and what it was when it was pinned. */
export type Held = { at: number; entry: Entry };

/**
 * THE ROWS AS THE READER LAST SAW THEM, with a changed row where it was rather than where it now belongs.
 *
 * A WRITE MOVES A ROW AND THE READER DID NOT ASK IT TO. The record answers in its own order — `updated_at` first —
 * so the row somebody just marked `paid` comes back at the head of the next page, three screens from the one they
 * were reading. The row they were looking at is the one thing that must not move while they are looking at it.
 *
 * A HELD ROW THE ANSWER NO LONGER CARRIES COMES BACK ANYWAY, at the index it was pinned at, drawn from the copy
 * taken when it was held. That is the fold case: a row reopened under `state is paid` stops matching the list it
 * is in, and it belongs, for as long as the receipt is up, to the fold the reader is standing in rather than to
 * the one it now sorts into. Filtering it away the instant it changed would take the row off the screen at exactly
 * the moment the reader wants to check they hit the right one.
 *
 * THE LATEST VALUES, THE REMEMBERED PLACE. A held row still in the answer is drawn from the answer, so a second
 * write to it shows; only its position is the remembered one. `at` is clamped, because a hold taken at index 40 of
 * a page that has since been replaced by a shorter answer is a position that no longer exists.
 *
 * OLDEST HOLD FIRST, so two rows held in one gesture land in the order they were pinned rather than in map order.
 */
export function holdInPlace(entries: readonly Entry[], held: ReadonlyMap<number, Held>): Entry[] {
  if (held.size === 0) return [...entries];
  const out = entries.filter((e) => !held.has(e.seq));
  for (const hold of [...held.values()].sort((a, b) => a.at - b.at)) {
    const now = entries.find((e) => e.seq === hold.entry.seq) ?? hold.entry;
    out.splice(Math.min(hold.at, out.length), 0, now);
  }
  return out;
}

/** A captured row: the fields it goes out with, and what the screen filled in on the reader's behalf. */
export type Captured = { fields: Fields; filled: readonly string[] };

/**
 * ONE TYPED LINE, AS A ROW THE RECORD WILL ACCEPT.
 *
 * A TITLE-ONLY CAPTURE IS REFUSED ON THE LIST A PERSON OPENS MOST. `obligations` declares four required fields
 * beyond its title, so the cheapest write in the product answered the most common list with the record's own
 * `REQUIRED_MISSING` sentence. The line either fills them or it is a control that works everywhere except where it
 * is used.
 *
 * WHAT IT INFERS COMES FROM WHERE THE READER IS STANDING, in two layers:
 *
 *   THE ADDRESS. A chip in the URL is an answer already on screen, and asking for it again is asking somebody to
 *   repeat themselves to a machine that heard them. One value only: `in` with two values names a SET, and picking
 *   a member of a set for somebody is guessing at the one moment they have not said which. `is` and `in` both
 *   arrive here because the bar writes `in` and a hand-written URL writes `is`, and one spelling reaching the
 *   record and the other not would be the filter working on Tuesday.
 *
 *   THE DECLARATION. What is still required and still unanswered takes the emptiest value of its type: the first
 *   declared state, today's date, nothing owed. Each one is a value a person can see and change on the row, and
 *   every one of them is SAID — `filled` is the sentence the screen owes them, because a field filled in silently
 *   is the product writing a fact nobody told it.
 *
 * WHAT IT WILL NOT INVENT. A `ref` points at a row in another register and there is no emptiest one; a `text` or a
 * `document` is prose. Those go unfilled, the record refuses the row in its own words, and the line puts back what
 * was typed — which is the honest end of a write this screen cannot complete on its own.
 *
 * THE CURRENCY IS READ FROM THE ROWS ON SCREEN, never guessed. An amount under a code the list does not use is the
 * one formatting mistake this product cannot ship; with no rows to read and nothing declared, the field is left
 * out and the record says what it wants.
 */
export function capturedFields(
  register: string,
  said: string,
  filters: readonly Filter[],
  now: number,
  seen: readonly Entry[] = [],
): Captured {
  const decl = REGISTERS[register];
  if (!decl) return { fields: {}, filled: [] };
  const fields: Fields = { [decl.title]: said };

  for (const f of filters) {
    if (f.values.length !== 1 || (f.op !== 'is' && f.op !== 'in')) continue;
    const field = decl.fields.find((x) => x.id === f.field);
    if (!field || field.id === decl.title) continue;
    if (field.type !== 'enum' && field.type !== 'text') continue;
    const value = declaredValue(register, f.field, f.values[0] ?? '');
    if (field.type === 'enum' && !field.values?.includes(value)) continue;
    fields[f.field] = value;
  }

  const filled: string[] = [];
  for (const f of decl.fields) {
    if (!f.required || f.id === decl.title || Object.hasOwn(fields, f.id)) continue;
    const value = emptiest(register, f, now, seen);
    if (value === undefined) continue;
    fields[f.id] = value;
    filled.push(`${labelOf(f).toLowerCase()} ${display(register, f.id, value, now) ?? ''}`.trim());
  }
  return { fields, filled };
}

/** The emptiest value a required field can honestly take, or `undefined` where there is not one. */
function emptiest(register: string, f: { id: string; type: string; values?: readonly string[]; default?: unknown }, now: number, seen: readonly Entry[]): Fields[string] | undefined {
  switch (f.type) {
    case 'enum':
      return typeof f.default === 'string' && f.values?.includes(f.default) ? f.default : f.values?.[0];
    case 'day':
      return new Date(now).toISOString().slice(0, 10);
    case 'instant':
      return new Date(now).toISOString();
    case 'money': {
      for (const e of seen) {
        const held = currencyOf(e.fields[f.id]);
        if (held) return { amount: 0, currency: held };
      }
      const declared = currencyFor(register, f.id);
      return declared === null ? undefined : { amount: 0, currency: declared };
    }
    case 'int':
    case 'decimal':
      return 0;
    case 'bool':
      return false;
    default:
      return undefined;
  }
}

export type RowWriter = {
  create(register: string, fields: Fields, note?: string): Promise<Wrote>;
  update(register: string, seq: number, patch: Fields, version?: number): Promise<Wrote>;
  /** Archive a row: `deleted_at` set, so every list leaves it out and `restore` brings it back. */
  archive(register: string, seq: number, version?: number): Promise<Wrote>;
  restore(register: string, seq: number, version?: number): Promise<Wrote>;
  note(register: string, seq: number, note: string): Promise<Noted>;
  saveView(register: string, title: string, address: Address, columns: readonly string[]): Promise<Saved>;
  dropView(id: string): Promise<Noted>;
};

/** A writer for one tab. The ref maps it walks are kept, the way the readers keep theirs. */
export function rowWriter(base: string, io?: Fetch): RowWriter {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const maps = new Map<string, RefMap>();

  /** Each register this one's refs point at. A register this caller may not list is left out. */
  async function refsFor(register: string): Promise<Map<string, RefMap>> {
    const out = new Map<string, RefMap>();
    for (const target of targetsOf(register)) {
      const kept = maps.get(target);
      if (kept) {
        out.set(target, kept);
        continue;
      }
      const rows: RecordRow[] = [];
      let cursor: string | null = null;
      let whole = true;
      do {
        const got = await client.list({ register: target, limit: 500, ...(cursor === null ? {} : { cursor }) });
        if (!got.ok) {
          whole = false;
          break;
        }
        rows.push(...(got.value.rows as RecordRow[]));
        cursor = got.value.cursor;
      } while (cursor !== null);
      if (!whole) continue;
      const map = refMapOf(target, rows);
      maps.set(target, map);
      out.set(target, map);
    }
    return out;
  }

  async function failed(register: string, seq: number | null, out: Failed, refs: Map<string, RefMap>): Promise<Wrote> {
    const spoken = seq === null ? register : `${register}#${seq}`;
    const stale = 'conflict' in out || out.refusal.code === 'VERSION_STALE';
    if (stale && seq !== null) {
      let current = 'conflict' in out ? out.conflict.current : null;
      /* A STALE REFUSAL CARRIES NO ROW, so it is read again: the screen draws what the record holds now. */
      if (!isRow(current)) {
        const again = await client.get(register, seq);
        current = again.ok ? again.value : null;
      }
      return { ok: false, why: 'conflict', fix: copy.writeConflict(spoken), entry: isRow(current) ? entryOf(register, current, refs) : null };
    }
    if ('conflict' in out) return { ok: false, why: 'refused', fix: copy.writeConflict(spoken) };
    if (out.refusal.code === 'UNREACHABLE') return { ok: false, why: 'unreachable', fix: copy.writeNotReached };
    return { ok: false, why: 'refused', fix: out.refusal.fix };
  }

  /**
   * A NUMBER THE KEPT MAP DOES NOT HOLD may name a row added since the map was walked, here or in another tab, so that
   * map is walked once more before the write goes. Without this the number went as it was typed, not as its row's id.
   */
  async function refsHolding(register: string, fields: Fields): Promise<Map<string, RefMap>> {
    const refs = await refsFor(register);
    const decl = REGISTERS[register];
    let stale = false;
    for (const [key, value] of Object.entries(fields)) {
      const f = decl?.fields.find((x) => x.id === key);
      if (f?.type !== 'ref' || !f.to || !(typeof value === 'number' || (typeof value === 'string' && /^\d+$/u.test(value)))) continue;
      if (refs.get(f.to)?.idOf.has(Number(value)) === false) {
        maps.delete(f.to);
        stale = true;
      }
    }
    return stale ? refsFor(register) : refs;
  }

  /** A write that answers no row: the record's sentence, or the calm one when nothing answered. */
  const noted = (out: { ok: true } | Failed): Noted => {
    if (out.ok) return { ok: true };
    if ('refusal' in out && out.refusal.code === 'UNREACHABLE') return { ok: false, why: 'unreachable', fix: copy.writeNotReached };
    return { ok: false, why: 'refused', fix: 'refusal' in out ? out.refusal.fix : copy.writeRaced };
  };

  async function update(register: string, seq: number, patch: Fields, version?: number): Promise<Wrote> {
    const refs = await refsHolding(register, patch);
    const out = await client.update({ register, seq, patch: outbound(register, patch, refs), ...(version === undefined ? {} : { version }) });
    if (!out.ok) return failed(register, seq, out, refs);
    return { ok: true, entry: entryOf(register, out.value as RecordRow, refs) };
  }

  return {
    update,
    /* THE RECORD STAMPS ITS OWN INSTANT on a non-null `deleted_at`, so what is sent only has to be not null. */
    archive: (register, seq, version) => update(register, seq, { deleted_at: new Date().toISOString() }, version),
    restore: (register, seq, version) => update(register, seq, { deleted_at: null }, version),
    async saveView(register, title, address, columns) {
      const refs = await refsFor(register);
      const slug = `${register.replace(/_/g, '-')}-${Date.now().toString(36)}`;
      const out = await client.call('setDeclaration', { body: viewPage(register, slug, title, address, columns, refs) });
      const said = noted(out as { ok: true } | Failed);
      return said.ok ? { ok: true, slug, id: `page.${slug}` } : said;
    },
    async dropView(id) {
      return noted((await client.call('retireDeclaration', { id })) as { ok: true } | Failed);
    },
    async create(register, fields, note) {
      const refs = await refsHolding(register, fields);
      const out = await client.create({ register, fields: outbound(register, fields, refs), ...(note ? { note } : {}) });
      if (!out.ok) return failed(register, null, out, refs);
      /* THE NEW ROW IS NOT IN THIS REGISTER'S KEPT MAP, so the map is dropped and walked again when next asked for. */
      maps.delete(register);
      return { ok: true, entry: entryOf(register, out.value as RecordRow, refs) };
    },
    async note(register, seq, note) {
      const out = await client.log({ register, seq, note });
      if (out.ok) return { ok: true };
      if ('refusal' in out && out.refusal.code === 'UNREACHABLE') return { ok: false, why: 'unreachable', fix: copy.writeNotReached };
      return { ok: false, why: 'refused', fix: 'refusal' in out ? out.refusal.fix : copy.writeConflict(`${register}#${seq}`) };
    },
  };
}
