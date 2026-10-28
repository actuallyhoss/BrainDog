/**
 * A figure's reading held across reads while the lists it read stand (`readingHeld` in `index.ts`).
 *
 * WHY. A page read every figure it draws again on every ask, and so did the next page, and Today, and the project
 * cards: on a lived-in record most of a page's time went on figures over lists nobody had touched since the last ask,
 * while the one list that moves all day is the runs, which those figures never read. The record's own version moves
 * with every run's step, so a figure held by it was read again for every agent's write.
 *
 * WHAT A READING READ IS WATCHED, NOT DECLARED. The kernel's own `Sql` hands each read to `notice`, which notes each list a statement
 * names, by a bound value or a quoted word that is one of the record's lists. A statement over the rows that names no
 * list, or one over any table but the rows and the declarations (the log, the questions, a kept line), reads past the
 * lists (`whole`), and that reading is not held, nor one over the runs: they are read again each time. A bound instant
 * (`2026-10-28T09:00:00.000Z`) is a window that moves with the clock, and its reading is held only `HELD_SHORT_MS`.
 *
 * WHAT A LIST'S VERSION IS: the newest line of the log about one of its rows (walked once per line, `index.ts`), and
 * its newest row and how many it holds, so a row written with no line (an import) moves it too.
 */

import type { Param } from '@braindog/ports';

/** What one reading read, as `notice` saw it. */
export type ReadTrace = {
  /** The lists its statements named. */
  lists: Set<string>;
  /** It read past any one list: the rows with no list named, the log, the questions or a kept line. */
  whole: boolean;
  /** It bound an instant, so its window moves with the clock and not only with the day. */
  instant: boolean;
};

/** A fresh trace. */
export const traceOf = (): ReadTrace => ({ lists: new Set(), whole: false, instant: false });

/**
 * The tables a held reading may read: the rows, which rows are kept private, the declarations, the add-ons and the
 * record's own row, each of which `listsStamp` versions. A statement over any other table (the log, the questions, a
 * kept line, a walk's own words) reads past the lists, and so does one whose table this cannot name.
 */
const HELD_TABLES = new Set(['entry', 'entry_private', 'declaration', 'pack', 'record', 'json_each', 'json_tree']);
/** Each table a statement reads from, as `FROM t` or `JOIN t`, a schema's name taken off. */
const TABLES = /\b(?:FROM|JOIN)\s+(?:main\.)?([A-Za-z_][A-Za-z0-9_]*)/giu;
/** The rows' table, as a word: `entry`, never `entry_private` or `entry_fts`. */
const ROWS = /\bentry\b/u;
/** A quoted word that may be a list's id. */
const QUOTED = /'([a-z][a-z0-9_]{0,31})'/gu;
/** An instant as the kernel binds one. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;

/**
 * Note in `trace` what one read names: each list by a bound value or a quoted word that `known` says is one of the
 * record's lists, past every list for a table but those `listsStamp` versions or rows of no list named, and a bound
 * instant. The kernel's own `Sql` calls this for every read while a held reading is being read (`holdAcross`).
 */
export function notice(trace: ReadTrace, text: string, params: readonly Param[], known: (word: string) => boolean): void {
  if (trace.whole) return;
  for (const m of text.matchAll(TABLES))
    if (!HELD_TABLES.has(m[1]!.toLowerCase())) {
      trace.whole = true;
      return;
    }
  let named = false;
  for (const p of params) {
    if (typeof p !== 'string') continue;
    if (known(p)) {
      trace.lists.add(p);
      named = true;
    } else if (INSTANT.test(p)) trace.instant = true;
  }
  for (const m of text.matchAll(QUOTED))
    if (known(m[1]!)) {
      trace.lists.add(m[1]!);
      named = true;
    }
  if (!named && ROWS.test(text)) trace.whole = true;
}

/** What `inner` read, read by `outer` too: a reading inside another is one of the things the outer one read. */
export function within(outer: ReadTrace, inner: { lists: Iterable<string>; instant: boolean; whole?: boolean }): void {
  for (const list of inner.lists) outer.lists.add(list);
  if (inner.instant) outer.instant = true;
  if (inner.whole === true) outer.whole = true;
}

/** How long a reading that bound an instant, or read past any list, is held at most. */
export const HELD_SHORT_MS = 30_000;
/** How long any other reading is held at most, while its lists stand and the day where the record is holds. */
export const HELD_LONG_MS = 3_600_000;
/** The most readings held at once; past it the oldest goes. */
export const HELD_MOST = 600;

/** A reading held: what it was read against, when, for how long, whether its window moves with the clock, and the reading. */
export type Held<T> = { day: string; lists: readonly string[]; instant: boolean; stamp: string; at: number; ms: number; value: T };

/** The readings held, by key, the oldest first. */
export class HeldReadings<T> {
  readonly #held = new Map<string, Held<T>>();

  /** A held reading still good for `day` and `now`, by `stampOf` its lists. */
  get(key: string, day: string, now: number, stampOf: (lists: readonly string[]) => string): Held<T> | undefined {
    const was = this.#held.get(key);
    if (was === undefined) return undefined;
    if (was.day !== day || was.at > now || now - was.at >= was.ms || stampOf(was.lists) !== was.stamp) {
      this.#held.delete(key);
      return undefined;
    }
    return was;
  }

  /**
   * Hold a reading read with `trace`, stamped by `stampOf` its lists as they stand now. One that read past the lists, or
   * read one that is `loud` (the runs, whose rows move with no line), is not held: it is read again each time, as before.
   */
  set(key: string, day: string, now: number, trace: ReadTrace, value: T, stampOf: (lists: readonly string[]) => string, loud: (list: string) => boolean, most = HELD_LONG_MS): void {
    this.#held.delete(key);
    if (trace.whole || [...trace.lists].some(loud)) return;
    const lists = [...trace.lists].sort();
    this.#held.set(key, { day, lists, instant: trace.instant, stamp: stampOf(lists), at: now, ms: Math.min(most, trace.instant ? HELD_SHORT_MS : HELD_LONG_MS), value });
    if (this.#held.size > HELD_MOST) this.#held.delete(this.#held.keys().next().value as string);
  }

  clear(): void {
    this.#held.clear();
  }
}
