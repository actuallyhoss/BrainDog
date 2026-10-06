/**
 * What `Panel.svelte` decides, in plain `.ts` so `node --test` can read it without mounting anything, and the three
 * things every overlay in `lib/ui` shares: how a bottom sheet is let go, when a scrim is over the window, and when an
 * exit is over.
 *
 * THE PANEL HAS TWO FORMS. From 900px up it is docked at the window's end edge, beside the content,
 * which narrows for it: a non-modal `<dialog>` opened with `show()`, so the list behind it keeps its keyboard and its
 * pointer. Below 900px it is a bottom sheet: the same `<dialog>`, opened with `showModal()`, over the scrim.
 *
 * A PANEL THAT IS OPEN WHEN THE WINDOW CROSSES 900PX CHANGES FORM WITHOUT CLOSING. `step` says what the element has to
 * do to match what was asked, and one of its answers is to reopen in the other form.
 */

/** Below this the panel is a bottom sheet. */
export const NARROW = '(width < 1280px)';

export type Form = 'docked' | 'sheet';

export const formOf = (narrow: boolean): Form => (narrow ? 'sheet' : 'docked');

export type Step = 'show' | 'showModal' | 'close' | 'reopen' | null;

/**
 * What the `<dialog>` must do so it is what was asked for.
 *
 * `is.modal` is whether the element is open modally now (`:modal`). A docked panel is open and not modal; a sheet is
 * open and modal. An element open in the wrong one of those is reopened rather than left, because a docked panel on a
 * phone covers the list with no scrim and a modal one on a desktop takes the list's keyboard away.
 */
export function step(want: { open: boolean; form: Form }, is: { open: boolean; modal: boolean }): Step {
  if (!want.open) return is.open ? 'close' : null;
  if (!is.open) return want.form === 'sheet' ? 'showModal' : 'show';
  return is.modal === (want.form === 'sheet') ? null : 'reopen';
}

/* ── letting a bottom sheet go ───────────────────────────────────────────── */

/** A sheet let go once it is drawn down past this share of its own height closes, however slowly it was drawn. */
export const LET_GO = 1 / 3;

/** And a flick closes it from anywhere: this fast downward, in pixels a millisecond, at the moment it is let go. */
export const FLICK = 0.5;

/** A flick has to have moved the sheet this far, so a tap that jitters on the way up is not a throw. */
export const FLICK_MIN = 8;

/** How far back a release looks to say how fast the sheet was moving. A pause longer than this is not a flick. */
export const FLICK_WINDOW = 100;

/** Whether a sheet `height` tall, drawn `pulled` below where it rests and moving at `speed`, closes when let go. */
export function letGo(pulled: number, height: number, speed: number): boolean {
  return pulled > height * LET_GO || (pulled >= FLICK_MIN && speed >= FLICK);
}

/**
 * ONE PULL OF A BOTTOM SHEET, from the press to the release, in numbers and nothing else.
 *
 * The sheet moves with the finger (`move` says how far), and letting go closes it past a third of its height or on a
 * flick (`drop`), or sends it back. Never above where it rests: a sheet is as tall as what it holds, and drawing it
 * up would show the screen underneath its bottom edge.
 *
 * THE SPEED IS THE LAST STRETCH OF THE PULL, not the whole of it. A slow drag that ends in a throw is a throw, and a
 * fast drag that stops and is then let go is somebody deciding to keep the sheet.
 */
export class Pull {
  #from: number | null = null;
  #trail: { y: number; t: number }[] = [];

  /** Whether a pull is under way. */
  get held(): boolean {
    return this.#from !== null;
  }

  grab(y: number, t: number): void {
    this.#from = y;
    this.#trail = [{ y, t }];
  }

