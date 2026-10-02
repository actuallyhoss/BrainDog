/**
 * THE ONE LINE OF WHAT ACCEPTING DOES, on the handle of the tile everything it does is folded into.
 *
 * `/decide/<id>` drew up to seven tiles before the options: what an arrangement does, what a proposal puts in place, the
 * rows to tick, the rows it changes, what it calls, why it was asked and what it costs. They are one folded tile under
 * the options now, and this is what the tile says shut: the first of those parts this question has, in the words the
 * queue already used for it, so a person who does not open it still reads what the yes changes.
 *
 * PURE AND NODE-LOADABLE, so `does.test.ts` holds the order without a component.
 */

import { copy } from '../../../lib/copy.ts';
import { installWords } from '../../../lib/record/actions.ts';
import { words as pickWords } from './picked.ts';
import { words } from '../words.ts';

/** What accepting a question does, as far as the gate can say it, each part absent where the question has none. */
export type Does = {
  /** An arrangement's story (`arranged.ts`): its lead and its short summary. */
  story: { lead: string; summary: string } | null;
  /** What a proposal puts in place, each by its kind and title (`proposed.ts`). */
  appears: readonly { kind: string; title: string }[];
  /** The rows to tick, and how many of them are ticked. */
  picks: { on: number; of: number } | null;
  /** How many rows it changes, and the list they are in. */
  updates: { n: number; list: string } | null;
  /** How many services accepting would call. */
  calls: number;
};

/** The tile's line: the arrangement, else what appears, else the rows it adds or changes, else what it calls. */
export function doesLine(d: Does): string {
  if (d.story) return d.story.summary ? copy.arrangeLeadSummary(d.story.lead, d.story.summary) : d.story.lead;
  const first = d.appears[0];
  if (first) return d.appears.length > 1 ? words.andMore(`${first.kind}: ${first.title}`, d.appears.length - 1) : `${first.kind}: ${first.title}`;
  if (d.picks) return pickWords.some(d.picks.on, d.picks.of);
  if (d.updates && d.updates.n > 0) return `${copy.decideRows(d.updates.n, d.updates.list)}.`;
  if (d.calls > 0) return `${installWords.heading}.`;
  return words.doesOpen;
}
