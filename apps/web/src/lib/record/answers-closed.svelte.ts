/**
 * The questions not to draw (`answers-out.ts`), as a screen reads them: reactive, so a press, an Undo, a refusal or another
 * tab's answer draws the screen again.
 */

import { closedIds, onOut } from './answers-out.ts';

let moved = $state(0);
onOut(() => (moved += 1));

/** The questions not to draw on `base`. `kept`: what is being drawn is a copy, not the record's own read. */
export function closedNow(base: string, kept: boolean): ReadonlySet<string> {
  void moved;
  return closedIds(base, kept);
}
