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
 *
 * SAYING SOMETHING IS NOT A DEPENDENCY, WHICH IS WHY EVERY METHOD HERE THAT READS THE STACK IS
 * `untrack`ED INSIDE.
 * `push` reads `items` to apply the cap before it writes them and `#arm` reads `held`, so an effect
 * that pushed a toast took a dependency on the stack it had just written to and Svelte scheduled that
 * effect again for its own toast. Measured against Svelte 5.57 in `toast.test.ts`: an effect whose
 * body was one `toasts.push` ran 13 times with that file's bound holding it there, and without the
 * bound it ran until `effect_update_depth_exceeded`. `Empty.svelte:98` is the same shape one file
 * over, and it reached that error on four of the five states that component draws.
 *
 * IT MOVED IN HERE BECAUSE THE CALLERS WERE CARRYING IT AND ONE OF ELEVEN ACTUALLY DID.
 * `+layout.svelte:165` writes `untrack(() => toasts.push(...))` and `accent.test.ts:214` asserts that
 * it does. The other ten sites that push, in `clipboard.ts`, `Palette.svelte`, `ClearExamples.svelte`,
 * `Sidebar.svelte` and `SparkDaily.svelte`, wrap nothing, and today none of them is inside a tracked
 * effect. The shell is not the last caller this stack will have: a rule a caller has to remember at
 * eleven sites is a rule the twelfth site breaks, and the twelfth site is the one inside an effect. A
 * wrapper still at a call site is now belt over braces and costs nothing.
 *
 * WHAT IS UNTRACKED IS THE READING AND NOT THE WRITING, and that distinction is the whole repair.
 * `untrack` suppresses the dependency a read would register; the write still notifies everything that
 * reads `items` elsewhere, which is how `Toasts.svelte` re-renders at all. `toast.test.ts` measures
 * both halves, because a repair that quietly stopped the notification would ship a stack that never
 * appears on screen and would satisfy every other test in that file.
 */

import { untrack } from 'svelte';

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
    return untrack(() => {
      const id = this.#next++;
      const next = [...this.items, { id, text, undo: opts.undo, intent: opts.intent }];

      /* THE OLDEST GOES THROUGH `dismiss` RATHER THAN JUST OFF THE END OF THE ARRAY, so that its
         countdown goes with it. A timer left armed on a toast nobody can see expires up to ten seconds
         later and writes to `items` anyway, which is every toast then on screen re-rendering on behalf
         of one that has not existed since. */
      const over = next.length - CAP;
      if (over > 0) for (const gone of next.slice(0, over)) this.dismiss(gone.id);

      this.items = next.slice(-CAP);
      this.#arm(id);
      return id;
    });
  }

  dismiss(id: number) {
    untrack(() => {
      this.items = this.items.filter((t) => t.id !== id);
      const t = this.#timers.get(id);
      if (t) clearTimeout(t);
      this.#timers.delete(id);
    });
  }

  /**
   * `⌘Z`: run the NEWEST offer that has one.
   *
   * Newest and not oldest, because undo is a stack and the thing you meant is the thing you just
   * did. It skips toasts that only report — pressing undo after "copied" should reach past it to
   * the archive you are actually thinking of, not do nothing and leave you pressing it again.
   */
  undoLast(): boolean {
    return untrack(() => {
      const held = [...this.items].reverse().find((t) => t.undo);
      if (!held) return false;
      this.run(held.id);
      return true;
    });
  }

  /**
   * Runs the undo and takes the toast with it: the offer was single-use and is now spent.
   *
   * SPENT EVEN WHEN IT THROWS, which is the whole of the `finally`. An undo that failed part of the
   * way through and left its own offer standing invites a second press over a half applied undo, on
   * the one control in this product whose failure loses a row.
   *
   * THE THROW ITSELF IS NOT SWALLOWED. An error caught here would make an undo that did not work
   * look exactly like one that did: the toast goes, the row does not come back, and nothing is
   * reported anywhere. Propagating leaves it to the browser's own error reporting, which is a worse
   * account than a designed one and a far better account than silence.
   *
   * AND THE CALLBACK RUNS INSIDE THE `untrack` TOO, DELIBERATELY. An undo is a command in exactly the
   * same sense as the push that offered it, so whatever it reads on its way to putting the row back is
   * not something the caller asked to depend on. The throw is unaffected: `untrack` returns the value
   * or lets the error out, and the `finally` below still spends the offer either way.
   */
  run(id: number) {
    untrack(() => {
      try {
        this.items.find((t) => t.id === id)?.undo?.();
      } finally {
        this.dismiss(id);
      }
    });
  }

  /** The only method here that is not wrapped: it reads no reactive state at all, and a write on its
      own does not schedule the effect that made it. Measured in `toast.test.ts`: an effect whose body
      is one `hold()` runs once, wrapper or no wrapper. What `held` wakes is `Toasts.svelte`. */
  hold() {
    this.held = true;
    for (const t of this.#timers.values()) clearTimeout(t);
    this.#timers.clear();
  }

  release() {
    untrack(() => {
      this.held = false;
      for (const t of this.items) this.#arm(t.id);
    });
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
