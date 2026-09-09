/**
 * The tick ledger: what a `todo` row is drawn as once somebody has pressed the box.
 *
 * The box beside a task on `/p/kiln` was `role="img"`, so the shortest way to tick one off was four
 * gestures and a screen change: a 16 x 16 select box on a different route, a bulk action bar that
 * shifted the table 63px, a menu and a value. The drawing promised a control and the product made
 * you leave the screen to use it. The box is the control now, and this file is the part of that
 * with an answer worth asserting.
 *
 * TWO RULES, and both come out of `loop/REWORK.md` section 1 rather than out of taste:
 *
 *   1. A CHANGED ROW DOES NOT LEAVE THE SCREEN. Of eighty-five human writes over thirteen days in
 *      the record this product is modelled on, thirteen reversed the write immediately before them
 *      and twelve of those landed inside five seconds. They had one cause: the row vanished, so the
 *      only way to check you had hit the right one was to do the opposite and look. Nothing here
 *      removes, reorders or filters a row. A ticked row is the same row, ticked.
 *   2. NOTHING IS WRITTEN YET, AND THE ROW SAYS SO. The ledger is this session's answer held beside
 *      the document's, never merged into it, so the component can draw the difference and the
 *      reader is never told about a save that did not happen.
 *
 * A `todo` row has no key in the dialect, so the ledger is held BY POSITION. That is why the
 * component drops it when the fence changes: a position is a fact about one document.
 *
 * No import, of anything. `packages/render` is MIT and embeddable, and depends on nothing.
 */

export type TickState = {
  /** What the box shows, which is the document's answer unless this session gave a different one. */
  done: boolean;
  /**
   * True while the box disagrees with the document.
   *
   * The one thing the mark must never be is a claim. There is no write path behind this yet, so an
   * unsaved tick wears `warn` and the words, in the same spirit as the receipt chip the register
   * list draws over a row it has just changed.
   */
  unsaved: boolean;
};

/**
 * The state one row is drawn in.
 *
 * `authored` is `Row.done`, which is `undefined` on a row the author wrote without a `[ ]` box at
 * all. Absent is not ticked, so it reads as false and the box draws empty.
 */
export function tickState(authored: boolean | undefined, pending: boolean | undefined): TickState {
  if (pending === undefined) return { done: authored === true, unsaved: false };
  return { done: pending, unsaved: true };
}

/**
 * The ledger after one press.
 *
 * TICKING A ROW BACK TO WHAT THE DOCUMENT ALREADY SAYS IS NOT A CHANGE, so the entry is dropped
 * rather than set. Without that, the way back out of a mistake leaves an "unsaved" mark standing
 * over a row that matches the document exactly, which is the product lying in the direction that
 * costs the most: it tells somebody there is work to save when there is none, and the next reader
 * has no way to tell that mark from a real one.
 *
 * A NEW MAP EVERY TIME, never a mutation. The caller holds this in `$state`, and a `Map` is not
 * proxied: mutating the one in hand changes nothing on screen.
 */
export function nextTicks(
  ticks: ReadonlyMap<number, boolean>,
  index: number,
  next: boolean,
  authored: boolean,
): Map<number, boolean> {
  const out = new Map(ticks);
  if (next === authored) out.delete(index);
  else out.set(index, next);
  return out;
}

/**
 * Where the roving tabindex goes next, or `null` when the key is not ours.
 *
 * ONE TAB STOP FOR THE WHOLE LIST, which is the rule `Table` states and the reason it exists: a
 * focusable control per row is one tab stop per row, and a person tabbing past a list of thirty
 * tasks should pass one thing, not thirty. Exactly one box carries `tabindex="0"` and the arrows
 * move it.
 *
 * IT CLAMPS AND DOES NOT WRAP, which is what the register grid does with the same keys, and the
 * clamp is deliberately not a `null`: the arrow is swallowed at the ends too, so the last press
 * before the end of a list does not suddenly scroll the page instead of moving the focus.
 *
 * `Home` AND `End` ARE THE LIST'S ENDS HERE, not a row's. In the register grid they are row ends
 * because a row there has eight columns to be at the end of. This list has one control per row, so
 * there is no second axis for them to mean anything on.
 *
 * No bare letter is bound. Every bare single-letter shortcut in this product lives inside a focused
 * composite widget, and an arrow is not a character shortcut, so a block drawn inside somebody
 * else's page cannot collide with the keymap it knows nothing about.
 */
export function moveTick(from: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  switch (key) {
    case 'ArrowDown':
      return Math.min(from + 1, last);
    case 'ArrowUp':
      return Math.max(from - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return last;
    default:
      return null;
  }
}
