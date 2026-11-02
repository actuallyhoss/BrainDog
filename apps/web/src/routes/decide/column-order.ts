/**
 * THE ORDER INSIDE A COLUMN ON NEEDS YOU (2 Nov). The lead card keeps the record's ranking (`weigh.ts`, what getting it
 * wrong would cost); the questions under it, in Money and in Quick, are read in this order instead:
 *
 *   1. DUE SOONER FIRST: anything late, due or renewing within a week, the soonest date first, so the invoice nine days
 *      late leads the one four days late, and both lead a renewal in seven days. A question the record marks as unable
 *      to wait (`waits: 'soon'`) with no date of its own follows the dated ones.
 *   2. THEN WHAT COSTS MORE TO GET WRONG: an answer that is hard to take back (`cost: 'undo'`) before the rest.
 *   3. THEN THE NEWEST FIRST, so a question an agent asked a minute ago is at the top of its column and never under
 *      "2 more". Two asked at the same moment keep the record's order.
 *
 * The questions handed to the reader to decide stay first, as before (`mineFirst`). PURE, AND NODE LOADS IT.
 */
import type { QueueQuestion } from '@braindog/kernel';
import { moneyRowOf } from '../../lib/decide/money-row.ts';

/** How near a date has to be to put a question first, in days. */
export const SOON_DAYS = 7;

type Ordered = Pick<QueueQuestion, 'question' | 'at' | 'cost'> & { waits?: string | undefined; decider?: string | null | undefined };

/** Days to the question's own date (below nought when late), or `null` for a question with none. */
const daysTo = (q: Ordered): number | null => moneyRowOf(q.question)?.days ?? null;

/** The tier a question sorts in: 0 dated and near, 1 marked as unable to wait, 2 the rest. */
const tierOf = (q: Ordered): number => {
  const d = daysTo(q);
  if (d !== null && d <= SOON_DAYS) return 0;
  return q.waits === 'soon' ? 1 : 2;
};

export function columnOrder<T extends Ordered>(rows: readonly T[], me: string | null = null): T[] {
  const ranked = rows.map((q, n) => ({ q, n, tier: tierOf(q), days: daysTo(q) ?? 0, hard: q.cost === 'undo' ? 0 : 1, at: Date.parse(q.at) || 0, mine: me !== null && q.decider === me ? 0 : 1 }));
  ranked.sort((a, b) => a.mine - b.mine || a.tier - b.tier || (a.tier === 0 ? a.days - b.days : 0) || a.hard - b.hard || b.at - a.at || a.n - b.n);
  return ranked.map((r) => r.q);
}
