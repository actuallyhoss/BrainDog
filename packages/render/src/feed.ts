/**
 * What `feed` decides, as functions both drawers call.
 *
 * Kept out of the markup for the reason `cards.ts` is: an answer here can be tested without a DOM,
 * and two drawers that each worked it out would be two answers.
 *
 * THE ROWS ARE WHAT A PAGE'S EVALUATOR WRITES FROM `activity`, newest first:
 *
 *   by | who | count | what | when | tone
 *
 * `by` is the kind of actor, and the rows are grouped by it, so a machine's work is never folded
 * into the person's. A burst is one row: `agent | Claude | 14 | saves on Variable axis QA | 3h ago`.
 * One more row, `seen | when`, sits where the reader last looked, so the rows above it are new; an
 * empty `when` there is the reader who has not looked yet.
 */

import type { Inline } from './inline.ts';

/** The kinds of actor, in the order their groups are drawn. Closed, because each is a group. */
export const FEED_BY = ['agent', 'rule', 'you'] as const;

export type FeedBy = (typeof FEED_BY)[number];

/** The first cell of the row that marks where the reader last looked. */
export const FEED_SEEN = 'seen';

const isBy = (s: string): s is FeedBy => (FEED_BY as readonly string[]).includes(s);

/**
 * The renderer's own words, here for the reason `CARDS_NONE` is in `cards.ts`: it cannot import the
 * app's `copy.ts`. The two empty sentences are two different facts, and each gets its own: a
 * mark with nothing past it, and no mark at all.
 */
export const FEED_GROUPS: Record<FeedBy, string> = { agent: 'Agents', rule: 'Rules', you: 'You' };
export const FEED_NOTHING_NEW = 'Nothing new.';
export const FEED_NO_MARK = 'Nothing to catch up on yet. From your next visit, what changed while you were away shows here.';
/** The line between the new rows of a group and the ones that were there last time, in words. */
export const FEED_EARLIER = 'Before you last looked';
export const feedNew = (n: number): string => `${n} new`;

/**
 * Whether a line's count is drawn: a burst of more than one. A line is one thing unless it says otherwise, so a `1` in
 * front of every line said nothing, and "Since you were away" was eight rows of `1 C Categorise what cleared changed
 * TALLYARD` (the home review). A count that is not a number is the author's words, and stays.
 */
export const feedBurst = (count: string): boolean => {
  const t = count.trim();
  const n = Number(t.replace(/,/gu, ''));
  return t !== '' && n !== 0 && n !== 1;
};

/**
 * What is wrong with a feed's rows, in words, or null when nothing is.
 *
 * The parser degrades the block with this, because a row filed under a group that does not exist
 * would otherwise vanish from every group, and a feed that quietly drops a row is a silent decision.
 */
export function feedFault(rows: readonly (readonly string[])[]): string | null {
  let seen = 0;
  for (const cells of rows) {
    const word = (cells[0] ?? '').trim();
    if (word === FEED_SEEN) {
      if (++seen > 1) return 'more than one seen row';
    } else if (!isBy(word)) return `a row that starts "${word}" where ${FEED_BY.join(', ')} or ${FEED_SEEN} goes`;
  }
  return null;
}

/** How many things a row stands for. A row without a number is still one thing, never zero. */
const weight = (count: string | undefined): number => {
  const n = Number((count ?? '').trim().replace(/,/gu, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export type FeedGroup<R> = {
  by: FeedBy;
  label: string;
  rows: { row: R; fresh: boolean }[];
  /** What the new rows stand for, which is the count the head shows in the accent. */
  fresh: number;
  total: number;
  /** Where the read rows start, when new rows sit above them; -1 draws no dividing line. */
  earlier: number;
};

/**
 * The rows in their groups, each marked new or not, and the sentence for an empty feed.
 *
 * Lenient where `feedFault` is strict: a row under a group this does not know is left out rather
 * than thrown, because `Block` is a public type a host can build by hand. Rows keep their order, and
 * the new ones are above the mark, so in every group the new rows come first.
 */
export function feedPlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { groups: FeedGroup<R>[]; empty: string; lone: boolean } {
  const at = rows.findIndex((r) => (r.cells[0] ?? '').trim() === FEED_SEEN);
  const marked = at >= 0 && (rows[at]?.cells[1] ?? '').trim() !== '';
  const groups = FEED_BY.map((by): FeedGroup<R> => {
    const mine = rows.flatMap((row, i) => ((row.cells[0] ?? '').trim() === by ? [{ row, fresh: marked && i < at }] : []));
    const sum = (list: typeof mine) => list.reduce((n, m) => n + weight(m.row.cells[2]), 0);
    const fresh = sum(mine.filter((m) => m.fresh));
    return { by, label: FEED_GROUPS[by], rows: mine, fresh, total: sum(mine), earlier: fresh > 0 ? mine.findIndex((m) => !m.fresh) : -1 };
  }).filter((g) => g.rows.length > 0);
  /* ONE GROUP NEEDS NO HEAD. "Rules" alone over every line of "Since you were away" named a group with nothing beside
     it to tell it from (the home review), so a feed of one kind of actor is its lines alone. */
  return { groups, empty: at >= 0 && !marked ? FEED_NO_MARK : FEED_NOTHING_NEW, lone: groups.length === 1 };
}

/**
 * A word a bank shouts, capitals only, in any alphabet; and one long enough that a run holding it is a name and not an
 * acronym. NOT `\b[A-Z]`, whose edges are ASCII: `BÄCKEREI` was split at the `Ä` and came out `BÄCkerei`.
 */
const SHOUTED = /(?<![\p{L}\p{N}])\p{Lu}{2,}(?: \p{Lu}{2,})*(?![\p{L}\p{N}])/gu;
const NAME_LONG = 5;
const NAME_CASED = 4;

/**
 * A payee's name as a person writes it, where the bank sent it in capitals: `changed TALLYARD` is `changed Tallyard`,
 * and `KILN STOREFRONT PAYOUT` is `Kiln Storefront Payout`.
 *
 * ONLY A RUN THAT HOLDS A LONG WORD, AND ONLY ITS WORDS OF FOUR LETTERS OR MORE, so an acronym stays one: `HSBC`, `VAT`
 * and `UK` are how their owners write them, and `SG10`, which has a figure in it, is never touched. Shouting was the
 * bank's, not the person's (the home review: eight lines of `changed TALLYARD`).
 */
export function feedCased(text: string): string {
  return text.replace(SHOUTED, (run) =>
    run.split(' ').some((w) => w.length >= NAME_LONG)
      ? run
          .split(' ')
          .map((w) => (w.length >= NAME_CASED ? w[0] + w.slice(1).toLowerCase() : w))
          .join(' ')
      : run,
  );
}

/** `feedCased` over the words of a cell, inside its links and emphasis too, and never inside code. */
export function feedCasedNodes(nodes: readonly Inline[]): Inline[] {
  return nodes.map((n) => {
    if (n.type === 'text') return { ...n, text: feedCased(n.text) };
    if (n.type === 'strong' || n.type === 'em' || n.type === 'link') return { ...n, body: feedCasedNodes(n.body) };
    return n;
  });
}
