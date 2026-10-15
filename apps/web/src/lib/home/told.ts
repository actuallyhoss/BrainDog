/**
 * What every agent is told, on Home: the record's `learnings` as one tile below the fold (`Told.svelte`). AGT-C14
 * on the screen: a session that starts is handed what was learned and still stands, in the record's own order (a
 * method before a fact, this project before everywhere, the newest first), and this shows him the same lessons in
 * that same order, each with its because.
 *
 * THROUGH THE RECORD'S OWN `learnings` AND NOTHING ELSE. The record sends each lesson with its spoken id (`LN12`), its
 * kind, topic, place and days; this file keeps only what a person reads, the lesson and its because, and never
 * reorders them. The spoken id is a handle for an agent and is never drawn, and a lesson that is empty or a raw id
 * (a ULID) is dropped. What the record left out (replaced, faded, more than were asked) is counted in one foot line.
 *
 * A TILE AND NEVER A QUESTION: nothing here asks, confirms, replaces or folds, and nought draws nothing. Whether a
 * lesson is replaced is his to rule in the record (loop/progress/learnings-replaced-92.md), never this tile's.
 *
 * IT NEVER FAILS THE SCREEN. A host built before the read answers `ROUTE_UNKNOWN` or `NOT_IN_THIS_BUILD`, a reader it
 * refuses answers a refusal, and an answer of another shape is none: each is `null`, and `null` draws nothing.
 *
 * A ROUTE-ONLY MODULE, like `learned.ts`: the client carries the route table as a value, so this is imported lazily
 * from the screen that draws it and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';

/** How many lessons the tile asks the record for, and the most it lists. */
export const LESSONS_ASKED = 6;

/** One lesson as the screen says it: the lesson, and why, when the record says why. */
export type Lesson = { lesson: string; because: string | null };

/** The record's answer as the screen holds it: the lessons in its order, and what it left out. */
export type Lessons = { rows: Lesson[]; truncated: boolean; faded: number; replaced: number };

/** What the tile draws: its heading, one line a lesson, and the foot ("2 replaced, 3 faded, and more", or empty). */
export type LessonsTile = { heading: string; lines: Lesson[]; foot: string };

/** The tile's heading, the same on every record. */
export const LESSONS_HEADING = 'What every agent is told';

/** A raw id as the record mints one. Never a line a person reads. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;

/** Trimmed text, with no em dash in what a person reads: the record's own words, said plainly. */
const plain = (v: unknown): string => (typeof v === 'string' ? v.replaceAll(/\s*—\s*/gu, ', ').trim() : '');

/** A whole count above nought, else nought. */
const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0);

/** One lesson the screen can say, or `null`: one with no lesson, or a lesson that is an id, is dropped. */
function lessonOf(v: unknown): Lesson | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as { lesson?: unknown; because?: unknown };
  const lesson = plain(r.lesson);
  if (lesson === '' || ULID.test(lesson)) return null;
  const because = plain(r.because);
  return { lesson, because: because === '' || ULID.test(because) ? null : because };
}

/**
 * The record's answer as what the screen holds, or `null`. A REFUSAL IS NOTHING, whichever it is, and so is an answer
 * with no list of lessons. The order is the record's and is kept as it came. Nought is an answer, and it draws nothing.
 */
export function lessonsOf(answer: unknown): Lessons | null {
  const a = answer as { ok?: unknown; value?: unknown } | null | undefined;
  if (a?.ok !== true || typeof a.value !== 'object' || a.value === null) return null;
  const v = a.value as { rows?: unknown; truncated?: unknown; faded?: unknown; replaced?: unknown };
  if (!Array.isArray(v.rows)) return null;
  const rows = v.rows.map(lessonOf).filter((r): r is Lesson => r !== null);
  return { rows, truncated: v.truncated === true, faded: count(v.faded), replaced: count(v.replaced) };
}

/** What the record at `base` tells every agent, the first six. `null` on a refusal, an unknown method or a throw. */
export async function loadLessons(base: string, io?: Fetch): Promise<Lessons | null> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return lessonsOf(await client.learnings({ limit: LESSONS_ASKED }));
  } catch {
    return null;
  }
}

/**
 * The tile: the heading, one line a lesson in the record's order, and a foot that names only the counts above nought,
 * with "and more" when the record holds more than were asked. `null` at nought, which draws nothing.
 */
export function lessonsTile(found: Lessons | null): LessonsTile | null {
  if (!found || found.rows.length === 0) return null;
  const lines = found.rows.slice(0, LESSONS_ASKED);
  const parts: string[] = [];
  if (found.replaced > 0) parts.push(`${String(found.replaced)} replaced`);
  if (found.faded > 0) parts.push(`${String(found.faded)} faded`);
  if (found.truncated || found.rows.length > lines.length) parts.push('and more');
  return { heading: LESSONS_HEADING, lines, foot: parts.join(', ') };
}
