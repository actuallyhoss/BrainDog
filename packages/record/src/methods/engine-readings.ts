/**
 * The engine's readings, the method: `engineReadings`, READ+ (ENG-B01 job 3).
 *
 * WHAT WAS ASKED OF THE MODEL, WHAT IT ANSWERED, WHAT WAS KEPT AND REFUSED, AND WHAT THE RECORD STILL DOES NOT
 * UNDERSTAND, over the last 30 days. The counting is `../engine-readings.ts`, which reads nothing. The ledger it counts
 * is Slash's own (`slash_call`), which this package may not open, so the host builds the read and hands it in as
 * `engineLedger`, the way it hands `engineHealth` (`./engine.ts`). Absent, the answer is `null`: a host that wired no
 * ledger knows nothing of what was asked, and a row of zeros in its place would read as "nothing was asked".
 *
 * READ LEVEL, SO A READ TOKEN, THE COMMAND LINE AND THE DAILY VITAL-SIGN READ CAN ALL CALL IT. It holds no row of the
 * record and no person's words: purposes, counts, instants and a failure's code, each already held to a plain word by
 * the arithmetic. But every count is over the whole record, so a caller who does not read all of it is refused.
 *
 * NOTHING IS OWED YET. What waits for a model to read it is the `about_owed` table's to say (ENG-B03), and that table
 * does not exist, so `owed` is handed in empty and every `owed` reads 0 until it does.
 *
 * WHAT CAME OF SLASH'S QUESTIONS, THE RECORD'S FOLDS AND WHAT SLASH SIGNED OUTSIDE ITS LIST are the record's own tables,
 * read here: the questions Slash opened in the month with how each was answered, as the kernel's `decide` and `undo`
 * write it (a `decide` line holds the option and, for some of a rowset, the rows taken; some of an arrangement leaves a
 * `taken:` note on the question; an undo writes the question's `reopened` or `undone` line, signed by whoever pressed
 * it, where the kernel's own reopen after a refused take is signed `system`); the edits of the last week that set a
 * fold field, each batch asked `isFold`; and Slash's events of the month whose kind is not one of the three it may
 * always sign, each asked of `slashMayWrite` with what it wrote. EVERY READ IS BOUNDED, a list is bound through
 * `json_each`, and nothing is written. Only `all` is asked of the store, as the brake asks it.
 */

import { dayIn, keyLists, SLASH, SLASH_KINDS, slashBrake, slashMayWrite, type Kernel } from '@braindog/kernel';
import type { Result, Sql } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import {
  engineReadings,
  MONTH_DAYS,
  WEEK_DAYS,
  type EngineReadings,
  type Folds,
  type LedgerCall,
  type MentionSeen,
  type OpenQuestion,
  type SlashFiled,
} from '../engine-readings.ts';
import type { RecordDeps } from './index.ts';

/** What the host's read answers: the ledger's calls, each mention's attached or not, and the open questions' causes. */
export type EngineLedger = {
  calls: readonly LedgerCall[];
  mentions: readonly MentionSeen[];
  questions: readonly OpenQuestion[];
};

/** The host's read. `since` is the instant the month begins, so it selects no call older than the arithmetic counts. */
export type EngineLedgerRead = (since: string) => Promise<EngineLedger>;

const DAY = 86_400_000;

/** The most of Slash's questions of a month read, newest first, and the most of anything else one reading reads. */
export const FILED_READ = 1000;
export const BOUND = 200;

/** A question's lines in the log, by its target. */
const ON = "'suggestion:' || s.id";

/** The `decide` line on the line before one of the question's `resolve` lines, as the kernel's `SETTLED` joins them. */
const DECIDED = `FROM event r JOIN event d ON d.rowid = r.rowid - 1
  WHERE r.target = ${ON} AND r.kind = 'resolve' AND d.kind = 'decide' AND d.target LIKE 'decision:%' AND json_valid(d.to_v)`;