  /** How far below where it rests the sheet is drawn now. */
  move(y: number, t: number): number {
    if (this.#from === null) return 0;
    this.#trail = [...this.#trail.filter((s) => t - s.t <= FLICK_WINDOW), { y, t }];
    return Math.max(0, y - this.#from);
  }

  /** Whether letting go here closes a sheet `height` tall. A cancelled pointer is let go with no speed at all. */
  drop(y: number, t: number, height: number, cancelled = false): boolean {
    if (this.#from === null) return false;
    const pulled = Math.max(0, y - this.#from);
    const trail = [...this.#trail.filter((s) => t - s.t <= FLICK_WINDOW), { y, t }];
    const first = trail[0];
    const spent = first ? t - first.t : 0;
    const speed = cancelled || !first || spent <= 0 ? 0 : (y - first.y) / spent;
    this.#from = null;
    this.#trail = [];
    return letGo(pulled, height, speed);
  }
}

/* ── an opening that never starts ────────────────────────────────────────── */

/** How long an opening may wait for its first frame before it is finished where it stands. */
export const STALL = 120;

type Opening = {
  getAnimations?: () => ReadonlyArray<{ ready: Promise<unknown>; playState: string; finish: () => void }>;
};

/**
 * FINISHES AN OPENING THAT HAS NOT BEGUN, so a stalled first frame shows the panel where it belongs and not out of
 * sight.
 *
 * Measured on `Sheet.svelte`: `getAnimations()` on the dialog reported `playState: running` with an unresolved start
 * time for up to 900ms after `showModal()`, because an animation is pending until its first rendered frame and a dialog
 * entering the top layer with forty rows in it can wait a while for one. An opening held at its start for that long is
 * a panel past the edge of the window where somebody asked for one. A slide that has not started after `STALL` is
 * ended instead, so the worst case is a panel that appears without moving.
 *
 * `getAnimations()` works out the style first, so the opening the caller has just started is in the list. Nothing in
 * it (reduced motion, a gate that turns transitions off) is nothing to do.
 */
export function unstall(el: Opening, ms = STALL): void {
  const moving = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
  for (const a of moving) {
    let started = false;
    void a.ready.then(
      () => (started = true),
      () => (started = true),
    );
    setTimeout(() => {
      if (!started && a.playState !== 'finished') a.finish();
    }, ms);
  }
}

/* ── a scrim over the window ─────────────────────────────────────────────── */

/**
 * WHETHER ANYTHING HAS LAID A SCRIM OVER THE WHOLE WINDOW, which is when the toast stack holds.
 *
 * A toast is `position: fixed` at `--z-toast`, and a sheet is a modal `<dialog>` or a popover in the top layer, which
 * no `z-index` reaches: a receipt pushed while a phone sheet was up drew under its scrim, dimmed, at the very edge
 * the sheet stands on, with an Undo that could not be pressed and a countdown running out behind it. So a sheet, a
 * panel in its sheet form and a menu's action sheet each lay one here while they are on screen, and the stack holds
 * its toasts, countdown and all, until the last of them has gone.
 *
 * A COUNT AND NOT A FLAG, so two layered sheets closing in either order lift the scrim once, at the end. Each laying
 * is lifted by the function it returns, and only once however often that is called: a close and a destroy can both
 * reach it.
 */
export class Scrims {
  #laid = 0;
  #told = new Set<(up: boolean) => void>();

  /** Whether a scrim is over the window now. */
  get up(): boolean {
    return this.#laid > 0;
  }

  /** Lays one; the function it returns lifts it. */
  lay(): () => void {
    if (this.#laid++ === 0) this.#tell();
    let lifted = false;
    return () => {
      if (lifted) return;
      lifted = true;
      if (--this.#laid === 0) this.#tell();
    };
  }

  /** Says whether a scrim is up now, and again each time that changes. Returns a function that stops it. */
  watch(told: (up: boolean) => void): () => void {
    this.#told.add(told);
    told(this.up);
    return () => void this.#told.delete(told);
  }

  #tell(): void {
    for (const told of [...this.#told]) told(this.up);
  }
}

export const scrims = new Scrims();

/* ── an exit, to its end ─────────────────────────────────────────────────── */

/** The longest an exit is waited for. Every exit in `lib/ui` is shorter; this is for one that never reports. */
export const EXIT_MOST = 600;

type Moving = { getAnimations?: () => ReadonlyArray<{ finished: Promise<unknown> }> };

/**
 * Calls `done` once everything moving on `el` has stopped, which is how a menu or a toast stays on the page for its
 * exit and no longer. Returns a function that calls it off, for an exit that is taken back by opening again.
 *
 * AT ONCE WHEN NOTHING MOVES, and that is most of the ways an exit can go: reduced motion's 1ms, a gate that turns
 * every transition off, a browser that never started one. A wait for a `transitionend` that is never coming is an
 * element left on the page for good.
 *
 * `getAnimations()` WORKS OUT THE STYLE FIRST, so the exit the caller has just asked for with an attribute is already
 * in the list it returns. A cancelled exit counts as over, and so does one that has not reported after `most`.
 */
export function settled(el: Moving, done: () => void, most = EXIT_MOST): () => void {
  let live = true;
  const end = () => {
    if (!live) return;
    live = false;
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(end, most);
  const moving = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
  if (moving.length === 0) end();
  else void Promise.allSettled(moving.map((a) => a.finished)).then(end);
  return () => {
    live = false;
    clearTimeout(timer);
  };
}
