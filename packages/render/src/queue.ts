/**
 * What `queue` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `feed.ts` and `cards.ts` are: an answer here can be tested
 * without a DOM, and two drawers that each worked it out would be two answers.
 *
 * WHAT IT IS FOR. A queue is the short list of things waiting on a person, with what their agents
 * recommend. It is the shape `20 §3` asks for and the one Decide is built around: a question, who
 * opened it, why it is being asked, and the ways to answer it.
 *
 * DEAREST FIRST, AND THE ORDER IS THE EVALUATOR'S. `19 §6` asks for the queue ranked by cost of
 * being wrong, and for a week this file said it was while `governance.open` ordered by recency —
 * a docstring making a promise the evaluator never made. The record computes the band now
 * (`@braindog/kernel`'s `weigh.ts`) from what accepting the proposal would do, and sends it down as
 * the question row's seventh cell. THIS NEVER REORDERS, and that has not changed: what is dearest
 * is the record's judgement to make, not the drawer's, and a queue that re-sorted what it was
 * handed would be a second ranking nobody could see the input to.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES, in the record's own order. A question and its options
 * are separate rows, the first cell saying which:
 *
 *   q    | id | who | when | question | why | cost
 *   opt  | id | key | label | because | recommended
 *   more | n | where the rest of them are, optional
 *
 * The `more` row, last and at most one, is how many are waiting past the ones drawn, so a person
 * reading three cards knows whether that is the whole of it. The evaluator counts it; a queue that
 * silently drew the first three of nine would be a queue that lies about how much is waiting.
 *
 * AND ITS THIRD CELL IS WHERE THEY ARE, because a count with nowhere to press is a dead end: "5 more"
 * told a reader there was more and gave them no way to reach it. The ADDRESS IS THE EVALUATOR'S, never
 * this package's — a renderer that knew `/decide` would be a renderer with a route in it, and the
 * host is the only thing that knows where its own questions live (the same rule `cellHref` and `link`
 * follow). Without it the count is still drawn, as plain words.
 *
 * A ROW PER OPTION RATHER THAN ONE WIDE ROW, because the number of options is not fixed and a row of
 * cells is. `feed` already marks one of its rows the same way, with `seen`, so this is the primitive's
 * own idiom rather than a new one.
 *
 * `recommended` IS A LABEL AND NEVER A SELECTION. An agent's recommendation is drawn as a word beside
 * the option it names, and nothing is pre-chosen: a queue that arrives with an answer already filled
 * in is a queue that gets pressed through, which is the opposite of what a question is for. The same
 * rule as `19 §6` read from the other side.
 */

import { safeHref } from './inline.ts';

/** The kinds of row, by their first cell. Closed, because a row filed under none of them is a fault. */
export const QUEUE_ROWS = ['q', 'opt', 'more'] as const;

export type QueueRowKind = (typeof QUEUE_ROWS)[number];

const isRowKind = (s: string): s is QueueRowKind => (QUEUE_ROWS as readonly string[]).includes(s);

/**
 * The renderer's own words, here for the reason `FEED_GROUPS` is in `feed.ts`: this package cannot
 * import the app's `copy.ts`, and these are the only words a queue draws that its author did not write.
 */
export const QUEUE_CLEARED = 'Nothing is waiting on you.';
export const QUEUE_RECOMMENDED = 'Recommended';

/**
 * What each cost band is called on screen, and the closed set of them.
 *
 * THE FACT IS THE RECORD'S AND THE WORDS ARE THIS PACKAGE'S, which is the same split `TONES` makes
 * in `kinds.ts`: the kernel decides which band a question is in, because that is a judgement about
 * the record, and it holds no English because a kernel with a reader in it is a kernel that has to
 * know what language they read. A band this package does not know draws nothing rather than drawing
 * its own name, because a chip reading `undo-ish` is worse than no chip.
 *
 * FOUR WORDS AND NO SENTENCE. The band is the reason the question is where it is in the list, and
 * that is all it says: a chip is a label, not an argument for the ranking. Why a proposal is
 * expensive is in the question's own `why`, written by whoever opened it.
 */
export const QUEUE_COSTS: Record<string, string> = {
  undo: 'Hard to undo',
  shape: 'Changes the setup',
  rows: 'Adds rows',
  call: 'A judgement',
};

/**
 * What a question's band is called, or `''` for a band this package has no word for.
 *
 * `Object.hasOwn`, THE SAME GUARD `queueFault` TEN LINES DOWN ALREADY USES on this very table. A
 * plain-object read answers `constructor` with the Object constructor, so a band spelled that way
 * came back as a FUNCTION from a function declared to return a string, and `escape` throws on one.
 * The parser refuses that band before a fence can reach here, which is the only reason it was never
 * seen; `queueCost` is exported and a host calls it directly.
 */
export const queueCost = (band: string): string => (Object.hasOwn(QUEUE_COSTS, band) ? QUEUE_COSTS[band]! : '');
/** What the last line says when a queue holds more than it draws. */
export const queueMore = (n: number): string => `${n} more`;

