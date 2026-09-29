/**
 * What `/slash` says in figures and sentences: the line under the title, whose red phrase is the
 * suggestions waiting for him on Decide, and the "Suggestions" tile's figure, bar and reading line.
 *
 * EVERY NUMBER IS ONE `readSlash` ANSWERED. The tile counts `suggestionsOf(reading)` by where each stands and nothing
 * else, and the cap is the record's own `cap`, so no figure here is a guess.
 *
 * PURE, SO `node --test` CAN IMPORT IT.
 */

import type { Suggestion } from '../../lib/record/slash.ts';

export const words = {
  /* The groups this screen adds to `slash.ts`'s. */
  answeredTitle: 'What you answered',
  allAnswered: 'You have answered everything Slash suggested. What it notices next is drafted here.',
  /* The title row's red phrase. */
  waitOn: (n: number) => (n === 1 ? 'One suggestion waits for you on Decide' : `${n} suggestions wait for you on Decide`),
  /* The tile. */
  tileTitle: 'Suggestions',
  tileMeta: 'Nothing changes until you say yes',
  unit: (n: number) => (n === 1 ? 'suggestion' : 'suggestions'),
  partWaiting: 'On Decide',
  partNew: 'New',
  partAnswered: 'Answered',
  /* The answer, in the Ask tile. */
  asked: 'You asked',
  rowsRead: (n: number) => (n === 1 ? '1 row' : `${n.toLocaleString('en')} rows`),
  /* The hint under "What Slash suggests". */
  press: 'Put these on Decide and each waits there for your yes. Nothing changes until then.',
} as const;

/** The title row's sentence, and the phrase inside it that needs him. */
export type Sentence = { text: string; needs: string | undefined };

/**
 * THE LINE UNDER "Slash": what waits for him first, in red, then who drafts (`draftedBy`, the screen's line).
 * With nothing waiting it is who drafts alone, with no red, because nothing on this screen is late.
 */
export function sentenceOf(by: string, waiting: number): Sentence {
  if (waiting <= 0) return { text: by, needs: undefined };
  const needs = words.waitOn(waiting);
  return { text: `${needs}. ${by}`, needs };
}

/** One part of the tile's bar. */
export type Part = { label: string; value: number; tone: 'warn' | 'ink' | 'earn' };

/** The tile: how many Slash suggested, the bar of where each stands, and the line that reads it. */
export type Tally = { total: number; parts: Part[]; reading: string };

/** "a, b and c". */
const listed = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/**
 * "Suggestions": new, waiting on Decide and answered, as one stacked bar. Waiting is amber, since it waits on him; new is
 * ink, since it is his to put there; answered is green, since it is done. `null` with nothing suggested.
 *
 * `onDecide` IS THE RECORD'S COUNT of Slash's open questions, the one `canAsk` holds under `cap`, so the line can say why
 * the new ones are not put there yet when Decide is full.
 */
export function tallyOf(suggestions: readonly Suggestion[], onDecide: number, cap: number): Tally | null {
  if (suggestions.length === 0) return null;
  const waiting = suggestions.filter((s) => s.state === 'waiting').length;
  const fresh = suggestions.filter((s) => s.state === 'new').length;
  const answered = suggestions.filter((s) => s.state === 'answered').length;
  const parts: Part[] = [
    { label: words.partWaiting, value: waiting, tone: 'warn' as const },
    { label: words.partNew, value: fresh, tone: 'ink' as const },
    { label: words.partAnswered, value: answered, tone: 'earn' as const },
  ].filter((p) => p.value > 0);
  const clauses = [
    ...(waiting > 0 ? [`${waiting} ${waiting === 1 ? 'waits' : 'wait'} for you on Decide`] : []),
    ...(fresh > 0 ? [`${fresh} ${fresh === 1 ? 'is' : 'are'} not asked yet`] : []),
    ...(answered > 0 ? [`you answered ${answered}`] : []),
  ];
  const head = listed(clauses);
  const full = fresh > 0 && cap > 0 && onDecide >= cap ? ` Slash keeps at most ${cap} on Decide at once, so the new ones wait their turn.` : '';
  return { total: suggestions.length, parts, reading: `${head.charAt(0).toUpperCase()}${head.slice(1)}.${full}` };
}
