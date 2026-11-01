/**
 * What BrainDog arranged for itself today: `handled` (READ+), one line each for the changes it made without asking
 * (a reversible arrangement of the owner's own rows happens with a mark, the reason and an Undo), newest
 * first, with the decision's handle so one press can put the whole batch back.
 *
 * READ FROM THE DECISIONS THE RECORD ALREADY KEEPS, signed by `rule:handled` (`handledFault` in the kernel), with no
 * table of its own. One that was put back since is left out, and so is one in a list the caller may not read whole.
 *
 * AND THE QUESTIONS AN ANSWER COVERED: one a newer question said it answers too is closed as moot when that
 * one is answered, and is told here under its own words, with the answer that settled it and that decision's Undo.
 *
 * AND THE QUESTIONS THAT TOOK THEMSELVES BACK: one that could no longer apply (its rows changed, or what it asked about
 * is gone, `sweepStale`) or that was already so (`recheck`) is closed by the record, and told here once, under its own
 * words, with the line that says why. Nothing was written, so it has no Undo (`withdrawn`), and its handle is the
 * question's own.
 *
 * IT WRITES NOTHING. Undoing a line is the record's own `undo` on its decision.
 */

import type { Result } from '@braindog/ports';
import { CHANGED_NOTE, COVERED, GONE_NOTE, HANDLED_REASONS, HANDLED_RULE, MOOT_GONE, MOOT_HELD, dayIn } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How many lines one answer holds at most; the rest are counted in `more`. */
export const HANDLED_MOST = 20;

/** How many of today's decisions are read to find them. */
const SCANNED = 200;

/**
 * One thing BrainDog did: the decision to undo, one plain line, the reason, and when. A question that took itself back
 * carries `withdrawn` and its own handle in `decision`, and has nothing to undo.
 */
export type HandledRow = { decision: string; line: string; why: string; at: string; withdrawn?: true };

/** The lines the record closes a question with by itself, as `handled` tells them. */
const SELF_CLOSED = [CHANGED_NOTE, GONE_NOTE, MOOT_HELD, MOOT_GONE];

/** What `handled` answers: today's lines, newest first, and how many more were held back past them. */
export type Handled = { rows: HandledRow[]; more: number };

/** A question as a line a person reads it by: no question mark, no em dash. */
const lineOf = (question: string): string => question.replaceAll(/\s*—\s*/gu, ', ').replace(/\?+\s*$/u, '').trim();