/**
 * Where the rest of a queue is: a path of this host's, or nothing. Anything else is a fault.
 *
 * A LEADING SLASH IS NOT THE TEST FOR SAME-ORIGIN, and this was the second gate in the package that
 * had not been told. `inline.ts`'s `safeHref` carries the whole argument: `//evil.example/x` starts
 * with a slash, carries no scheme, and is a protocol-relative URL the browser completes with the
 * current page's scheme; `/\evil.example/x` is the same thing, because a URL parser reads a
 * backslash in the authority position as a slash. Both matched `^/\S*$`, both were accepted as "a
 * path of this record", and `toHTML` drew `<a class="queue-more" href="/\evil.example/x">` on a page
 * whose rows an agent writes. So the shape check stays here, and the origin question is asked of the
 * one function that answers it, rather than of a second regex that would drift away from the first.
 */
const PATH = /^\/[^\s]*$/u;

const ours = (where: string): boolean => PATH.test(where) && safeHref(where) !== null;

/**
 * What is wrong with a queue's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this rather than dropping rows, because an option filed under no
 * question would otherwise vanish, and a queue that quietly loses a way to answer is a silent decision
 * about somebody else's choice.
 */
export function queueFault(rows: readonly (readonly string[])[]): string | null {
  let open = false;
  let options = 0;
  let ended = false;
  for (const cells of rows) {
    const word = (cells[0] ?? '').trim();
    if (!isRowKind(word)) return `a row that starts "${word}" where ${QUEUE_ROWS.join(', ')} goes`;
    if (ended) return 'a row after the count of what is left';
    if (word === 'more') {
      if (!/^\d+$/u.test((cells[1] ?? '').trim())) return 'a count of what is left that is not a whole number';
      const where = (cells[2] ?? '').trim();
      if (where !== '' && !ours(where)) return 'a place to see the rest that is not a path of this record';
      ended = true;
      continue;
    }
    if (word === 'q') {
      if (open && options === 0) return 'a question with no way to answer it';
      /* A BAND WITH NO WORD IS A FAULT, AND NO BAND AT ALL IS NOT. A host writing a queue by hand may
         not have one, and a question with no chip is a question; a band spelled `undoable` is a
         ranking this package silently ignored, which is the failure that looks like it worked. */
      const band = (cells[6] ?? '').trim();
      if (band !== '' && !Object.hasOwn(QUEUE_COSTS, band)) return `a cost band this build has no word for: "${band}"`;
      open = true;
      options = 0;
    } else {
      if (!open) return 'an option before any question';
      options += 1;
    }
  }
  return open && options === 0 ? 'a question with no way to answer it' : null;
}

export type QueueOption<R> = {
  row: R;
  /** The id `decide` takes as the answer. */
  key: string;
  label: string;
  /** The reason to pick it, which the option's author wrote. */
  because: string;
  recommended: boolean;
};

export type QueueItem<R> = {
  row: R;
  /** The suggestion's id, which is what an act is reported against. */
  id: string;
  /** Who opened it, as the record names an actor. */
  who: string;
  /** When it was opened, as the evaluator formatted it. */
  when: string;
  question: string;
  /** Why it is being asked, written by whoever opened it. Empty when they wrote none. */
  why: string;
  /** The band the record put it in, and the reason it sits where it does. Empty when it said none. */
  cost: string;
  /** That band's word, or `''` for a band this package has no word for. */
  costLabel: string;
  options: QueueOption<R>[];
};

const cell = (cells: readonly string[], i: number): string => (cells[i] ?? '').trim();

/**
 * The rows as questions with their options, and the sentence for a queue with nothing in it.
 *
 * Lenient where `queueFault` is strict, for the reason `feedPlan` is: `Block` is a public type a host
 * can build by hand, so an option before any question is left out rather than thrown. Order is the
 * evaluator's, which is the record's own, and this never reorders: what is costliest is the record's
 * judgement to make, not the drawer's.
 */
export function queuePlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { items: QueueItem<R>[]; more: number; moreHref: string | null; empty: string } {
  const items: QueueItem<R>[] = [];
  let more = 0;
  let moreHref: string | null = null;
  for (const row of rows) {
    const word = cell(row.cells, 0);
    if (word === 'more') {
      const n = Number(cell(row.cells, 1));
      more = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      const where = cell(row.cells, 2);
      moreHref = ours(where) ? where : null;
      continue;
    }
    if (word === 'q') {
      const band = cell(row.cells, 6);
      items.push({ row, id: cell(row.cells, 1), who: cell(row.cells, 2), when: cell(row.cells, 3), question: cell(row.cells, 4), why: cell(row.cells, 5), cost: band, costLabel: queueCost(band), options: [] });
      continue;
    }
    if (word !== 'opt') continue;
    const at = items.at(-1);
    if (!at) continue;
    at.options.push({ row, key: cell(row.cells, 2), label: cell(row.cells, 3) || cell(row.cells, 2), because: cell(row.cells, 4), recommended: cell(row.cells, 5).toLowerCase() === 'true' });
  }
  return { items, more, moreHref, empty: QUEUE_CLEARED };
}
