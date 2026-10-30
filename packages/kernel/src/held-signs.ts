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

/** What one sign's reading read, as the kernel's `Sql` saw it (`noticeSign`). */
export type SignTrace = {
  /** Every table its statements read from, lower case. */
  tables: Set<string>;
  /** The lists its statements bound the rows' list to (`register = ?`, `register IN ('a', ?)`). */
  lists: Set<string>;
  /** It read the rows with no list named, so any row written may move it. */
  rows: boolean;
  /** It wrote, so it is not held. */
  wrote: boolean;
};

/** A fresh trace. */
export const signTraceOf = (): SignTrace => ({ tables: new Set(), lists: new Set(), rows: false, wrote: false });

/** A table's name as SQL may write it: bare, or in double quotes, backticks or brackets. */
const NAME = /^\s*(?:"((?:[^"]|"")+)"|`((?:[^`]|``)+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_$]*))/u;

/** The name at the head of `text`, its quotes taken off, and what follows it. */
function nameAt(text: string): { name: string; rest: string } | null {
  const m = NAME.exec(text);
  if (m === null) return null;
  const name = m[1]?.replace(/""/gu, '"') ?? m[2]?.replace(/``/gu, '`') ?? m[3] ?? m[4]!;
  return { name, rest: text.slice(m[0].length) };
}

/**
 * The table named at the head of `text`, and the schema before it if there is one: `entry`, `main.entry`,
 * `"main"."entry"`, `[main].[entry]`. `null` where no name can be read, or a dot is followed by none.
 */
export function tableAt(text: string): { schema: string | null; name: string } | null {
  const first = nameAt(text);
  if (first === null) return null;
  const dot = /^\s*\.(?!\.)/u.exec(first.rest);
  if (dot === null) return { schema: null, name: first.name };
  const second = nameAt(first.rest.slice(dot[0].length));
  return second === null ? null : { schema: first.name, name: second.name };
}

/** Where a statement reads a table: the name after each `FROM` and `JOIN`. */
const READS_AT = /\b(?:FROM|JOIN)\b/giu;
/**
 * The rows' table where a statement reads it, as a word not followed by a dot (`entry.register` is a column):
 * `entry`, never `entry_private` or `entry_fts`. Read in the text with its strings blanked, so `target_kind = 'entry'`
 * is no read of the rows; a comma's join (`FROM event, entry`) is.
 */
const ROWS_READ = /\bentry\b(?!\s*["`\]]?\s*\.)/giu;
/** The list column held to one list: `register = ?`, `e.register = 'tasks'`. */
const BOUND_ONE = /\bregister["`\]]?\s*==?\s*(\?\d+|'\d+')/giu;
/** The list column held to a few: `register IN (?, 'tasks')`, never a select inside. */
const BOUND_SOME = /\bregister["`\]]?\s+IN\s*\(([^()]*)\)/giu;
/**
 * What comes before a binding that narrows the rows read: `WHERE`, `AND` or `ON`, past any brackets and a table's
 * name. One after `OR`, `WHEN` or in what a select answers narrows nothing.
 */
const NARROWS = /\b(?:WHERE|AND|ON)\s*(?:\(\s*)*(?:[A-Za-z_][A-Za-z0-9_]*\s*\.\s*)?["`[]?$/iu;

/**
 * `text` with its comments blanked, each string as `'n'` (its place in `strings`) and each parameter as `?n` (its number
 * as SQLite counts them, from 1), so a word is read only where it stands in the SQL and a bound value is found by its
 * place. A quoted name is kept as it is.
 */
export function marked(text: string): { text: string; strings: string[] } {
  const strings: string[] = [];
  const named = new Map<string, number>();
  let most = 0;
  let out = '';
  for (let i = 0; i < text.length; ) {
    const c = text[i]!;
    if (c === "'") {
      let j = i + 1;
      let value = '';
      for (; j < text.length; j++) {
        if (text[j] !== "'") value += text[j];
        else if (text[j + 1] === "'") (value += "'"), j++;
        else break;
      }
      out += `'${strings.length}'`;
      strings.push(value);
      i = j + 1;
    } else if (c === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      out += ' ';
      i = end < 0 ? text.length : end;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      out += ' ';
      i = end < 0 ? text.length : end + 2;
    } else if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] !== close) continue;
        /* A QUOTE DOUBLED inside a quoted name is the quote itself. */
        if (close !== ']' && text[j + 1] === close) {
          j++;
          continue;
        }
        break;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '?') {
      const digits = /^\d*/u.exec(text.slice(i + 1))![0];
      const n = digits === '' ? most + 1 : Number(digits);
      most = Math.max(most, n);
      out += `?${n}`;
      i += 1 + digits.length;
    } else if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/u.test(text[i + 1] ?? '') && !/[A-Za-z0-9_]/u.test(text[i - 1] ?? ' ')) {
      const word = /^[A-Za-z0-9_]+/u.exec(text.slice(i + 1))![0];
      let n = named.get(word);
      if (n === undefined) named.set(word, (n = ++most));
      out += `?${n}`;
      i += 1 + word.length;
    } else {
      out += c;
      i++;
    }
  }
  return { text: out, strings };
}

/**
 * Note in `trace` what one read names: its tables, and the lists it holds the rows to, or the rows of none.
 *
 * A LIST IS NAMED ONLY WHERE THE LIST COLUMN IS BOUND TO IT (`register = ?`, `register IN (...)`), never by a value
 * elsewhere in the statement that happens to be a list's id: `actor = 'system'` on a record with a list called
 * `system` read every list's rows and was held on that one list alone (review 3, P3). And the rows are held to their
 * lists only where each read of them is narrowed so: a second read of the rows with no list of its own (a join to the
 * project a row belongs to) reads the rows of any list.
 */
export function noticeSign(trace: SignTrace, text: string, params: readonly Param[], known: (word: string) => boolean): void {
  for (const m of text.matchAll(READS_AT)) {
    const t = tableAt(text.slice(m.index + m[0].length));
    if (t !== null) trace.tables.add(t.name.toLowerCase());
  }
  const sql = marked(text);
  const valueOf = (token: string): string | undefined => {
    const t = token.trim();
    const p = /^\?(\d+)$/u.exec(t);
    if (p !== null) {
      const v = params[Number(p[1]) - 1];
      return typeof v === 'string' ? v : undefined;
    }
    const q = /^'(\d+)'$/u.exec(t);
    return q === null ? undefined : sql.strings[Number(q[1])];
  };
  let narrowed = 0;
  const bind = (at: number, values: (string | undefined)[]): void => {
    if (values.length === 0 || !values.every((v) => v !== undefined && known(v))) return;
    for (const v of values) trace.lists.add(v!);
    if (NARROWS.test(sql.text.slice(Math.max(0, at - 80), at))) narrowed++;
  };
  for (const m of sql.text.matchAll(BOUND_ONE)) bind(m.index, [valueOf(m[1]!)]);
  for (const m of sql.text.matchAll(BOUND_SOME)) bind(m.index, m[1]!.split(',').map(valueOf));
  const reads = [...sql.text.matchAll(ROWS_READ)].length;
  if (reads > narrowed) {
    trace.rows = true;
    trace.tables.add('entry');
  }
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