export function methods(deps: RecordDeps) {
  const { sql, kernel, sight, scoped, readable, clock } = deps;

  return {
    /** `{}`: what BrainDog arranged itself today, newest first, `HANDLED_MOST` at most, and `more` past them. READ+, and it changes nothing. */
    async handled(_args: unknown, ctx: CallContext): Promise<Result<Handled>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* THE RECORD'S DAY, IN ITS OWN ZONE (AH22). */
      const today = dayIn(clock.now(), kernel.identity()?.tz);
      const found = sql.all<{ id: string; question: string; reason: string; ts: string; batch: string | null; body: string | null; undone: number | null }>(
        `SELECT d.id AS id, d.question AS question, d.reason AS reason, d.ts AS ts,
           (SELECT e.batch FROM event e WHERE e.kind = 'decide' AND e.target = 'decision:' || d.id ORDER BY e.rowid DESC LIMIT 1) AS batch,
           (SELECT s.body FROM event e JOIN event r ON r.rowid = e.rowid + 1 JOIN suggestion s ON 'suggestion:' || s.id = r.target
             WHERE e.kind = 'decide' AND e.target = 'decision:' || d.id AND r.kind = 'resolve' ORDER BY e.rowid DESC LIMIT 1) AS body,
           (SELECT 1 FROM undone u WHERE u.batch = (SELECT e.batch FROM event e WHERE e.kind = 'decide' AND e.target = 'decision:' || d.id ORDER BY e.rowid DESC LIMIT 1)) AS undone
         FROM decision d WHERE d.decided_by = ? AND d.ts >= ? ORDER BY d.ts DESC, d.rowid DESC LIMIT ?`,
        HANDLED_RULE,
        today,
        SCANNED,
      );
      /* THE COVERED ONES: a moot close in a decision's batch, with the line `decide` writes for it. */
      const covered = sql.all<{ id: string; question: string | null; note: string; ts: string; body: string | null; undone: number | null }>(
        `SELECT d.target AS id, r.note AS note, r.ts AS ts, s.body AS body,
           (SELECT coalesce(q.to_v, q.note) FROM event q WHERE q.kind = 'suggest' AND q.target = r.target AND q.field IS NULL ORDER BY q.rowid LIMIT 1) AS question,
           (SELECT 1 FROM undone u WHERE u.batch = r.batch) AS undone
         FROM event r JOIN event d ON d.batch = r.batch AND d.kind = 'decide' JOIN suggestion s ON 'suggestion:' || s.id = r.target
         WHERE r.kind = 'resolve' AND r.to_v = 'moot' AND r.batch IS NOT NULL AND r.note LIKE ? AND r.ts >= ? AND s.resolved_as = 'moot'
         ORDER BY r.ts DESC, r.rowid DESC LIMIT ?`,
        `${COVERED}%`,
        today,
        SCANNED,
      );
      /* THE ONES THAT TOOK THEMSELVES BACK TODAY, by the record and in no decision's batch. */
      const closed = sql.all<{ id: string; question: string | null; note: string; ts: string; body: string | null }>(
        `SELECT s.id AS id, r.note AS note, r.ts AS ts, s.body AS body,
           (SELECT coalesce(q.to_v, q.note) FROM event q WHERE q.kind = 'suggest' AND q.target = r.target AND q.field IS NULL ORDER BY q.rowid LIMIT 1) AS question
         FROM event r JOIN suggestion s ON 'suggestion:' || s.id = r.target
         WHERE r.kind = 'resolve' AND r.actor = 'system' AND r.batch IS NULL AND r.to_v IN ('withdrawn', 'moot') AND r.ts >= ?
           AND r.note IN (SELECT value FROM json_each(?))
         ORDER BY r.ts DESC, r.rowid DESC LIMIT ?`,
        today,
        JSON.stringify(SELF_CLOSED),
        SCANNED,
      );
      const rows: HandledRow[] = [];
      for (const c of closed) {
        if (c.question === null) continue;
        let list: unknown;
        try {
          list = (JSON.parse(c.body ?? '{}') as { register?: unknown }).register;
        } catch {
          list = undefined;
        }
        if (typeof list === 'string' ? readable(ctx, list) !== null || kernel.scope(ctx, list) !== undefined || sight.hidden(ctx, list).size > 0 : deps.readsEveryList?.(ctx) !== true) continue;
        const line = lineOf(c.question);
        if (line !== '') rows.push({ decision: c.id, line, why: lineOf(c.note), at: c.ts, withdrawn: true });
      }
      for (const c of covered) {
        if (c.undone !== null || c.question === null) continue;
        let list: unknown;
        try {
          list = (JSON.parse(c.body ?? '{}') as { register?: unknown }).register;
        } catch {
          list = undefined;
        }
        if (typeof list === 'string' ? readable(ctx, list) !== null || kernel.scope(ctx, list) !== undefined || sight.hidden(ctx, list).size > 0 : deps.readsEveryList?.(ctx) !== true) continue;
        const line = lineOf(c.question);
        if (line !== '') rows.push({ decision: c.id.slice('decision:'.length), line, why: lineOf(c.note), at: c.ts });
      }
      for (const f of found) {
        if (f.undone !== null || f.batch === null) continue;
        let list: unknown;
        try {
          list = (JSON.parse(f.body ?? '{}') as { register?: unknown }).register;
        } catch {
          list = undefined;
        }
        /* AND READ WHOLE (`sight`): a question and a reason are worded from the rows the change named, so a caller held to
           some of the list's rows, or from whom a field of it is hidden, is not told what was done to the others. */
        if (typeof list !== 'string' || readable(ctx, list) !== null || kernel.scope(ctx, list) !== undefined || sight.hidden(ctx, list).size > 0) continue;
        const line = lineOf(f.question);
        if (line === '') continue;
        /* THE RULE'S OWN REASON IS NO REASON: four lines in a row said the same sentence about rows. Only a reason the
           question carried is said. */
        const why = HANDLED_REASONS.includes(f.reason.trim()) ? '' : lineOf(f.reason);
        rows.push({ decision: f.id, line, why, at: f.ts });
      }
      rows.sort((a, b) => b.at.localeCompare(a.at));
      return { ok: true, value: { rows: rows.slice(0, HANDLED_MOST), more: Math.max(0, rows.length - HANDLED_MOST) } };
    },
  };
}
