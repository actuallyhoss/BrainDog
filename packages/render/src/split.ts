/**
 * What `split` decides, as functions both drawers call.
 *
 * A split is one track cut into parts, one per row, with a legend of dots and figures under it. The
 * geometry lives here, as `cards.ts` keeps the trend's, so both renderers draw the same cuts and a
 * test can check them without a DOM.
 */

import { slotOf } from './slot.ts';

/** Two decimals at most, and no trailing zeros, so an attribute stays short and exact. */
const at = (n: number): string => String(Math.round(n * 100) / 100);

/** The neutral steps a part is drawn in, darkest first. A fifth part and after share the last. */
export const SPLIT_STEPS = 4;

/** One drawn part of the track, in the `0 0 1000 100` box. */
export type SplitPart = {
  /** The row it draws, by index in the block. */
  at: number;
  x: string;
  width: string;
  /** Which neutral step it is drawn in, 0 to 3. A row with a tone is drawn in its intent instead. */
  step: number;
  /** Its share of the whole, as printed: `40%`, or `<1%` for a sliver that would round to nothing. */
  share: string;
};

export type SplitPlan = {
  parts: SplitPart[];
  /** Where one part meets the next, as a path of hairlines. Empty when there is one part or none. */
  cuts: string;
  /** Nothing to divide: no row holds a number above zero. */
  empty: boolean;
};

/**
 * The parts of a track, from each row's number and whether it is the hole.
 *
 * A HOLE IS NOT A PART, and neither is a row whose number is missing, zero or negative: a track
 * has one side, and a part of length zero or less is a claim the drawing cannot make. Those rows
 * keep their words in the legend and draw no segment.
 */
export function splitPlan(values: readonly number[], holes: readonly boolean[] = []): SplitPlan {
  const drawn = values.flatMap((v, i) => (!holes[i] && Number.isFinite(v) && v > 0 ? [{ i, v }] : []));
  const total = drawn.reduce((sum, d) => sum + d.v, 0);
  if (total <= 0) return { parts: [], cuts: '', empty: true };
  let x = 0;
  const parts = drawn.map(({ i, v }, k) => {
    const share = v / total;
    const part = {
      at: i,
      x: at(x * 1000),
      width: at(share * 1000),
      step: Math.min(k, SPLIT_STEPS - 1),
      share: share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`,
    };
    x += share;
    return part;
  });
  let edge = 0;
  const cuts = drawn
    .slice(0, -1)
    .map(({ v }) => {
      edge += v / total;
      return `M${at(edge * 1000)} 0V100`;
    })
    .join(' ');
  return { parts, cuts, empty: false };
}

/**
 * Whether a row stands in the legend. A PART AT NOUGHT IS LEFT OUT: it has no length on the track, so its dot and
 * `EGP 0` sat against the part before it and read as one more share of the whole. A row with no number yet, or a
 * credit, still has something to say and stays, and when every part is nought the legend prints them all, because
 * then it is all there is. The fold of numbers under the track keeps every row either way.
 */
export const splitListed = (plan: SplitPlan, value: number): boolean => plan.empty || value !== 0;

/**
 * WHAT A ROW SAYS WHERE ITS SHARE WOULD BE: its share, or for an amount of money below nought, that it is owed (the audit
 * of 25 October, Z18). "Stripe available −$9.61 USD" stood under three accounts with their shares and said nothing of
 * why it took none. Money below nought on an account is money owed on it. A count below nought says nothing: it is no
 * part, and nothing is owed on it. A figure is money when it carries a currency's sign or code.
 */
export function splitShare(plan: SplitPlan, i: number, value: number, figure: string): string | null {
  const part = plan.parts.find((p) => p.at === i);
  if (part) return part.share;
  return Number.isFinite(value) && value < 0 && /\p{Sc}|\b[A-Z]{3}\b/u.test(figure) ? SPLIT_OWED : null;
}

/** The track's accessible name: each part and its share, in order. */
export const splitSentence = (parts: readonly { label: string; share: string }[]): string =>
  parts.map((p) => `${p.label || SPLIT_PART} ${p.share}`).join(', ');

/** The eight category slots a part may name as its identity (SPEC 1.3): a project's, an agent's or a person's colour. */
export const SPLIT_SLOTS = ['blue', 'violet', 'pink', 'teal', 'sky', 'yellow', 'lime', 'slate'] as const;
export type SplitSlot = (typeof SPLIT_SLOTS)[number];

/**
 * A PART THAT IS A PROJECT, AN AGENT OR A PERSON WEARS ITS OWN COLOUR (proj F6): a row's fourth cell, when it names one
 * of the slots, is drawn as that slot's hue on the track and its dot. Any other part takes the chart's series in order.
 *
 * A STORED HUE SNAPS TO ITS SLOT (VERIFY H11): a list that keeps each project's hue as a whole number hands the number
 * on, and the part is drawn in the slot the project's card and well wear (`slotOf`), so Kiln is Kiln's blue here too.
 */
export const splitSlot = (cell: string | undefined): SplitSlot | undefined => {
  const word = (cell ?? '').trim().toLowerCase();
  if (/^-?\d+(?:\.\d+)?$/u.test(word)) {
    const slot = slotOf(Number(word));
    return slot === 'slate' ? undefined : slot;
  }
  return (SPLIT_SLOTS as readonly string[]).includes(word) ? (word as SplitSlot) : undefined;
};

/** The renderer's own words, as `cards.ts` keeps `CARDS_NONE`: it imports nothing from the app. */
export const SPLIT_ZERO = 'Every part is zero, so there is nothing to divide yet.';
export const SPLIT_PART = 'Part';
/** The heads of the fold's table after `SPLIT_PART`: each row's figure, then its share of the whole. */
export const SPLIT_AMOUNT = 'Amount';
export const SPLIT_SHARE = 'Share';
/** What the numbers under a split say for a part with no amount or no share: a word read aloud, never a dash (P12). */
export const SPLIT_NONE = 'none';
/** What a part of money below nought says where its share would be. */
export const SPLIT_OWED = 'owed';
