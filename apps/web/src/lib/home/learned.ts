/**
 * What your answers taught, on Home: the record's `learned` as the last tile of the board (`Learned.svelte`). ENG-B05
 * on the screen: an answer given in Decide teaches the record what it will not ask again, and this says so in the
 * record's own words, at most three lines and a count of the rest.
 *
 * THROUGH THE RECORD'S OWN `learned` AND NOTHING ELSE. The record says each teaching as a line (`{ kind, line, at }`)
 * and how many more it held back (`more`); this file only keeps what a person can read. `kind` is the record's word
 * and is never drawn, and a line that is empty or a raw id (a ULID) is dropped.
 *
 * A TILE AND NEVER A QUESTION: nothing here asks, decides or folds, and nought draws nothing.
 *
 * IT NEVER FAILS THE SCREEN. A host built before the read answers `ROUTE_UNKNOWN` or `NOT_IN_THIS_BUILD`, a reader it
 * refuses answers a refusal, and an answer of another shape is none: each is `null`, and `null` draws nothing.
 *
 * A ROUTE-ONLY MODULE, like `text-faults.ts`: the client carries the route table as a value, so this is imported
 * lazily from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';

/** How many teachings the tile lists. The rest are counted in one line under them. */
export const LEARNED_SHOWN = 3;

/** One teaching, as the record says it: its kind (never drawn), its line, and when it was learned. */
export type LearnedRow = { kind: string; line: string; at: string | null };

/** The record's answer: the teachings it sent, and how many more it held back. */
export type Learned = { rows: LearnedRow[]; more: number };

/** What the tile draws: its heading, at most three lines, and the count of the rest ("and 4 more", or empty). */
export type LearnedTile = { heading: string; lines: string[]; more: string };

/** How the screen asks the record: a client's `call`, or anything shaped like it. */
export type Call = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** The tile's heading, the same on every record. */
export const LEARNED_HEADING = 'What your answers taught';

/** A raw id as the record mints one. Never a line a person reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads: the record's own words, said plainly. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*—\s*/gu, ', ').trim() : '');

/** When it was learned, as the record sent it: an instant in words or in milliseconds, else none. */
function atOf(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  const s = plain(v);
  return s === '' ? null : s;
}

/** One teaching the screen can say, or `null`: one with no line, or a line that is an id, is dropped. */
function rowOf(v: unknown): LearnedRow | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as { kind?: unknown; line?: unknown; at?: unknown };
  const line = plain(r.line);
  if (line === '' || ULID.test(line)) return null;
  return { kind: plain(r.kind), line, at: atOf(r.at) };
}

/**
 * The record's answer as what the screen holds, or `null`. A REFUSAL IS NOTHING, whichever it is, and so is an answer
 * with no list of teachings. `more` is a whole count, and anything else is none held back. Nought is an answer, and it
 * draws nothing.
 */
export function learnedOf(answer: unknown): Learned | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { rows?: unknown; more?: unknown };
  if (!Array.isArray(v.rows)) return null;
  const rows = v.rows.map(rowOf).filter((r): r is LearnedRow => r !== null);
  const more = typeof v.more === 'number' && Number.isInteger(v.more) && v.more > 0 ? v.more : 0;
  return { rows, more };
}

/** Ask the record's `learned`. `null` on a refusal, a method the host does not know, nought, or a call that threw. */
export async function readLearned(call: Call): Promise<Learned | null> {
  try {
    const found = learnedOf(await call('learned', {}));
    return found && found.rows.length > 0 ? found : null;
  } catch {
    return null;
  }
}

/** What the record at `base` learned from his answers. `null` for none, which draws nothing. */
export async function loadLearned(base: string, io?: Fetch): Promise<Learned | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await readLearned((name, args) => client.call(name, args));
  } catch {
    return null;
  }
}

/**
 * The tile: the heading, the first three lines in the record's words, and "and N more" counting both the lines past
 * three and what the record held back. `null` at nought, which draws nothing.
 */
export function learnedTile(found: Learned | null): LearnedTile | null {
  if (!found || found.rows.length === 0) return null;
  const lines = found.rows.slice(0, LEARNED_SHOWN).map((r) => r.line);
  const rest = found.rows.length - lines.length + found.more;
  return { heading: LEARNED_HEADING, lines, more: rest > 0 ? `and ${String(rest)} more` : '' };
}
