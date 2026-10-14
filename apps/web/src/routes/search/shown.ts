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
 * IT USED TO COMPOUND WITH A LIST NOTHING COULD FIND. `packages/seed`'s `personal` use case ships
 * `budgets` with no `search: true` on any of its four fields, and until `2dc32e2f` that register had
 * nothing in the index, so every query about a budget answered nothing and the query after it opened
 * on the false verdict. That commit indexes a row's title whatever the flags say, so a budget line is
 * found by its category now; the rule here stands on the empty `find('')` alone.
 *
 * THE RULE, AND IT IS NOT "REDRAW EVERYTHING": a list of hits is content, and a reader can see that
 * content is about something. A verdict is a claim, and this one quotes the words in the box. So
 * hits from the previous query stay while the next answer is out, and a verdict or a refusal from
 * the previous query does not: those two arms wait instead.
 */

import type { SearchResult } from '../../lib/record/api.ts';
import { BY_MEANING, type Found, type Meaning } from '../../lib/record/search-live.ts';

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

/** A list that matched, as much of it as the sentence and the tile read: its name and how many matched in it. */
export type Matched = { kind: string; total: number };

/**
 * The list most of the matches are in, or `null` when two share the top.
 *
 * A TIE HAS NO "MOST". Naming the first of two equal lists would be the order the record answered in, said as a fact
 * about where the matches are, so a tie highlights nothing and the words leave the claim out.
 */
export function topOf<T extends Matched>(groups: readonly T[]): T | null {
  let top: T | null = null;
  let tied = false;
  for (const g of groups) {
    if (top === null || g.total > top.total) {
      top = g;
      tied = false;
    } else if (g.total === top.total) tied = true;
  }
  return tied ? null : top;
}

const AND = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

const matches = (n: number): string => (n === 1 ? '1 match' : `${n.toLocaleString('en')} matches`);

/**
 * THE TITLE ROW'S SENTENCE, from the answer and nothing else: how many matched, in how many lists, and which list
 * holds most of them. `null` when there is nothing to say, so an empty answer is the empty state and not a sentence.
 */
export function sentenceOf(q: string, found: { total: number; groups: readonly Matched[] }): string | null {
  const said = q.trim();
  if (found.total <= 0 || found.groups.length === 0 || said === '') return null;
  const head = `${matches(found.total)} for “${said}”`;
  if (found.groups.length === 1) return `${head} in ${found.groups[0]!.kind}.`;
  const top = topOf(found.groups);
  const lists = `${found.groups.length} lists`;
  return top ? `${head} in ${lists}; most in ${top.kind}.` : `${head} in ${lists}.`;
}

/** The reading line under the tile's bars: how many of the matches the top list holds, or the spread when two tie. */
export function whereSaid(found: { total: number; groups: readonly Matched[] }): string {
  const top = topOf(found.groups);
  if (!top) {
    const most = Math.max(...found.groups.map((g) => g.total));
    const tied = found.groups.filter((g) => g.total === most).map((g) => g.kind);
    return `${AND.format(tied)} hold ${most.toLocaleString('en')} each, of ${found.total.toLocaleString('en')}.`;
  }
  const n = top.total.toLocaleString('en');
  return `${n} of ${found.total.toLocaleString('en')} ${top.total === 1 ? 'is' : 'are'} in ${top.kind}.`;
}

/** How many of an answer's hits the record found by meaning, and not by any word typed. */
export function byMeaningOf(result: Pick<SearchResult, 'hits'>): number {
  return result.hits.filter((h) => h.detail === BY_MEANING).length;
}

/**
 * THE ONE QUIET LINE ABOUT MEANING: how many of the hits share no word with the query, or, when nothing was found, why
 * the record searched by its words alone. `null` when there is nothing to say, which is every record that does not
 * send how it searched, a host with no search by meaning (`none`), and a search by words that found nothing (`words`).
 *
 * SO A RECORD THAT HOLDS NOTHING CAN BE TOLD FROM ONE WHOSE SEARCH BY MEANING IS OFF. "Nothing matches" was all a
 * person learned either way. The place named is where `SlashReads.svelte` is mounted: Settings, the Agents area.
 */
export function meaningLine(q: string, found: { total: number; byMeaning: number }, meaning: Meaning | undefined): string | null {
  const said = q.trim();
  if (said === '') return null;
  if (found.byMeaning > 0) return `${found.byMeaning.toLocaleString('en')} of these share no word with “${said}”: Slash found them by meaning.`;
  if (found.total > 0) return null;
  if (meaning === 'off') return 'Searched by its words only: Slash reading on its own is off. Turn it on in Settings, under Agents.';
  if (meaning === 'spent') return "Searched by its words only: this month's searches by meaning are used.";
  if (meaning === 'failed') return 'Searched by its words only: the model did not answer this time.';
  return null;
}
