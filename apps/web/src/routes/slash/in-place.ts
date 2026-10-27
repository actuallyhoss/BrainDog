/**
 * THE ONE DECISION CARD WHERE HE ASKED, on `/slash` as in the palette: an ask on the Slash
 * page that answers with a change draws its card under the Ask field. Enter accepts it, a six-second Undo follows
 * (`DecisionCard.svelte`, `press.ts` `HOLD_MS`), and it reads "Slash suggested · Mara accepted" once answered.
 *
 * ONE DRAW FUNCTION FOR ONE CARD. The card is `filedCard`'s, the palette's own (`lib/palette/slash.ts`), so the card in
 * place and the card on Decide cannot drift apart: this file only says when it is drawn and what is left behind.
 *
 * NOTHING HERE FILES A QUESTION. The record filed the proposal under his ask when it answered (`p.filed`), so a card he
 * leaves unanswered already waits on Decide. `leftUnanswered` says that, and where; it writes nothing.
 *
 * PURE, SO `node --test` CAN IMPORT IT.
 */

import type { SlashProposal } from '@braindog/client';
import type { QueueQuestion } from '@braindog/kernel';

import { filedCard } from '../../lib/palette/slash.ts';

export const words = {
  /** Said once he leaves a card unanswered, by asking again or leaving the page: where it is now. */
  waits: 'Slash’s suggestion waits for you in Needs you.',
  /** The card's second action: the same question, on Decide. */
  open: 'Open it in Needs you',
};

/** The card drawn under the Ask field: the question as Decide files it, where it is on Decide, and whether he answered. */
export type InPlace = { question: QueueQuestion; decide: string; answered: boolean };

/** What waits on Decide for a card he left unanswered. */
export type Left = { id: string; decide: string; said: string };

/**
 * THE CARD FOR AN ANSWER THAT PROPOSES A CHANGE, or `null` when it changes nothing: a `query` files nothing, and an
 * answer without the ask has no question to draw. `asked` is the question as he typed it, which is what the record filed.
 */
export function cardInPlace(answer: SlashProposal, asked: string, now: number): InPlace | null {
  const question = filedCard(answer, asked, now);
  if (question === null) return null;
  return { question, decide: `/decide/${encodeURIComponent(question.id)}`, answered: false };
}

/**
 * WHAT IS ON DECIDE WHEN HE LEAVES THE CARD UNANSWERED: the record's own filing, by its question, and the line that says
 * so. An answered card leaves nothing, held for its Undo or sent, since leaving sends what was held.
 */
export function leftUnanswered(card: InPlace | null): Left | null {
  if (card === null || card.answered) return null;
  return { id: card.question.id, decide: card.decide, said: words.waits };
}

/**
 * WHAT ENTER IN THE ASK FIELD DOES. With a card drawn and unanswered and the field still holding the question it answers,
 * Enter is the card's: it accepts. Any other text in the field is a new ask.
 */
export function enterOn(card: InPlace | null, field: string, asked: string): 'accept' | 'ask' {
  if (card === null || card.answered) return 'ask';
  return field.trim() === asked.trim() ? 'accept' : 'ask';
}
