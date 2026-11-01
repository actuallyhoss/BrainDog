/**
 * The toast stack, and the undo that is the reason it exists.
 *
 * A DESTRUCTIVE ACTION IN THIS PRODUCT IS NOT CONFIRMED, IT IS UNDONE. A confirmation dialog asks a
 * question before anything has happened, when the person has the least information they will ever
 * have about it, and the answer is always yes — which is why they stop reading them. An undo says
 * what happened, in the past tense, with the row named, and gives back the one thing a dialog
 * cannot: the state before.
 *
 * THE WINDOW: five seconds for a toast that only reports, eight for one that offers
 * an action, long enough to read the sentence, look at the list, and change your mind. It pauses while the pointer is over the stack
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
 * `Sidebar.svelte` and `SlashDaily.svelte`, wrap nothing, and today none of them is inside a tracked
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
  /** Past tense, the thing named by its name in quotes, never an id: "Archived “Invoice 2026-041: brand system”." */
  text: string;
  /** Absent for a toast that only reports. Present, this is the whole point of the toast. */
  undo?: (() => void) | undefined;
  /**
   * Whether the toast draws its Undo button. `false` keeps the undo on `⌘Z` and draws only the sentence, for a change
   * that is on screen with its own way back (a row's "Put back"): one change offers one undo where it can be seen.
   */
  offer?: boolean | undefined;
  intent?: 'good' | 'warn' | 'bad' | undefined;
  /**
   * How long it stays, in milliseconds, when not the ten seconds every other toast gets. An optimistic write's receipt
   * offers its Undo for six (`UNDO_MS` in `lib/data/optimistic.ts`): the change is already on screen where the reader
   * is looking, so the line is a way back rather than news.
   */
  life?: number | undefined;
};

/** How long a toast that only reports stays, and one that offers its action. */
const LIFE = 5_000;
const LIFE_ACTION = 8_000;

/** Four, then the oldest goes. A stack that grows without bound covers the work it is reporting on. */
const CAP = 4;

/** How long a place a toast named is not said again as arrived (`named`). */
const NAMED_MS = 30_000;

/** A toast's window: its own, else eight seconds when it draws an action and five when it only reports. */
const lifeOf = (t: Toast | undefined): number => t?.life ?? (t?.undo && t.offer !== false ? LIFE_ACTION : LIFE);

class Toasts {
  items = $state<Toast[]>([]);
  /** Set while a pointer is over the stack or focus is inside it. */
  held = $state(false);

  #next = 1;
  #timers = new Map<number, ReturnType<typeof setTimeout>>();

  push(text: string, opts: { undo?: () => void; intent?: Toast['intent']; life?: number; offer?: boolean } = {}): number {
    return untrack(() => {
      const id = this.#next++;
      /* ONE ACTION, ONE TOAST (audit 31 Oct o, AO13): two adds in a row stacked "Added a payment and a person, Undo" over
         "Added a repeating item, Undo", covering the tile below at 390, and which Undo took back what was not clear. A
         toast that offers an Undo takes the place of the one before that offered one: the newest is what ⌘Z undoes. */
      const offers = (t: Pick<Toast, 'undo' | 'offer'>): boolean => t.undo !== undefined && t.offer !== false;
      if (offers({ undo: opts.undo, offer: opts.offer })) for (const was of this.items.filter(offers)) this.dismiss(was.id);
      const next = [...this.items, { id, text, undo: opts.undo, intent: opts.intent, life: opts.life, offer: opts.offer }];

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

  /**
   * PLACES A TOAST HAS ALREADY NAMED, by an address the place answers to, and when (AM4): "Turned on Money. Added a
   * payment" says Money came, so the rail's own "Money is on your bar now." would be a second toast for one press. Kept
   * half a minute, the time the rail takes to draw the place, and never read reactively.
   */
  #named = new Map<string, number>();

  /** Says that a toast this press pushes names the place at `href`, so the rail does not say it again. */
  named(href: string, now: number = Date.now()): void {
    this.#named.set(href, now);
  }

  /**
   * WHEN A PRESS LAST TURNED A MODULE ON (audit 1 Nov, AP17): Tell's "Turn on Money and add it" said "Agents is in your
   * sidebar now. Turned on Money. Added a payment", since Money brought the agents' place along and only Money's was
   * named. A module's own toast says it came, so every place that arrives in the next half minute came with it.
   */
  #hushed = Number.NEGATIVE_INFINITY;

  /** Says that a toast this press pushes names a module turned on, so the rail says no place that comes with it. */
  hush(now: number = Date.now()): void {
    this.#hushed = now;
  }

  /** Whether a toast named the place at `href` in the last half minute (`named`), or a module turned on did (`hush`). */
  wasNamed(href: string, now: number = Date.now()): boolean {
    if (now - this.#hushed <= NAMED_MS) return true;
    const at = this.#named.get(href);
    if (at === undefined) return false;
    if (now - at <= NAMED_MS) return true;
    this.#named.delete(href);
    return false;
  }

  #arm(id: number) {
    if (this.held) return;
    const t = this.#timers.get(id);
    if (t) clearTimeout(t);
    this.#timers.set(
      id,
      setTimeout(() => this.dismiss(id), untrack(() => lifeOf(this.items.find((x) => x.id === id)))),
    );
  }
}

export const toasts = new Toasts();
