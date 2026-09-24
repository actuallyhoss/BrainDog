/**
 * Which put backs on the register screen have already been pressed.
 *
 * ONE CHANGE IS OFFERED IN TWO PLACES. A bulk state move lands a chip on every row it moved, each with its own Put
 * back, and a toast with a Put back for all of them. Both are built from the same answered entry, and both used to
 * write whatever they were handed. So pressing a row's chip and then the toast wrote that row's inverse twice, the
 * second at the version the first had spent: the record answered conflict, the row lost the `Restored` it had just
 * earned, and the toast said somebody else had moved a row the reader had moved back themselves (`put-back.test.ts`).
 *
 * KEYED BY THE ANSWERED ENTRY ITSELF, not by its number and version. The screen is reused across lists, so `3@5` on
 * one list and `3@5` on the next are two different writes, while the entry object is the one thing both offers of the
 * same change hold. A `WeakSet` also lets a change nobody can press any more go with its toast.
 */

import type { Entry, Fields } from '../../../lib/record/schema.ts';

/** A change that landed: the row as it was, what was written over it, and the row the record answered with. */
export type Change = { before: Entry; patch: Fields; answered: Entry };

export type Spent = {
  /** The changes nobody has put back yet, each marked as pressed from this moment, so a second press writes nothing. */
  take(changes: readonly Change[]): Change[];
  /**
   * How the put back of `change` answered.
   *
   * A MISS THAT WAS NOT A CONFLICT IS STILL OWED. The row did not move, the chip gets its Put back again
   * (`backAnswered`), and that button must still write when it is pressed. A conflict stays spent: somebody else moved
   * the row, and the inverse would now write over them.
   */
  answered(change: Change, out: { ok: true } | { ok: false; why: string }): void;
};

export function spentPutBacks(): Spent {
  const pressed = new WeakSet<Entry>();
  return {
    take(changes) {
      const owed: Change[] = [];
      for (const c of changes) {
        if (pressed.has(c.answered)) continue;
        pressed.add(c.answered);
        owed.push(c);
      }
      return owed;
    },
    answered(change, out) {
      if (!out.ok && out.why !== 'conflict') pressed.delete(change.answered);
    },
  };
}
