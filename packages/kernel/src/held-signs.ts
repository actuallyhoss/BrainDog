/**
 * The vital signs held across reads until something one read is written, or the clock moves its answer (`signsHeldNow`
 * in `index.ts`).
 *
 * WHY. About half of his Today's record time was the vital signs behind "signs need a look", read again on every open:
 * each was held 30 s at most, because a sign may say how long ago something was, and most were never held at all,
 * because they read past the lists (the log, the questions, what arrived, the schedule), which a figure's hold cannot
 * version (`held-readings.ts`). A sign is now held until one of three things:
 *
 * - SOMETHING IT READ IS WRITTEN. The kernel counts the writes it makes to each table (`tablesWritten`), and a sign's
 *   reading is stamped with the counts of the tables it read, the lists it read by their own versions (`listsStamp`),
 *   and, where it read the log, the questions or the record's own settings, the newest line of the log: the record's
 *   few writes past the kernel to those tables each leave a line beside them (`tools-seen.ts`, `door-switch.ts`), as
 *   the alarm's change marker reads them (`changeStamp`).
 * - ITS ANSWER MOVES BY THE CLOCK ALONE, which its reader tells (`SignLasts` in `signs.ts`): a message turning a day
 *   old, a feed two periods late, a run leaving the week. A reader that tells nothing is read again after
 *   `HELD_SHORT_MS`, as every sign was.
 * - THE DAY WHERE THE RECORD IS TURNS, or `HELD_LONG_MS` passes, the most any reading is held.
 *
 * Held in the object's memory only: a record started again reads each sign once more. PURE, and Node loads it.
 */

import type { Param } from '@braindog/ports';

import { HELD_LONG_MS } from './held-readings.ts';
import { readsOf, tableAt } from './sql-reads.ts';

/** What one sign's reading read, as the kernel's `Sql` saw it (`noticeSign`). */
export type SignTrace = {
  /** Every table its statements read from, lower case. */
  tables: Set<string>;
  /** The lists its statements bound the rows' list to (`register = ?`, `register IN ('a', ?)`). */
  lists: Set<string>;
  /** It read the rows with no list named, so any row written may move it. */
  rows: boolean;
  /** It wrote, or read a table this could not name, so it is not held. */
  wrote: boolean;
};

/** A fresh trace. */
export const signTraceOf = (): SignTrace => ({ tables: new Set(), lists: new Set(), rows: false, wrote: false });

/**
 * Note in `trace` what one read names: its tables, and the lists it holds the rows to, or the rows of none
 * (`readsOf`, `sql-reads.ts`).
 *
 * A LIST IS NAMED ONLY WHERE THE LIST COLUMN IS BOUND TO IT (`register = ?`, `register IN (...)`), never by a value
 * elsewhere in the statement that happens to be a list's id: `actor = 'system'` on a record with a list called
 * `system` read every list's rows and was held on that one list alone (review 3, P3). And the rows are held to their
 * lists only where each read of them is narrowed so: a second read of the rows with no list of its own (a join to the
 * project a row belongs to) reads the rows of any list. A table this cannot name is read again each time, as a write is.
 */
export function noticeSign(trace: SignTrace, text: string, params: readonly Param[], known: (word: string) => boolean): void {
  const read = readsOf(text, params, known);
  for (const t of read.tables) trace.tables.add(t);
  for (const l of read.lists) trace.lists.add(l);
  if (read.loose > 0) {
    trace.rows = true;
    trace.tables.add('entry');
  }
  if (read.unsure) trace.wrote = true;
}

/**
 * Statements that change no row: a transaction's edges (a rollback drops every hold of its own), a read, a pragma, an
 * index made or dropped (a list's unique field, as an add-on installs one), a table made where none was.
 */
const NO_ROW = /^(?:BEGIN|COMMIT|END|SAVEPOINT|RELEASE|ROLLBACK|SELECT|VALUES|PRAGMA|EXPLAIN|ANALYZE|VACUUM|REINDEX|CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+INDEX|CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS)\b/iu;
/** A write, up to the table it writes (`tableAt`), which is read only there and never from the values it writes. */
const WRITES = /^(?:INSERT(?:\s+OR\s+[A-Z]+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+[A-Z]+)?|DELETE\s+FROM)\b/iu;
/** The statement a `WITH` leads to, past its tables, at the top level. */
const AFTER_WITH = /^(?:SELECT|VALUES|INSERT|REPLACE|UPDATE|DELETE)\b/iu;

/** `text` with its quoted strings and comments blanked, so a `;` or a word inside one is not read as SQL. */
function bare(text: string): string {
  return text.replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//gu, (m) => (m.startsWith("'") ? "''" : ' '));
}

