/**
 * The engine's ledger, read on a host for the record's `engineReadings` (ENG-B01 job 3): what the model was asked and what
 * it answered since an instant, the open questions by their cause, and each mention's attached or not.
 *
 * WHY A HOST BUILDS IT. The ledger is Slash's own (`slash_call`), which the record may not open, so the record takes the
 * read as `engineLedger` (`packages/record/src/methods/engine-readings.ts`) the way it takes `engineHealth`, and answers
 * `null` where no host hands one. Each host hands this builder the same Slash SQLite its model calls settle in.
 *
 * STRUCTURAL, AS `engine-health.ts` IS: this package must not depend on `@braindog/slash` (`46 §5.1`), so the table is read
 * by its name and its columns are written out here, and the record's shapes are restated the same way.
 *
 * NO WORD OF A PERSON'S LEAVES HERE. A call is its instant, model, status, code and purpose, never its question or what
 * the model said (`question`, `read` and `raw` are not selected). A question is its cause and a mention is one flag, so
 * whatever rows a host hands in, one field of each is kept.
 *
 * A MISSING TABLE IS NOT A FAULT, as in `slashOwnKeyOf`: the read can be asked before the first question of the day has
 * created Slash's tables, and then nothing was asked.
 *
 * THE MENTIONS ARE THE RECORD'S, NOT SLASH'S (`mentionsAttached`, audit 63 claim 5): `entity_mention` lives in the
 * record's SQLite, which is Slash's on the Worker and a file of its own on a self-hosted record, so a host hands the
 * reader the record's and the ledger Slash's.
 */

import type { Sql } from '@braindog/ports';

/** The record's `LedgerCall`, restated: one row of `slash_call`. */
export type EngineLedgerCall = { ts: string; model: string; status: string; code: string | null; purpose: string };

/** The record's `EngineLedger`, restated. */
export type EngineLedger = {
  calls: readonly EngineLedgerCall[];
  mentions: readonly { attached: boolean }[];
  questions: readonly { cause: string | null }[];
};

type Some<T> = readonly T[] | Promise<readonly T[]>;

export type EngineLedgerDeps = {
  /** Slash's own SQLite, the one the host hands `createSlash`, holding `slash_call`. */
  sql: Sql;
  /** The record's open questions, as the host reads them. Absent, none are counted. */
  questions?: (() => Some<{ cause?: string | null | undefined }>) | undefined;
  /** The mentions the record keeps, each attached to something in it or not: `mentionsAttached` over the record's SQLite. Absent, none are counted. */
  mentions?: (() => Some<{ attached: boolean }>) | undefined;
};

/** Before ENG-A05 the ledger had no `purpose`, and every call in it was an ask (the column's own default). */
const ASK = "'ask' AS purpose";

const callsSince = (sql: Sql, since: string): EngineLedgerCall[] => {
  /* THE TABLE AND ITS COLUMNS IN ONE LOOK, off its own `CREATE` text and not `PRAGMA table_info`: a Durable Object's
     authorizer is why Slash's store asks no pragma (`packages/slash/src/call.ts`), and this reads the same storage. */
  const built = sql.one<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'slash_call'");
  if (built === undefined) return [];
  const purpose = /\bpurpose\b/u.test(built.sql) ? 'purpose' : ASK;
  return sql
    .all<EngineLedgerCall>(`SELECT ts, model, status, code, ${purpose} FROM slash_call WHERE ts >= ? ORDER BY ts, rowid`, since)
    .map((c) => ({ ts: c.ts, model: c.model, status: c.status, code: c.code ?? null, purpose: c.purpose }));
};

/** `entity_mention` as its own `CREATE` text says it, or `undefined` on a record that has not made the table. */
const mentionTable = (sql: Pick<Sql, 'one'>): string | undefined =>
  sql.one<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entity_mention'")?.sql;

/**
 * Each mention the record keeps, attached to something in it or not: the `mentions` a host hands `engineLedgerRead`.
 *
 * `sql` IS THE RECORD'S SQLITE, the one holding `entity_mention` (kernel migration 23), read by its name as `slash_call`
 * is and for the same reason: the columns are written out here and nothing of the kernel is imported for them.
 *
 * WHAT ATTACHED MEANS. A mention is a name met with nothing that identifies it, kept with where it was seen and no row
 * it points at, so on the table as it stands every mention is not attached, and that is the true count, not a missing
 * one. ENG-B03 gives a mention its `holder` (`loop/scope/area-engine-b.md`, decision 2), and from then one that names a
 * holder is attached, unless the attach was undone (`undone_at`). Which of the two tables this is, is read off its own
 * `CREATE` text at every ask, so the migration needs no line here and a record that has not run it is still read.
 *
 * ONE FLAG A MENTION AND NOTHING ELSE IS SELECTED: not the name, not the project, not where it was seen.
 *
 * NOT BOUNDED BY THE LEDGER'S `since`: a mention that points at nothing is owed an answer however old it is.
 */
export function mentionsAttached(sql: Pick<Sql, 'one' | 'all'>): () => { attached: boolean }[] {
  return () => {
    const built = mentionTable(sql);
    if (built === undefined) return [];
    const held = /\bholder\b/u.test(built) ? "holder IS NOT NULL AND holder <> ''" : '0';
    const flag = /\bundone_at\b/u.test(built) ? `${held} AND undone_at IS NULL` : held;
    return sql.all<{ attached: number }>(`SELECT (${flag}) AS attached FROM entity_mention`).map((m) => ({ attached: Number(m.attached) === 1 }));
  };
}

/** The read, built once per host and asked on every look: nothing is cached, so a call a second ago is in it. */
export function engineLedgerRead(deps: EngineLedgerDeps): (since: string) => Promise<EngineLedger> {
  return async (since) => {
    const [questions, mentions] = await Promise.all([deps.questions?.() ?? [], deps.mentions?.() ?? []]);
    return {
      calls: callsSince(deps.sql, since),
      mentions: mentions.map((m) => ({ attached: m.attached === true })),
      questions: questions.map((q) => ({ cause: q.cause ?? null })),
    };
  };
}
