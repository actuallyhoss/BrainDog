/**
 * What `split` decides, as functions both drawers call.
 *
 * A split is one track cut into parts, one per row, with a legend of dots and figures under it. The
 * geometry lives here, as `cards.ts` keeps the trend's, so both renderers draw the same cuts and a
 * test can check them without a DOM.
 */

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

/** The track's accessible name: each part and its share, in order. */
export const splitSentence = (parts: readonly { label: string; share: string }[]): string =>
  parts.map((p) => `${p.label || SPLIT_PART} ${p.share}`).join(', ');

/** The renderer's own words, as `cards.ts` keeps `CARDS_NONE`: it imports nothing from the app. */
export const SPLIT_ZERO = 'Every part is zero, so there is nothing to divide yet.';
export const SPLIT_PART = 'Part';
/** The heads of the fold's table after `SPLIT_PART`: each row's figure, then its share of the whole. */
export const SPLIT_AMOUNT = 'Amount';
export const SPLIT_SHARE = 'Share';