/** The statement a `WITH ...` comes to, from the first word at the top level past its tables, or `null`. */
function pastWith(statement: string): string | null {
  let depth = 0;
  for (let i = 4; i < statement.length; i++) {
    const c = statement[i]!;
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && /[A-Za-z]/u.test(c) && !/[A-Za-z0-9_]/u.test(statement[i - 1] ?? ' ')) {
      const rest = statement.slice(i);
      if (AFTER_WITH.test(rest)) return rest;
    }
  }
  return null;
}

/**
 * The tables one call writes, lower case: `[]` for a call that changes no row, and `null` for one this cannot read
 * (a table made or dropped, a statement it does not know), which moves every held sign. Several statements in one call
 * are each read. Never a table too few: what is not certain is `null`.
 */
export function tablesWritten(text: string): string[] | null {
  const out = new Set<string>();
  for (const raw of bare(text).split(';')) {
    let statement = raw.trim();
    if (statement === '' || NO_ROW.test(statement)) continue;
    if (/^WITH\b/iu.test(statement)) {
      const past = pastWith(statement);
      if (past === null) return null;
      statement = past;
      if (/^(?:SELECT|VALUES)\b/iu.test(statement)) continue;
    }
    const m = WRITES.exec(statement);
    if (m === null) return null;
    /* THE TABLE AFTER ITS SCHEMA, quoted or not: `UPDATE "main"."entry"` writes `entry`, never `main` (review 3, P4).
       Another schema's table (`temp.x`, an attached file) is one this cannot be sure of. */
    const t = tableAt(statement.slice(m[0].length));
    if (t === null || (t.schema !== null && t.schema.toLowerCase() !== 'main')) return null;
    /* A SCHEMA WITH NOTHING NAMED AFTER IT (`"main". VALUES`): the next word is SQL, not a table this can be sure of. */
    if (t.schema !== null && /^(?:VALUES|SELECT|DEFAULT|SET)$/iu.test(t.name)) return null;
    out.add(t.name.toLowerCase());
  }
  return [...out];
}

/**
 * Whether a write changed no row, as far as its answer says: a single statement with `RETURNING` that returned nothing.
 * The belt's claim of what is due (`UPDATE schedule ... RETURNING`) runs on every tick and mostly claims nothing.
 */
export function wroteNothing(text: string, returned: number): boolean {
  if (returned > 0) return false;
  const statements = bare(text).split(';').filter((t) => t.trim() !== '');
  return statements.length === 1 && /\bRETURNING\b/iu.test(statements[0]!);
}

/** What a held sign's stamp is taken over: the lists it named, every other table it read, and whether the log's head counts. */
export type SignHeldOn = { lists: string[]; tables: string[]; head: boolean };

/** Tables the record writes past the kernel, always with a line in the log beside the write (`index.ts`). */
const LINED = new Set(['event', 'suggestion', 'dog_meta']);

/**
 * What a reading read with `trace` is held on: the lists it named (by their versions), every other table it read (by
 * the kernel's count of writes to it), and the rows' table itself where it read rows of no list or a list that is
 * `loud` (the runs, whose rows move with no line). The log's newest line counts where it read a table the record writes
 * past the kernel.
 */
export function heldOn(trace: SignTrace, loud: (list: string) => boolean): SignHeldOn {
  const lists = [...trace.lists].sort();
  const anyRow = trace.rows || lists.some(loud);
  const tables = [...trace.tables].filter((t) => t !== 'entry' || anyRow).sort();
  return { lists: lists.filter((l) => !loud(l)), tables, head: tables.some((t) => LINED.has(t)) };
}

/** One sign held: the day and instant it was read, until when the clock leaves it standing, what it read and its stamp. */
export type HeldSign<T> = SignHeldOn & { day: string; at: number; until: number; stamp: string; value: T };

/** The signs held, by key. */
export class HeldSigns<T> {
  readonly #held = new Map<string, HeldSign<T>>();

  /**
   * A held reading still good for `day` and `now`: read the same day, not after now, before the clock moves it
   * (`until`), inside `HELD_LONG_MS`, and with nothing it read written since (`stampOf`).
   */
  get(key: string, day: string, now: number, stampOf: (on: SignHeldOn) => string): HeldSign<T> | undefined {
    const was = this.#held.get(key);
    if (was === undefined) return undefined;
    if (was.day !== day || was.at > now || !(now < was.until) || now - was.at >= HELD_LONG_MS || stampOf(was) !== was.stamp) {
      this.#held.delete(key);
      return undefined;
    }
    return was;
  }

  /** Hold one, unless what it read wrote, or the clock has moved it already. */
  set(key: string, held: HeldSign<T>, trace: SignTrace): void {
    this.#held.delete(key);
    if (trace.wrote || !(held.at < held.until)) return;
    this.#held.set(key, held);
  }

  clear(): void {
    this.#held.clear();
  }
}
