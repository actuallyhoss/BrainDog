/**
 * ONE PRESS ANSWERS (DIRECTION §37), and what each screen of Decide needs to know to make it one: which answer a key
 * gives, when the suggestion is drawn at all, the amount a button names when money moves, and when a note is offered
 * after the answer rather than a reason demanded before it.
 *
 * WHY. The walk of 2 October pressed "Park it another year" on Decide and got a round trip to the record and then a box
 * asking "Why? (one line)", with the question still there and the page scrolled (`loop/research-ux-walk.md` #3). Two of
 * the owner's 69 decisions carried the reasons "f" and "y", which agents read back later as the why. So a press is the
 * answer, the reason is offered after a decline or an edit and never demanded, and a note somebody chose to write is
 * worth more than a sentence somebody was made to type.
 *
 * THE SUGGESTION IS AN OUTLINE WITH A SMALL DOT, the owner's own pick, and only where the choice can be taken back: a
 * pre-selected answer reads as an endorsement, so where the other button tomorrow does not undo it, or where money
 * moves, no answer is marked and the reader chooses with nothing leaning on them.
 *
 * PURE, with relative imports, so `press.test.ts` loads it in Node.
 */

import { money } from 'braindog-render';

import { moneyInText } from '../../lib/record/money.ts';
import type { Question } from '../../lib/record/schema.ts';
import { words } from './words.ts';

/** What one of Decide's keys does to the question it is on, beside `j` and `k`, which move. */
export type KeyAct = 'accept' | 'edit' | 'decline';

/** Enter accepts, `e` edits, Backspace declines. Every other key is not Decide's. */
export const keyAct = (key: string): KeyAct | null => (key === 'Enter' ? 'accept' : key === 'e' ? 'edit' : key === 'Backspace' ? 'decline' : null);

/** The band a question is in when accepting it is hard to take back (`@braindog/kernel` `weigh.ts`). */
export const HARD_TO_UNDO = 'undo';

/** Whether the suggestion is drawn: only where the choice can be undone, and never where money moves. */
export const suggestionShown = (band: string | undefined, moves: boolean): boolean => band !== HARD_TO_UNDO && !moves;

/** A question as these rules read it: its answers by key, the suggested one marked, and its band. */
type Keyed = { options: readonly { key: string; recommended?: boolean | undefined }[] };
type Asked = Keyed & Partial<Pick<Question, 'band'>>;

/**
 * THE ANSWER ENTER GIVES: the suggested one where it is drawn, else Accept on a question that has it, else none.
 *
 * NONE ON A QUESTION THAT IS HARD TO UNDO, AND NONE WHERE MONEY MOVES. One key that does something the other button
 * cannot take back, or that writes an amount the reader has not read, is the shortcut this product does not offer:
 * such a question is answered by a press on its own button, which names the amount.
 */
export function acceptKey(q: Asked, moves = false): string | null {
  if (q.band === HARD_TO_UNDO || moves) return null;
  const suggested = q.options.find((o) => o.recommended === true);
  if (suggested) return suggested.key;
  return twoWords(q) ? 'accept' : null;
}

/** The answer Backspace gives: Decline, on a question the record answers with its two. A question of options has none. */
export const declineKey = (q: Keyed): string | null => (twoWords(q) ? 'reject' : null);

/**
 * WHETHER A NOTE IS OFFERED ONCE THE ANSWER IS IN: after a decline, which is the answer somebody later asks about, and
 * after an edit, an accept with some of what was proposed left out. Never after a plain accept of what was suggested.
 */
export const notedAfter = (option: string, edited: boolean): boolean => option === 'reject' || edited;

/* ── money ─────────────────────────────────────────────────────────────── */