/** The questions Slash opened since `since`, each with how it was answered, as the arithmetic counts them. */
export function slashFiled(sql: Pick<Sql, 'all'>, since: string): SlashFiled[] {
  const rows = sql.all<Omit<SlashFiled, 'in_part' | 'undone'> & { in_part: number; undone: number }>(
    `SELECT s.body_kind AS kind, s.status AS status, s.resolved_as AS resolved_as, s.defer_until AS defer_until,
       CASE WHEN json_valid(s.body) AND json_type(s.body, '$.lapses') = 'text' THEN json_extract(s.body, '$.lapses') END AS lapses,
       (SELECT json_extract(d.to_v, '$.answer') ${DECIDED} ORDER BY r.rowid DESC LIMIT 1) AS answer,
       (EXISTS (SELECT 1 ${DECIDED} AND json_type(d.to_v, '$.rows') IS NOT NULL)
         OR EXISTS (SELECT 1 FROM event n WHERE n.target = ${ON} AND n.kind = 'note' AND n.to_v LIKE 'taken:%')) AS in_part,
       EXISTS (SELECT 1 FROM event u WHERE u.target = ${ON} AND u.actor <> 'system'
         AND ((u.kind = 'suggest' AND u.to_v IN ('reopened', '"reopened"')) OR (u.kind = 'resolve' AND u.to_v IN ('undone', '"undone"')))) AS undone,
       (SELECT c.ts FROM event c WHERE c.target = ${ON} AND c.kind = 'resolve' ORDER BY c.rowid DESC LIMIT 1) AS closed_at
     FROM suggestion s WHERE s.opened_by = ? AND s.opened_at >= ?
     ORDER BY s.opened_at DESC, s.rowid DESC LIMIT ?`,
    SLASH,
    since,
    FILED_READ,
  );
  return rows.map((r) => ({ ...r, in_part: Number(r.in_part) === 1, undone: Number(r.undone) === 1 }));
}

/**
 * The folds the record made by itself since `since`, and how many were put back. A fold is a batch whose line set a
 * list's fold field (the field its people's role names `merged_into`), asked of the kernel's `isFold`, which leaves out a
 * fold somebody said yes to: that one is a decision, and is counted with the question it answered. Put back is the
 * batch in `undone`, which `undoMerge` marks. No kernel, as a host's bare store has none, reads none.
 */
export function foldsOf(sql: Pick<Sql, 'all'>, kernel: Kernel | undefined, since: string): Folds {
  if (kernel === undefined) return { made: 0, undone: 0 };
  const fields = keyLists(kernel.registers().values() as never).flatMap((l) => {
    const field = (l.fields as { merged_into?: unknown }).merged_into;
    return typeof field === 'string' ? [{ register: l.register, field }] : [];
  });
  if (fields.length === 0) return { made: 0, undone: 0 };
  const batches = sql
    .all<{ batch: string }>(
      `SELECT DISTINCT coalesce(e.batch, e.id) AS batch FROM event e JOIN entry w ON e.target = 'entry:' || w.id
       WHERE e.kind = 'edit' AND e.ts >= ? AND e.to_v IS NOT NULL AND e.to_v <> 'null'
         AND EXISTS (SELECT 1 FROM json_each(?) f WHERE json_extract(f.value, '$.register') = w.register AND json_extract(f.value, '$.field') = e.field)
       LIMIT ?`,
      since,
      JSON.stringify(fields),
      BOUND,
    )
    .map((b) => b.batch)
    .filter((b) => kernel.isFold(b));
  if (batches.length === 0) return { made: 0, undone: 0 };
  const back = sql.all<{ n: number }>('SELECT count(*) AS n FROM undone WHERE batch IN (SELECT value FROM json_each(?))', JSON.stringify(batches));
  return { made: batches.length, undone: Number(back[0]?.n ?? 0) };
}

/**
 * How many events Slash signed since `since` that `slashMayWrite` refuses: every kind but the three it may always sign,
 * grouped by what decides the answer (a close by what it closes as, a `declare` by the declaration's kind, add-on and
 * whose it says it is), and each group asked once. The guard throws on the write, so a count above 0 is a writer that
 * went around it.
 */
