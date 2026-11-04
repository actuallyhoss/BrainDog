/**
 * Erasing a person from Slash's own store: the words its ledger kept of what somebody asked.
 *
 * THE KERNEL'S CASCADE DOES NOT REACH HERE. `packages/kernel/src/erase.ts` walks the record's own tables, and Slash's store
 * sits beside them (in the same SQLite on the Worker, in a file of its own on the self-host) and is named nowhere in that
 * walk, so an erased person's name stayed in `question` for as long as the ledger kept the ask. Each host calls this after the record's own `erase` has answered, over the SQLite it handed `createSlash`,
 * and the caller has already refused what the record refuses: a subject too short, a caller who is not the owner.
 *
 * THE KERNEL'S RULE, READ FROM ITS SOURCE AND NOT IMPORTED, because `46 §1` closes this package's imports at `ports`,
 * `where` and `declare`. A subject is matched trimmed and lower-cased, as a case-insensitive substring, and a matched value
 * becomes the literal `--erased--`, so a reader can tell removed from never there (`02 §10`). What stays is every row's
 * existence, time, kind, tier, model, counts and status: the month's meter and the account of what was spent.
 *
 * WHICH COLUMNS HOLD A PERSON'S WORDS, as each new store's owner is asked to say:
 * `slash_call.question`, the question as it was typed; `slash_call.predicate`, the drafted filter, which carries the values
 * a question named; and the `predicate` of each trace in `slash_call.read`. `slash_settings` holds a tier, a model name, a
 * grant id and a cap, and `slash_meta` a version, and neither holds anybody's words. A conversation's turns
 * (`slash_turn.text`, `slash_turn.actions`), its held actions (`slash_act.title`, `op`, `receipt`) and the name somebody
 * gave it (`slash_thread_name.name`) hold them too.
 */

import type { Sql } from '@braindog/ports';

import { openStore } from './call.ts';

/** The kernel's one spelling of *removed later* (`packages/kernel/src/erase.ts` `ERASED`, `02 §10`). */
const ERASED = '--erased--';

/**
 * How many ledger rows one read of the walk holds at once.
 *
 * THE WALK READS EVERY ROW, a page at a time, and not only the rows a `LIKE` would find, because the match must be the
 * kernel's: JavaScript's `toLowerCase` folds every script, and SQLite's `lower()` folds ASCII alone, so a name written with
 * an accent in the question and typed without the same case in the request would be missed by the database and found here.
 */
const ERASE_PAGE = 500;

type Row = { id: string; rowid: number; question: string | null; predicate: string | null; read: string; raw: string | null };

/**
 * Tombstone every value in Slash's ledger that names one of `subjects`, in one transaction, and answer how many rows it
 * touched. A store with no ledger answers 0 and creates nothing; a ledger still under its version 1 names is brought to
 * `STORE_VERSION` first, so an erasure never misses a table by its old name.
 */
export function eraseSlash(sql: Sql, subjects: readonly string[]): number {
  const wanted = [...new Set(subjects.map((s) => s.trim().toLowerCase()).filter((s) => s !== ''))];
  if (wanted.length === 0) return 0;
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name IN ('slash_call', 'call')") === undefined) return 0;
  openStore(sql);

  const names = (text: string | null): boolean => text !== null && wanted.some((s) => text.toLowerCase().includes(s));
  let touched = 0;
  sql.transactionSync(() => {
    let after = 0;
    for (;;) {
      const page = sql.all<Row>(
        'SELECT id, rowid, question, predicate, read, raw FROM slash_call WHERE rowid > ? ORDER BY rowid LIMIT ?',
        after,
        ERASE_PAGE,
      );
      for (const row of page) {
        const read = names(row.read) ? tracesErased(row.read, names) : row.read;
        const question = names(row.question) ? ERASED : row.question;
        const predicate = names(row.predicate) ? ERASED : row.predicate;
        /* A PROVIDER'S OWN MESSAGE CAN ECHO WHAT A PERSON TYPED, so `raw` goes with the question: NULL, since nothing reads it back. */
        const raw = names(row.raw) ? null : row.raw;
        if (question === row.question && predicate === row.predicate && read === row.read && raw === row.raw) continue;
        sql.exec('UPDATE slash_call SET question = ?, predicate = ?, read = ?, raw = ? WHERE id = ?', question, predicate, read, raw, row.id);
        touched++;
      }
      const last = page[page.length - 1];
      if (last === undefined || page.length < ERASE_PAGE) break;
      after = last.rowid;
    }
    touched += conversationsErased(sql, names);
  });
  return touched;
}

/**
 * A conversation's words (`chat.ts`): what was said each turn, the actions it showed, and what an action held for a yes
 * would write. A held action that names a subject is erased and declined, so a yes later cannot write the words back.
 * Read whole, a conversation at a time, for the walk's reason above. A store with no conversations has nothing here.
 */
const conversationsErased = (sql: Sql, names: (text: string | null) => boolean): number => {
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_turn'") === undefined) return 0;
  let touched = 0;
  for (const t of sql.all<{ thread: string; n: number; text: string; actions: string }>('SELECT thread, n, text, actions FROM slash_turn')) {
    if (!names(t.text) && !names(t.actions)) continue;
    sql.exec('UPDATE slash_turn SET text = ?, actions = ? WHERE thread = ? AND n = ?', names(t.text) ? ERASED : t.text, names(t.actions) ? '[]' : t.actions, t.thread, t.n);
    touched++;
  }
  for (const a of sql.all<{ id: string; title: string; op: string; receipt: string | null }>('SELECT id, title, op, receipt FROM slash_act')) {
    if (!names(a.title) && !names(a.op) && !names(a.receipt)) continue;
    sql.exec("UPDATE slash_act SET title = ?, op = '{}', receipt = NULL, state = CASE state WHEN 'open' THEN 'declined' ELSE state END WHERE id = ?", ERASED, a.id);
    touched++;
  }
  /* A NAME SOMEBODY GAVE A CONVERSATION goes outright, and it is called by its first words again. */
  if (sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = 'slash_thread_name'") !== undefined)
    for (const t of sql.all<{ id: string; name: string }>('SELECT id, name FROM slash_thread_name')) {
      if (!names(t.name)) continue;
      sql.exec('DELETE FROM slash_thread_name WHERE id = ?', t.id);
      touched++;
    }
  return touched;
};

/**
 * `slash_call.read` with the predicate of each trace that names a subject erased, and the register and the count kept.
 *
 * THE TRACE AND NOT THE COLUMN, because the fold of `23 §6` reads the register and the count, and those are the fact that
 * a read happened, which an erasure keeps. A column that is not the list of traces it should be is erased whole: it cannot
 * be read as a fold anyway, and it names the subject.
 */
const tracesErased = (text: string, names: (text: string | null) => boolean): string => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return ERASED;
  }
  if (!Array.isArray(parsed)) return ERASED;
  return JSON.stringify(
    parsed.map((trace: unknown) => {
      if (trace === null || typeof trace !== 'object') return trace;
      const predicate = (trace as Record<string, unknown>)['predicate'];
      return typeof predicate === 'string' && names(predicate) ? { ...(trace as Record<string, unknown>), predicate: ERASED } : trace;
    }),
  );
};
