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
  /** The mentions the understanding kept, each attached to something in the record or not. Absent, none are counted. */
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
