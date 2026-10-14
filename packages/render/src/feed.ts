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
 *
 * A FEED READ BY DAY carries a third kind of row, `day | Today`, a heading over the rows that follow it until the next
 * one. Then the rows are grouped by their day, in the order they came, and never by who did them: a day is read down,
 * and each line still wears its own actor's mark. The host writes the heading's words ("Today", "Yesterday",
 * "Mon 12 Oct"), because only it knows the reader's clock. And a line that stands for a run's work may carry a sixth
 * cell, the words of its fold ("and 39 more"), which the host writes too.
 */

import type { Inline } from './inline.ts';

/** The kinds of actor, in the order their groups are drawn. Closed, because each is a group. */
export const FEED_BY = ['agent', 'rule', 'you'] as const;

export type FeedBy = (typeof FEED_BY)[number];

/** The first cell of the row that marks where the reader last looked. */
export const FEED_SEEN = 'seen';

/** The first cell of the row that is a day's heading, its second cell the heading's words. */
export const FEED_DAY = 'day';

const isBy = (s: string): s is FeedBy => (FEED_BY as readonly string[]).includes(s);

/** Where a line's fold is written: the cell after `when`. */
const FOLD_CELL = 5;

/** The words of a line's fold ("and 39 more"), or the empty string where the line folds nothing. */
export const feedFold = (cells: readonly string[]): string => (cells[FOLD_CELL] ?? '').trim();

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
    } else if (word === FEED_DAY) {
      /* A heading with no words would part the lines under a gap nobody could read. */
      if ((cells[1] ?? '').trim() === '') return `a ${FEED_DAY} row that names no day`;
    } else if (!isBy(word)) return `a row that starts "${word}" where ${FEED_BY.join(', ')}, ${FEED_DAY} or ${FEED_SEEN} goes`;
  }
  return null;
}

/** How many things a row stands for. A row without a number is still one thing, never zero. */
const weight = (count: string | undefined): number => {
  const n = Number((count ?? '').trim().replace(/,/gu, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export type FeedGroup<R> = {
  /** The kind of actor the group is for, or `FEED_DAY` where it is a day and its lines are of every kind. */
  by: FeedBy | typeof FEED_DAY;
  /** The head's words: the kind of actor, or the day as the host wrote it. Empty for lines above the first day. */
  label: string;
  /** Each line with its own actor, which in a day is not the group's. */
  rows: { row: R; fresh: boolean; by: FeedBy }[];
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
export function feedPlan<R extends { cells: readonly string[] }>(rows: readonly R[]): { groups: FeedGroup<R>[]; empty: string; lone: boolean; days: boolean } {
  const word = (r: R): string => (r.cells[0] ?? '').trim();
  const at = rows.findIndex((r) => word(r) === FEED_SEEN);
  const marked = at >= 0 && (rows[at]?.cells[1] ?? '').trim() !== '';
  const empty = at >= 0 && !marked ? FEED_NO_MARK : FEED_NOTHING_NEW;
  type Line = FeedGroup<R>['rows'][number];
  const group = (by: FeedGroup<R>['by'], label: string, mine: Line[]): FeedGroup<R> => {
    const sum = (list: Line[]) => list.reduce((n, m) => n + weight(m.row.cells[2]), 0);
    const fresh = sum(mine.filter((m) => m.fresh));
    return { by, label, rows: mine, fresh, total: sum(mine), earlier: fresh > 0 ? mine.findIndex((m) => !m.fresh) : -1 };
  };
  const lines = rows.flatMap((row, i): (Line & { i: number })[] => {
    const by = word(row);
    return isBy(by) ? [{ row, fresh: marked && i < at, by, i }] : [];
  });
  const line = ({ row, fresh, by }: Line): Line => ({ row, fresh, by });

  /* BY DAY, where the host named one. Each heading takes the lines down to the next, in the order they came, and a
     heading with nothing under it is dropped: a day named over no line is a day nothing happened on. The mark is one
     place in the whole feed, so it falls inside one day, and only that day draws the line where the read ones begin. */
  const heads = rows.flatMap((row, i) => (word(row) === FEED_DAY ? [{ label: (row.cells[1] ?? '').trim(), i }] : []));
  if (heads.length > 0) {
    const spans = [{ label: '', i: -1 }, ...heads];
    const groups = spans
      .map((h, n) => {
        const end = spans[n + 1]?.i ?? rows.length;
        return group(FEED_DAY, h.label, lines.filter((m) => m.i > h.i && m.i < end).map(line));
      })
      .filter((g) => g.rows.length > 0);
    /* A DAY IS ALWAYS NAMED, even alone: "Today" over the only day says something "Rules" over the only group did not. */
    return { groups, empty, lone: false, days: true };
  }

  const groups = FEED_BY.map((by) => group(by, FEED_GROUPS[by], lines.filter((m) => m.by === by).map(line))).filter((g) => g.rows.length > 0);
  /* ONE GROUP NEEDS NO HEAD. "Rules" alone over every line of "Since you were away" named a group with nothing beside
     it to tell it from (the home review), so a feed of one kind of actor is its lines alone. */
  return { groups, empty, lone: groups.length === 1, days: false };
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
    if (n.type === 'strong' || n.type === 'em' || n.type === 'link' || n.type === 'bad') return { ...n, body: feedCasedNodes(n.body) };
    return n;
  });
}