/** A money value as a proposal may carry it: an integer of minor units, as a number or as digits, and its currency. */
function moneyIn(v: unknown): { amount: number; currency: string } | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const raw = v as { amount?: unknown; currency?: unknown };
  const amount = typeof raw.amount === 'string' && /^-?\d+$/u.test(raw.amount.trim()) ? Number(raw.amount.trim()) : raw.amount;
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || typeof raw.currency !== 'string' || !/^[A-Za-z]{3}$/u.test(raw.currency)) return null;
  return { amount, currency: raw.currency.toUpperCase() };
}

type Declared = { fields: readonly { id: string; type: string }[] };

/**
 * THE MONEY ACCEPTING WOULD WRITE: every money field of the rows a proposal adds or changes, summed in each currency
 * and never across two, in the order the currencies are first met. Only the rows `picked` names when some are left out,
 * and nothing when the proposal writes no money or its list declares none.
 *
 * A SUM THAT COMES TO NOTHING STILL MOVES MONEY when what it adds up is not nothing: £3 out of one account and £3 into
 * another is £3 moved, and summed it said no amount, drew the suggestion and let Enter accept it. So a currency whose
 * amounts cancel names what went in, which is what went out.
 */
export function movesOf(
  rowset: { register: string; rows: readonly Record<string, unknown>[] } | undefined,
  registers: Readonly<Record<string, Declared | undefined>>,
  picked: readonly number[] | null | undefined = undefined,
): { amount: number; currency: string }[] {
  if (!rowset) return [];
  const fields = (registers[rowset.register]?.fields ?? []).filter((f) => f.type === 'money').map((f) => f.id);
  if (fields.length === 0) return [];
  const chosen = picked === null ? new Set<number>() : picked ? new Set(picked) : null;
  const sums = new Map<string, { net: number; moved: number }>();
  rowset.rows.forEach((row, n) => {
    if (chosen && !chosen.has(n)) return;
    const values = typeof row.at === 'string' && typeof row.patch === 'object' && row.patch !== null ? (row.patch as Record<string, unknown>) : row;
    for (const f of fields) {
      const m = moneyIn(values[f]);
      if (!m) continue;
      const sum = sums.get(m.currency) ?? { net: 0, moved: 0 };
      sums.set(m.currency, { net: sum.net + m.amount, moved: sum.moved + Math.max(0, m.amount) });
    }
  });
  return [...sums].flatMap(([currency, { net, moved }]) => (net !== 0 ? [{ amount: net, currency }] : moved !== 0 ? [{ amount: moved, currency }] : []));
}

/**
 * The amounts in words, each in its own currency, the record's own by its symbol: "£12.98", "£12.98 and $5 USD".
 * `home` is the record's currency, read from the shell unless a caller holds another.
 */
export function amountSaid(moves: readonly { amount: number; currency: string }[], home?: string | null): string {
  const said = moves.map((m) => (home === undefined ? moneyInText(money(m.amount, m.currency)) : moneyInText(money(m.amount, m.currency), home)));
  return said.length <= 1 ? (said[0] ?? '') : `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`;
}

/**
 * WHETHER A QUESTION'S ANSWERS ARE THE RECORD'S TWO, Accept and Reject, which every proposal that is not a question of
 * options is answered with (`governance.ts` `questionOf`), rather than options its asker wrote.
 */
export const twoWords = (q: Keyed): boolean =>
  q.options.length === 2 && q.options[0]?.key === 'accept' && q.options[1]?.key === 'reject';

/**
 * WHAT AN ANSWER'S BUTTON SAYS: what it does. On the record's own two, Accept names the amount when money moves
 * ("Accept £12.98") and Reject is Decline, the word the card uses for it. An option its asker wrote keeps its words.
 */
export function labelOf(option: { key: string; title: string }, q: Keyed, moves: readonly { amount: number; currency: string }[]): string {
  if (!twoWords(q)) return option.title;
  if (option.key === 'accept' && moves.length > 0) return words.acceptFor(amountSaid(moves));
  if (option.key === 'reject') return words.decline;
  return option.title;
}
