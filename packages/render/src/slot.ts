/**
 * The eight category slots (the UI pass of 20 October, 1.3): a project, a person, an agent with no maker's colour, a
 * chart series that is one of those. Each is two tokens, `--cat-<slot>` (the strong colour: a glyph, a letter, a dot)
 * and `--cat-<slot>-tint` (the soft fill: a well, a disc), solved to clear 4.5:1 on the tile and on each other in light
 * and in dark. No slot is red or orange, so nothing in a category reads as late or as the accent.
 *
 * HERE, IN THE RENDERER, SO A CHART CAN SNAP A ROW'S STORED HUE TO ITS SLOT (VERIFY H11): the app's `face.ts` hands the
 * same table on to its wells, cards and dots.
 */
export type Slot = 'blue' | 'violet' | 'pink' | 'teal' | 'sky' | 'yellow' | 'lime' | 'slate';

/**
 * Where each slot sits on the OKLCH wheel, measured from its light colour. `slate` is not on it: it is the neutral, the
 * slot of a thing with no hue at all (a retired project, "other" in a chart).
 */
export const SLOT_HUES: Readonly<Record<Exclude<Slot, 'slate'>, number>> = {
  blue: 265,
  violet: 287,
  pink: 352,
  teal: 185,
  sky: 233,
  yellow: 90,
  lime: 133,
};

/**
 * A stored hue as its slot: the slot nearest round the wheel, ties to the earlier slot in `SLOT_HUES`. The continuous
 * `oklch(--mark-l --mark-c hue)` a project used to wear is gone from cards, wells and dots; its hue only picks the slot.
 * No hue is `slate`.
 */
export function slotOf(hue: number | null | undefined): Slot {
  if (hue === null || hue === undefined || !Number.isFinite(hue)) return 'slate';
  const h = ((hue % 360) + 360) % 360;
  let best: Slot = 'blue';
  let far = Infinity;
  for (const [slot, at] of Object.entries(SLOT_HUES) as [Exclude<Slot, 'slate'>, number][]) {
    const d = Math.abs(h - at);
    const round = Math.min(d, 360 - d);
    if (round < far) {
      far = round;
      best = slot;
    }
  }
  return best;
}
