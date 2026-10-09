/**
 * AN ASK TURNED AWAY BECAUSE THE MONTH'S ASKS ARE SPENT LEAVES ONE ROW (model-sign-49, audit 40-42 finding 5).
 *
 * Slash's own `TURNED_AWAY_SQL` (`packages/slash/src/call.ts`), RESTATED because this package may not import that one
 * (`46 §5.1`); `test/slash-turned-away.test.ts` holds the two equal. The host's own month guards (the `byo` guard in
 * `slash.ts`, the press and the background asks in `slash-ask.ts`) refuse before Slash's engine is reached, so without
 * this they wrote nothing and the vital sign `model-answers` could never say the month was spent. Under `-` the row is
 * never an ask any meter counts, and never read as an answer or a failure.
 */
import type { Sql } from '@braindog/ports';

export const TURNED_AWAY_SQL =
  "INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status, code) VALUES (?, ?, ?, ?, '-', 0, 0, 0, 0, 'refused', 'SLASH_BUDGET_SPENT')";

/** Write the row. A ledger that will not take it (no table yet, a tier its `CHECK` does not hold) costs the ask nothing. */
export function turnedAway(sql: Pick<Sql, 'exec'>, at: string, kind: 'read' | 'propose' | 'pattern', tier: string, id: string = crypto.randomUUID()): void {
  try {
    sql.exec(TURNED_AWAY_SQL, id, at, kind, tier);
  } catch {
    /* The refusal is the answer either way. */
  }
}
