/**
 * The changes this tab made that the record can still put back, newest last: what ⌘Z reaches once their toasts are gone.
 *
 * A TOAST'S UNDO LIVES SIX SECONDS AND FOUR DEEP, so ⌘Z a minute later said "Nothing to undo." although the record still
 * held every batch it logged and could put each back (`undoChange`, `record/undo-write.ts`). `optimist` pushes each write
 * that landed under a batch here with its receipt's sentence, and `undo-replay.ts` pops one a press.
 *
 * A BATCH, NOT A KEYSTROKE, is the unit (02 §8), and it is held once: a batch pushed again moves to the top. Sixty, then the
 * oldest goes. Only this tab's own writes are here, so ⌘Z never reaches another person's change.
 *
 * PURE AND TINY, with no import, because every screen that writes loads it.
 */

/** How many changes ⌘Z can reach back through. */
export const UNDO_DEPTH = 60;

/**
 * One change the record can put back: its batch, and the receipt it was said with. An answer still waiting out its six
 * seconds never reached the record, so it carries its own way back (`local`), the card's Undo, which ⌘Z runs (fluid F15).
 */
export type Held = { batch: string; said: string; local?: (() => void) | undefined };

export function undoStack(depth = UNDO_DEPTH) {
  const held: Held[] = [];
  const at = (batch: string) => held.findIndex((h) => h.batch === batch);
  return {
    /** Holds a change on top. One already held moves to the top; past `depth`, the oldest goes. */
    push(entry: Held): void {
      const i = at(entry.batch);
      if (i >= 0) held.splice(i, 1);
      held.push(entry);
      if (held.length > depth) held.splice(0, held.length - depth);
    },
    /** Lets go of a batch put back some other way (its toast's own Undo). True when it was held. */
    spend(batch: string): boolean {
      const i = at(batch);
      if (i < 0) return false;
      held.splice(i, 1);
      return true;
    },
    /** Takes the newest change off, or `null` when none is held. */
    pop(): Held | null {
      return held.pop() ?? null;
    },
    /** How many changes are held. */
    get size(): number {
      return held.length;
    },
  };
}

export type UndoStack = ReturnType<typeof undoStack>;

/** The tab's one stack: `optimistic.svelte.ts` fills it and `undo-replay.ts` empties it. */
export const history = undoStack();