export function outsideOf(sql: Pick<Sql, 'all'>, since: string): number {
  const groups = sql.all<{ kind: string; closes: string | null; declared: string | null; pack: string | null; by: unknown; n: number }>(
    `SELECT e.kind AS kind, CASE WHEN e.kind = 'resolve' THEN e.to_v END AS closes, d.kind AS declared, d.pack_id AS pack,
       CASE WHEN json_valid(d.body) THEN json_extract(d.body, '$.by') END AS by, count(*) AS n
     FROM event e LEFT JOIN declaration d ON e.kind = 'declare' AND e.target = 'declaration:' || d.id AND d.version = CAST(e.to_v AS INTEGER)
     WHERE e.actor = ? AND e.ts >= ? AND e.kind NOT IN (SELECT value FROM json_each(?))
     GROUP BY 1, 2, 3, 4, 5 LIMIT ?`,
    SLASH,
    since,
    JSON.stringify([...SLASH_KINDS]),
    BOUND,
  );
  let out = 0;
  for (const g of groups) {
    const what =
      g.kind === 'resolve' ? { kind: g.closes } : g.kind === 'declare' && g.declared !== null ? { kind: g.declared, pack: g.pack, body: { by: g.by } } : undefined;
    try {
      slashMayWrite(SLASH, g.kind, what);
    } catch {
      out += Number(g.n);
    }
  }
  return out;
}

/**
 * How Slash's offers were graded: the predictions that came due and were read (`scored`), and how many of them did what
 * they said (`met`). A prediction scored with no reading has no verdict, so it is neither.
 */
export type Predictions = { scored: number; met: number };

/** What the method answers: the arithmetic's readings, and beside the brake, the predictions graded where one was written. */
export type EngineReadingsAnswer = EngineReadings & { predictions?: Predictions };

/**
 * The predictions graded on this record, read from the kernel's `prediction` table, which `scorePrediction` settles:
 * `met` is 1 or 0 once a reading was taken, `null` before and where nothing could be read.
 *
 * `null` WHERE THERE IS NOTHING TO SAY: a store that answered no line (a host's bare read), or a record where no offer
 * has carried a prediction yet. Neither is a pair of zeros, as an unread brake is not a free one. Once one is written
 * the pair is answered, 0 of 0 while none is due.
 */
export function predictionsOf(sql: Pick<Sql, 'all'>): Predictions | null {
  const [row] = sql.all<{ written: number; scored: number | null; met: number | null }>(
    `SELECT count(*) AS written, sum(scored_at IS NOT NULL AND met IS NOT NULL) AS scored, sum(scored_at IS NOT NULL AND met = 1) AS met
     FROM prediction`,
  );
  if (row === undefined || Number(row.written ?? 0) === 0) return null;
  return { scored: Number(row.scored ?? 0), met: Number(row.met ?? 0) };
}

export function methods(deps: RecordDeps) {
  const { scoped, clock } = deps;

  return {
    /** What the model was asked and answered in the last 30 days, and what is not yet understood. `null` where the host wired no ledger. READ+. */
    async engineReadings(_args: unknown, ctx: CallContext): Promise<Result<EngineReadingsAnswer | null>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* THE COUNTS ARE THE WHOLE RECORD'S, so they are answered only to whoever reads all of it (sharing plan §2.7, the
         lens leftovers): the open questions by their cause, the folds, what Slash filed and what came of it, counted over
         every list. A guest of one project or a reader held to some rows was told how many questions waited across lists
         she was never shown. Refused as `signs` holds its counts, by who reads across, never with a row of zeros. The
         record always hands the question in; a method file built without it is a test of the arithmetic. */
      const across = deps.readsAcross ?? deps.readsEveryList;
      if (across !== undefined && !across(ctx))
        return { ok: false, refusal: { code: 'FORBIDDEN', fix: "The engine's readings count across the whole record, so they are for whoever reads all of it.", at: 'principal' } };
      const read = deps.engineLedger;
      if (read === undefined) return { ok: true, value: null };
      const now = clock.now();
      const { calls, mentions, questions } = await read(new Date(now - MONTH_DAYS * DAY).toISOString());
      const month = new Date(now - MONTH_DAYS * DAY).toISOString();
      const kernel = deps.kernel as Kernel | undefined;
      const tz = kernel?.identity?.()?.tz;
      /* THE BRAKE COUNTS AN OFFER HE LET PASS AS A NO (ENG-B17 job 2), so it is asked what today is in the record's zone. */
      const readings = engineReadings({
        now,
        calls,
        owed: [],
        mentions,
        questions,
        braked: slashBrake(deps.sql, now, tz),
        slash: slashFiled(deps.sql, month),
        today: dayIn(now, tz),
        folds: foldsOf(deps.sql, kernel, new Date(now - WEEK_DAYS * DAY).toISOString()),
        outside: outsideOf(deps.sql, month),
      });
      const predictions = predictionsOf(deps.sql);
      return { ok: true, value: predictions === null ? readings : { ...readings, predictions } };
    },
  };
}
