/**
 * The toast stack, and the undo that is the reason it exists.
 *
 * A DESTRUCTIVE ACTION IN THIS PRODUCT IS NOT CONFIRMED, IT IS UNDONE. A confirmation dialog asks a
 * question before anything has happened, when the person has the least information they will ever
 * have about it, and the answer is always yes — which is why they stop reading them. An undo says
 * what happened, in the past tense, with the row named, and gives back the one thing a dialog
 * cannot: the state before.
 *
 * The window is generous on purpose. Two seconds is a reflex test; ten is long enough to read the
 * sentence, look at the list, and change your mind. It pauses while the pointer is over the stack
 * or focus is inside it, because a countdown that expires while you are reaching for the button is
 * a countdown that was never really offered.
 *
 * Announced through ONE polite live region, never one per toast: `role="alert"` for "row archived"
 * interrupts whatever a screen-reader user was reading, to tell them about a thing they did.
 */

export type Toast = {
  id: number;
  /** Past tense, the row named. "Archived obligations#4", never "Row archived successfully". */
  text: string;
  /** Absent for a toast that only reports. Present, this is the whole point of the toast. */
  undo?: (() => void) | undefined;
  intent?: 'good' | 'warn' | 'bad' | undefined;
};

const LIFE = 10_000;

/** Four, then the oldest goes. A stack that grows without bound covers the work it is reporting on. */
const CAP = 4;

class Toasts {
  items = $state<Toast[]>([]);
  /** Set while a pointer is over the stack or focus is inside it. */
  held = $state(false);

  #next = 1;
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  push(text: string, opts: { undo?: () => void; intent?: Toast['intent'] } = {}): number {
    const id = this.#next++;
    this.items = [...this.items, { id, text, undo: opts.undo, intent: opts.intent }].slice(-CAP);
    this.#arm(id);
    return id;
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
    const t = this.#timers.get(id);
    if (t) clearTimeout(t);
    this.#timers.delete(id);
  }

  /**
   * `⌘Z`: run the NEWEST offer that has one.
   *
   * Newest and not oldest, because undo is a stack and the thing you meant is the thing you just
   * did. It skips toasts that only report — pressing undo after "copied" should reach past it to
   * the archive you are actually thinking of, not do nothing and leave you pressing it again.
   */
  undoLast(): boolean {
    const held = [...this.items].reverse().find((t) => t.undo);
    if (!held) return false;
    this.run(held.id);
    return true;
  }

  /** Runs the undo and takes the toast with it: the offer was single-use and is now spent. */
  run(id: number) {
    this.items.find((t) => t.id === id)?.undo?.();
    this.dismiss(id);
  }

  hold() {
    this.held = true;
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
  }

  release() {
    this.held = false;
    for (const t of this.items) this.#arm(t.id);
  }

  #arm(id: number) {
    if (this.held) return;
    const t = this.#timers.get(id);
    if (t) clearTimeout(t);
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), LIFE),
    );
  }
}

export const toasts = new Toasts();
