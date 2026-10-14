/**
 * What went stale, on Home: the record's own `stale` as lines a person can read (`Stale.svelte`).
 *
 * THROUGH THE RECORD'S OWN `stale` AND NOTHING ELSE. The record counts what went stale where the reader stands, a line
 * a kind, held to what that reader may read; this file only turns each into what a screen draws: its sentence, how
 * many, and the place it is cleared from.
 *
 * A PERSON IS GIVEN A PLACE, NEVER A CALL. Each line of the record's carries `clear`, the one call that clears it, said
 * for an agent ("handoff with drop ..."). None of it is kept here: steps nobody took are cleared where the agents'
 * work is read, a question that waited is answered in Decide, and a kind with no place of its own is words alone.
 *
 * IT NEVER FAILS THE SCREEN. A record with no such call, a reader it refuses, a record where nothing is stale and a
 * line that dropped all answer nothing, and nothing draws nothing: Home stands as it did before.
 *
 * A ROUTE-ONLY MODULE, like `matched.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';

/** How many kinds the tile lists. What is in the rest is counted in one line under them. */
export const STALE_SHOWN = 6;

/**
 * One kind of stale thing as it is drawn. `key` is the record's word for the kind and is never drawn; `href` is where
 * a person clears it, or `null` for a kind with no place of its own.
 */
export type StaleRow = { key: string; said: string; count: number; href: string | null };

/** Where each kind is cleared by a person: the page the agents pack declares, and Decide. */
const PLACE: Readonly<Record<string, string>> = { steps: '/p/agents', questions: '/decide' };

/**
 * The record's answer as the kinds to draw, in its order.
 *
 * A LINE THE SCREEN CANNOT SAY IS DROPPED: one with no sentence, no kind, or a count that is not a whole number above
 * none. A REFUSAL IS NOTHING, whichever it is: a host built before the read answers `NOT_IN_THIS_BUILD`, and that is
 * nothing a person can act on. A KIND IS SAID ONCE, as the record says it.
 */
export function staleRows(answer: unknown): StaleRow[] {
  const a = answer as { ok?: unknown; value?: { lines?: unknown } | null } | null | undefined;
  const lines = a?.ok === true ? a.value?.lines : undefined;
  if (!Array.isArray(lines)) return [];
  const rows: StaleRow[] = [];
  const seen = new Set<string>();
  for (const line of lines as unknown[]) {
    if (typeof line !== 'object' || line === null) continue;
    const l = line as { kind?: unknown; said?: unknown; count?: unknown };
    const kind = typeof l.kind === 'string' ? l.kind.trim() : '';
    const said = typeof l.said === 'string' ? l.said.trim() : '';
    const count = typeof l.count === 'number' && Number.isInteger(l.count) ? l.count : 0;
    if (kind === '' || said === '' || count <= 0 || seen.has(kind)) continue;
    seen.add(kind);
    rows.push({ key: kind, said, count, href: Object.hasOwn(PLACE, kind) ? PLACE[kind]! : null });
  }
  return rows;
}

/** The first six kinds to list, and how many things are in the kinds after them. */
export function staleShown(rows: readonly StaleRow[]): { shown: StaleRow[]; more: number } {
  return { shown: rows.slice(0, STALE_SHOWN), more: rows.slice(STALE_SHOWN).reduce((n, r) => n + r.count, 0) };
}

/**
 * THE ONE LINE ON THE BOARD (DIRECTION §39): "4 things went stale", "1 thing went stale", and `null` for none, which
 * draws nothing. It counts the things and not the kinds, every kind and not only the six listed.
 */
export function staleLine(rows: readonly StaleRow[]): string | null {
  const n = rows.reduce((sum, r) => sum + r.count, 0);
  if (n <= 0) return null;
  return n === 1 ? '1 thing went stale' : `${String(n)} things went stale`;
}

/** What went stale on the record at `base`. Always an answer, and an empty one where there is nothing to draw. */
export async function readStale(base: string, io?: Fetch): Promise<{ ok: true; value: StaleRow[] }> {
  try {
    return { ok: true, value: staleRows(await createClient({ base, ...(io ? { fetch: io } : {}) }).stale()) };
  } catch {
    return { ok: true, value: [] };
  }
}
