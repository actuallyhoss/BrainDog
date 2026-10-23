/**
 * What BrainDog arranged for itself today: `handled` (READ+), one line each for the changes it made without asking
 * (a reversible arrangement of the owner's own rows happens with a mark, the reason and an Undo), newest
 * first, with the decision's handle so one press can put the whole batch back.
 *
 * READ FROM THE DECISIONS THE RECORD ALREADY KEEPS, signed by `rule:handled` (`handledFault` in the kernel), with no
 * table of its own. One that was put back since is left out, and so is one in a list the caller may not read whole.
 *
 * IT WRITES NOTHING. Undoing a line is the record's own `undo` on its decision.
 */

import type { Result } from '@braindog/ports';
import { HANDLED_REASONS, HANDLED_RULE } from '@braindog/kernel';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

/** How many lines one answer holds at most; the rest are counted in `more`. */
export const HANDLED_MOST = 20;

/** How many of today's decisions are read to find them. */
const SCANNED = 200;

/** One thing BrainDog did: the decision to undo, one plain line, the reason, and when. */
export type HandledRow = { decision: string; line: string; why: string; at: string };

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
      const today = new Date(clock.now()).toISOString().slice(0, 10);
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
      const rows: HandledRow[] = [];
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
      return { ok: true, value: { rows: rows.slice(0, HANDLED_MOST), more: Math.max(0, rows.length - HANDLED_MOST) } };
    },
  };
}
