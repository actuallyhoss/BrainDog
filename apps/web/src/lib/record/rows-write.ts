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
import { REGISTERS } from './data.ts';
import { entryOf, refMapOf, targetsOf, type RecordRow, type RefMap } from './remote.ts';
import type { Fetch } from './row-live.ts';
import type { Entry, Fields } from './schema.ts';
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
 */
export function outbound(register: string, fields: Fields, refs: ReadonlyMap<string, RefMap>): Record<string, unknown> {
  const decl = REGISTERS[register];
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const f = decl?.fields.find((x) => x.id === key);
    if (value === null || value === '') out[key] = null;
    else if (f?.type === 'ref' && f.to && (typeof value === 'number' || (typeof value === 'string' && /^\d+$/u.test(value))))
      out[key] = refs.get(f.to)?.idOf.get(Number(value)) ?? value;
    else if (f?.type === 'enum' && typeof value === 'string') out[key] = declaredValue(register, key, value);
    else if ((f?.type === 'int' || f?.type === 'decimal') && typeof value === 'string')
      out[key] = Number.isFinite(Number(value)) ? Number(value) : value;
    else out[key] = value;
  }
  return out;
}

export type RowWriter = {
  create(register: string, fields: Fields, note?: string): Promise<Wrote>;
  update(register: string, seq: number, patch: Fields, version?: number): Promise<Wrote>;
  note(register: string, seq: number, note: string): Promise<Noted>;
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
      const rows: Pick<RecordRow, 'id' | 'seq'>[] = [];
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
      const map = refMapOf(rows);
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

  return {
    async create(register, fields, note) {
      const refs = await refsHolding(register, fields);
      const out = await client.create({ register, fields: outbound(register, fields, refs), ...(note ? { note } : {}) });
      if (!out.ok) return failed(register, null, out, refs);
      /* THE NEW ROW IS NOT IN THIS REGISTER'S KEPT MAP, so the map is dropped and walked again when next asked for. */
      maps.delete(register);
      return { ok: true, entry: entryOf(register, out.value as RecordRow, refs) };
    },
    async update(register, seq, patch, version) {
      const refs = await refsHolding(register, patch);
      const out = await client.update({ register, seq, patch: outbound(register, patch, refs), ...(version === undefined ? {} : { version }) });
      if (!out.ok) return failed(register, seq, out, refs);
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
