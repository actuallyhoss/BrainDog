/**
 * WHICH OF THE FIVE STATES `/search` IS IN, AND WHICH QUERY THE ANSWER ON SCREEN WAS COMPUTED FOR.
 *
 * This began as a transcription of the `{#if}` chain in `+page.svelte`, made so the chain could be
 * held against a test at all. The transcription was four lines and it read `answer.value.total === 0
 * ? 'none' : 'hits'`, with nothing anywhere asking which query `answer` belonged to.
 *
 * `answer` IS NEVER CLEARED WHEN THE QUERY CHANGES, and that is deliberate for hits: the field
 * writes the address 150 ms after the last keystroke, the read goes out on the address, and blanking
 * the results to skeleton bars between one query and the next would flash the whole page on every
 * pause in typing. What it is not deliberate for is a verdict. `copy.searchNone(q)` interpolates the
 * query that is in the box RIGHT NOW into a conclusion computed for a query that is no longer there,
 * and `copy.searchNoneNext` then tells the reader to check their spelling.
 *
 * SO THE SECOND QUERY OF EVERY SESSION THAT FOLLOWED AN EMPTY ONE OPENED ON A FALSE VERDICT.
 * Measured through `searcher()` against a stub `fetch`, which is what the route calls: landing on
 * `/search` with no query resolves `find('')` synchronously (`terms('')` is empty, so nothing is
 * sent) and leaves `answer` holding `{ hits: [], total: 0, groups: [] }`. The first real query then
 * changes `q`, re-renders before the request it triggered has been answered, and falls straight
 * through to the `total === 0` arm. The screen states `Nothing matches "<the new words>"` over a
 * record nobody has asked about them.
 *
 * AND IT COMPOUNDS WITH A RECORD WHOSE LISTS CANNOT BE SEARCHED. `packages/seed`'s `personal` use
 * case ships `budgets` with no `search: true` on any of its four fields, so every query that record
 * is asked answers nothing, so every following query opens on the false verdict rather than only the
 * ones after a genuine miss.
 *
 * THE RULE, AND IT IS NOT "REDRAW EVERYTHING": a list of hits is content, and a reader can see that
 * content is about something. A verdict is a claim, and this one quotes the words in the box. So
 * hits from the previous query stay while the next answer is out, and a verdict or a refusal from
 * the previous query does not: those two arms wait instead.
 */

import type { Found } from '../../lib/record/search-live.ts';

/**
 * The five arms of the page, named.
 *
 * `idle` is the nav's ordinary way in, with nothing typed. `waiting` is the record not having
 * answered the words that are on screen. The other three are the answer.
 */
export type Shown = 'idle' | 'waiting' | 'refused' | 'none' | 'hits';

/**
 * The arm to draw, for the words in the box and the answer in hand.
 *
 * `answeredFor` is the query `answer` was computed for, and `null` before anything has been asked.
 * It is compared to `q` exactly as both were written: the effect passes the same string the address
 * carries, so there is nothing to fold here that folding could only get wrong.
 */
export function shownState(q: string, answer: Found | null, answeredFor: string | null): Shown {
  if (!q) return 'idle';
  if (!answer) return 'waiting';

  /* HOW MANY HITS THIS ANSWER HOLDS, counted the same way for both shapes: a refusal holds none, so
     a refusal left over from an earlier query takes the stale branch below with the verdicts, which
     is where it belongs. "The record changed while it was being read" is as much a claim about words
     that were never sent as "Nothing matches" is. */
  const held = answer.from === 'refused' ? 0 : answer.value.total;
  if (answeredFor !== q && held === 0) return 'waiting';

  if (answer.from === 'refused') return 'refused';
  return held === 0 ? 'none' : 'hits';
}
