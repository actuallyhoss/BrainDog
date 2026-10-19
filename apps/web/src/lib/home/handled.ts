/**
 * What BrainDog arranged by itself today, as one tile on Today (`Handled.svelte`). DIRECTION d3: a change that only
 * arranges his own rows happens with a mark, the reason and an Undo, and is told here in a short list instead of being
 * asked on Decide. One line each, the record's reason under it, and one Undo that puts that whole batch back.
 *
 * THROUGH THE RECORD'S OWN `handled` AND NOTHING ELSE. A line with no decision handle, or no words, or words that are a
 * raw id (a ULID), is dropped. Nothing is drawn at nought, and it never fails the screen: a host built before the read
 * answers `ROUTE_UNKNOWN` or a refusal, and either is `null`.
 *
 * A ROUTE-ONLY MODULE, like `learned.ts`: imported lazily from the screen that draws it, never by anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';

/** How many lines the tile lists. The record sends at most twenty; the rest are counted in one line. */
export const HANDLED_SHOWN = 5;

/** The tile's words, the same on every record. */
export const HANDLED_WORDS = {
  heading: 'Handled today',
  undo: 'Undo',
  undone: 'Put back.',
  more: (n: number) => `and ${String(n)} more`,
} as const;

/** One thing BrainDog did: the decision that puts it back, one line, the reason under it, and when. */
export type HandledLine = { decision: string; line: string; why: string; at: string | null };

/** What the record answers: today's lines newest first and how many it held back past its own limit. */
export type Handled = { rows: HandledLine[]; more: number };

/** What the tile draws: its heading, the first lines, and "and N more" for the rest, or empty. */
export type HandledTile = { heading: string; lines: HandledLine[]; more: string };

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** A raw id as the record mints one. Never a line a person reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*—\s*/gu, ', ').trim() : '');

function rowOf(v: unknown): HandledLine | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as { decision?: unknown; line?: unknown; why?: unknown; at?: unknown };
  const decision = plain(r.decision);
  const line = plain(r.line);
  if (decision === '' || line === '' || ULID.test(line)) return null;
  const at = plain(r.at);
  return { decision, line, why: plain(r.why), at: at === '' ? null : at };
}

/** The record's answer as what the screen holds, or `null` for a refusal or an answer of another shape. */
export function handledOf(answer: unknown): Handled | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { rows?: unknown; more?: unknown };
  if (!Array.isArray(v.rows)) return null;
  const rows = v.rows.map(rowOf).filter((r): r is HandledLine => r !== null);
  const more = typeof v.more === 'number' && Number.isInteger(v.more) && v.more > 0 ? v.more : 0;
  return { rows, more };
}

/** Ask the record's `handled`. `null` on a refusal, an unknown method, nought, or a call that threw. */
export async function readHandled(call: Call): Promise<Handled | null> {
  try {
    const found = handledOf(await call('handled', {}));
    return found && found.rows.length > 0 ? found : null;
  } catch {
    return null;
  }
}

/** What the record at `base` arranged today. `null` for none, which draws nothing. */
export async function loadHandled(base: string, io?: Fetch): Promise<Handled | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await readHandled((name, args) => client.call(name, args));
  } catch {
    return null;
  }
}

/** The tile: the first lines and the count of the rest. `null` at nought, which draws nothing. */
export function handledTile(found: Handled | null): HandledTile | null {
  if (!found || found.rows.length === 0) return null;
  const lines = found.rows.slice(0, HANDLED_SHOWN);
  const rest = found.rows.length - lines.length + found.more;
  return { heading: HANDLED_WORDS.heading, lines, more: rest > 0 ? HANDLED_WORDS.more(rest) : '' };
}
