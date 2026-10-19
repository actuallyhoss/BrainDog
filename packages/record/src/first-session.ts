/**
 * Today's first brief on a new record (batch 106): while the project the agent's first session formed is still a draft
 * and no model has written a briefing, the first lines say what that session did, in names and never ids.
 *
 * Pure: it is handed the words and returns cards. Gathering them is `methods/briefing.ts`'s.
 */

import { BRIEF_LINE_MOST, type BriefCard } from './briefing.ts';

/** What the first session said, as plain words: the agent's name, the project and device it ran on, what it did and left. */
export type FirstSession = { agent: string; project: string; device: string | null; doing: string | null; next: string | null; row: string };

/** A sentence cut at a word to fit a card's line, with an ellipsis, never through a word. */
function fitted(line: string): string {
  if (line.length <= BRIEF_LINE_MOST) return line;
  const cut = line.slice(0, BRIEF_LINE_MOST - 1).replace(/\s+\S*$/u, '').replace(/[.,;:\s]+$/u, '');
  return `${cut}…`;
}

const plain = (s: string): string => s.replace(/\s+/gu, ' ').trim().replace(/[.!]+$/u, '');

/**
 * "Claude Code started on Tidepool on Sam's Mac: wiring the tide table." and, when it left one, "Next: ...". The
 * doing is said as the agent put it, lower-cased at its first letter only when it begins a lone capital word.
 */
export function firstSessionCards(said: FirstSession): BriefCard[] {
  const where = said.device && plain(said.device) !== '' ? ` on ${plain(said.device)}` : '';
  const doing = said.doing && plain(said.doing) !== '' ? `: ${plain(said.doing)}` : '';
  const cards: BriefCard[] = [
    { h: 'first-001', line: fitted(`${plain(said.agent)} started on ${plain(said.project)}${where}${doing}.`), row: said.row, cause: null, by: 'rule' },
  ];
  if (said.next && plain(said.next) !== '') cards.push({ h: 'first-002', line: fitted(`Next: ${plain(said.next)}.`), row: said.row, cause: null, by: 'rule' });
  return cards;
}
