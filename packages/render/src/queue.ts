/**
 * What `queue` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `feed.ts` and `cards.ts` are: an answer here can be tested
 * without a DOM, and two drawers that each worked it out would be two answers.
 *
 * WHAT IT IS FOR. A queue is the short list of things waiting on a person, costliest first, with what
 * their agents recommend. It is the shape `20 §3` asks for and the one Decide is built around: a
 * question, who opened it, why it is being asked, and the ways to answer it.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES, in the record's own order. A question and its options
 * are separate rows, the first cell saying which:
 *
 *   q    | id | who | when | question | why
 *   opt  | id | key | label | because | recommended
 *   more | n
 *
 * The `more` row, last and at most one, is how many are waiting past the ones drawn, so a person
 * reading three cards knows whether that is the whole of it. The evaluator counts it; a queue that
 * silently drew the first three of nine would be a queue that lies about how much is waiting.
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
/** What the last line says when a queue holds more than it draws. */
export const queueMore = (n: number): string => `${n} more`;

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
      ended = true;
      continue;
    }
    if (word === 'q') {
      if (open && options === 0) return 'a question with no way to answer it';
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
export function queuePlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { items: QueueItem<R>[]; more: number; empty: string } {
  const items: QueueItem<R>[] = [];
  let more = 0;
  for (const row of rows) {
    const word = cell(row.cells, 0);
    if (word === 'more') {
      const n = Number(cell(row.cells, 1));
      more = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
      continue;
    }
    if (word === 'q') {
      items.push({ row, id: cell(row.cells, 1), who: cell(row.cells, 2), when: cell(row.cells, 3), question: cell(row.cells, 4), why: cell(row.cells, 5), options: [] });
      continue;
    }
    if (word !== 'opt') continue;
    const at = items.at(-1);
    if (!at) continue;
    at.options.push({ row, key: cell(row.cells, 2), label: cell(row.cells, 3) || cell(row.cells, 2), because: cell(row.cells, 4), recommended: cell(row.cells, 5).toLowerCase() === 'true' });
  }
  return { items, more, empty: QUEUE_CLEARED };
}
