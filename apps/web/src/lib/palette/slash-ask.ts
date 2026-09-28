/**
 * The Slash page's Ask section: its words, and the list of what was asked (`loop/finish/agents.md` AGT-24).
 *
 * PURE, SO `node --test` CAN IMPORT IT, beside `slash.ts`, whose drawing of an answer the page reuses whole. The page asks
 * the same two passes the palette asks, so a question typed on `/slash` and the same question typed after `/` read the
 * same rows, draw the same sentence through `Cited`, and spend the same asks.
 */

import { since } from 'braindog-render';
import type { SlashAsked } from '@braindog/client';

/** The most asks "Asked lately" shows. */
export const ASKED_SHOWN = 20;

/**
 * How many calls to ask the door for. ONE ASK CAN BE TWO CALLS, a read and the proposal written about its rows, and the
 * ledger lists each; asking for twice the lines shown is what leaves twenty asks after the pairs are folded together.
 */
export const ASKS_FETCHED = ASKED_SHOWN * 2;

/** One line of "Asked lately": the question, when, and where pressing it goes. */
export type AskedLine = {
  id: string;
  question: string;
  when: string;
  /** Decide's page for the proposal it filed, or `null` when it filed none and the line asks again. */
  href: string | null;
  refused: boolean;
};

/**
 * The ledger's calls as the asks a person made, newest first.
 *
 * A READ AND ITS PROPOSAL ARE ONE ASK. They arrive side by side with the same question, the proposal first because it is
 * newer, so a call whose question is the one just listed is folded into that line, and the line keeps whichever filed a
 * proposal. A QUESTION AN ERASURE TOOK is not listed: there is nothing left to show or ask again.
 */
export function askedLately(asks: readonly SlashAsked[], now: number = Date.now()): AskedLine[] {
  const lines: AskedLine[] = [];
  for (const a of asks) {
    const question = a.question?.trim() ?? '';
    if (question === '') continue;
    const href = a.filed === null ? null : `/decide/${encodeURIComponent(a.filed)}`;
    const last = lines[lines.length - 1];
    if (last && last.question === question) {
      last.href ??= href;
      last.refused = last.refused && a.status !== 'ok';
      continue;
    }
    if (lines.length === ASKED_SHOWN) break;
    lines.push({ id: a.id, question, when: since(a.ts, now), href, refused: a.status !== 'ok' });
  }
  return lines;
}

export const askWords = {
  title: 'Ask Slash',
  label: 'Ask a question about what this BrainDog holds. Slash finds the rows that answer it, then says what it makes of them.',
  placeholder: 'Which invoices are late this month?',
  ask: 'Ask Slash',
  asking: 'Asking',
  answer: 'The answer',
  lately: 'Asked lately',
  latelyNone: 'Nothing asked yet. Your questions to Slash are listed here, newest first.',
  again: 'Ask again',
  open: 'Open the proposal',
  /* After the time, as in "2h ago, not answered", so it starts lower case. */
  refused: 'not answered',
  unreached: 'BrainDog could not reach this record.',
} as const;
