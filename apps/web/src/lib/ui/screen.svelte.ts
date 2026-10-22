/**
 * What the screen on this route has settled into, and nothing else.
 *
 * WHY THERE IS A FILE FOR THIS AT ALL. Every screen in this app computes its content synchronously,
 * so the moment `#main` has one child it has all of them, and four browser gates were built on
 * exactly that: `waitForSelector('#main *', { timeout: 5000 }).catch(() => {})`, copy-pasted at six
 * sites. The day a screen fetches, that selector is satisfied by a page heading and means nothing,
 * and the `catch` means even its total failure is not a finding. `layout` would then measure the rail
 * and the tab bar over 627 page-runs and print `0 finding(s)`; `keys` compares
 * `document.body.innerHTML.length` before a keystroke against after, so a response landing between
 * those two lines counts a dead key as alive. A gate cannot ask a question the app does not answer,
 * and this is the app answering it.
 *
 * THREE VALUES AND ONE MEANINGFUL ABSENCE. `ready` is a call that came back with something drawn from
 * it, `empty` is a designed empty state, `refused` is a refusal. Nothing at all means the screen has
 * not settled, and that is the only "still loading" there is.
 *
 * ABSENCE IS THE PENDING STATE ON PURPOSE, and it is the whole reason this cannot be satisfied
 * vacuously. A gate asserts on PRESENCE, so a shell that mounted and drew its chrome carries no
 * attribute and is not measurable, which is the exact case all four gates used to misread as ready.
 * A fourth value spelt `pending` would be a thing to wait for, and waiting for it is what the old
 * selector already did badly.
 *
 * IT IS NOT A TEST HOOK, AND THE TREE REFUSES THOSE IN THREE PLACES. `vite.config.ts` says a
 * `window.__seed` hook "would be a dev door shipping to production", and `flags.ts` and the theme
 * script say the same thing. `data-screen` is not a door: it is one attribute on the element the
 * skip link already points at, it holds no data, it changes no behaviour, and a screen reader never
 * meets it. What it does is let anything outside the page, a gate or a screenshot script or a person
 * in devtools, tell a drawn screen from a shell that has fetched nothing.
 *
 * RUNES AND NOT A STORE, for the same reason `palette` next door is a rune: this is the state the
 * shell would otherwise hold locally, with one more reader, and a store would put it somewhere
 * nothing can typecheck.
 */

/** The three settled values. There is no fourth, and pending is the absence of all of them. */
export type Settled = 'ready' | 'empty' | 'refused';

/**
 * `calls` counts, `pending` is what is still out.
 *
 * BOTH, BECAUSE ONE OF THEM CANNOT TELL THE TWO SILENCES APART. `pending === 0` is true before the
 * first call has started as well as after the last one has come back, and the first of those is a
 * shell with nothing on it: attaching the attribute there is precisely the failure this exists to
 * stop. So a call is evidence of a settled screen only once it has come back, and a screen with a
 * call still out is not settled whatever else it has said.
 */
import { untrack } from 'svelte';

const s = $state({ pending: 0, calls: 0, refused: false, ready: false, empties: 0, refusals: 0 });

/**
 * Which screen a call belongs to: `leaving()` moves it on, and `opened()` hands it to the caller.
 *
 * A CALL CAN CROSS A NAVIGATION, AND THE COUNT MUST NOT. `leaving()` zeroes `pending` for the next
 * screen, so an answer for the previous one landing afterwards would take the next screen's count
 * below zero, and `pending > 0` would then be false while that screen's own call was still out: the
 * attribute would appear over a page that had drawn nothing. A call closes against the screen it
 * opened on, and an answer for a screen that has gone counts for nothing.
 *
 * NOT `$state`. Nothing draws from it; it is compared, and only here.
 */
let epoch = 0;

/** A call started. What it returns is handed back to `closed`. */
export function opened(): number {
  s.pending++;
  s.calls++;
  return epoch;
}

/** A call answered. A refusal is a value in this codebase, so this is where one is recorded. */
export function closed(ok: boolean, at: number): void {
  if (at !== epoch) return;
  s.pending--;
  if (!ok) s.refused = true;
}

/**
 * A route saying it drew, and an `Empty` saying what it is.
 *
 * THE EMPTY AND THE REFUSAL ARE COUNTED, NOT LATCHED, and the first version latched them. It ranked
 * the three values and kept the strongest, so an `Empty` that mounted for one frame while the first
 * page of rows was still being assembled set `empty` for the life of the screen, and nothing could
 * take it back. Measured on `/r/obligations`: thirty-nine rows in the DOM, zero elements with the
 * empty class, and `data-screen="empty"`. A gate reading that would have measured a full list and
 * been told it was blank.
 *
 * A COUNT RETRACTS ITSELF, which is the whole reason it is a count. `Empty` increments on mount and
 * decrements on destroy, so the answer is about what is on the screen NOW rather than about what
 * has ever been on it, and the order the effects run in stops mattering: `refused` wins over
 * `empty` and `empty` over `ready` because of what is present, not because of who spoke last.
 */
export function drew(what: Settled): void {
  if (what === 'ready') s.ready = true;
  else if (what === 'empty') s.empties++;
  else s.refusals++;
}

/** The other half of `drew`, for a component that is going away. `ready` is not retractable: a
    route that drew once has drawn, and it is the claim the counts are measured against. */
export function undrew(what: Settled): void {
  if (what === 'empty') s.empties = Math.max(0, s.empties - 1);
  else if (what === 'refused') s.refusals = Math.max(0, s.refusals - 1);
}

/**
 * Cleared on every navigation, so the previous screen's answer is never this screen's.
 *
 * Without it the attribute is stale for exactly as long as the new screen takes to arrive, which is
 * the window every one of these gates measures in.
 */
export function leaving(): void {
  epoch++;
  s.pending = 0;
  s.calls = 0;
  s.refused = false;
  s.ready = false;
  s.empties = 0;
  s.refusals = 0;
}

/**
 * The value for `data-screen`, or `undefined` while the screen has not settled.
 *
 * `undefined` AND NOT `''`, because Svelte omits an attribute whose value is `undefined` and renders
 * an empty one for `''`. The gates match `main#main[data-screen]`, which an empty attribute
 * satisfies, so the difference between the two is the difference between a contract and a page that
 * always looks ready.
 *
 * A refusal wins over whatever was drawn: a screen that got one call back and had another refused is
 * showing an error, and the gate that measures it is not measuring the screen.
 */
export function settled(): Settled | undefined {
  if (s.pending > 0) return undefined;
  if (s.refused) return 'refused';
  /**
   * A SCREEN THAT SAID WHAT IT DREW IS SETTLED, WHETHER OR NOT IT CALLED ANYTHING.
   *
   * THE FIRST VERSION REQUIRED A CALL, and every screen in this app computes its content
   * synchronously today, so nothing would ever have settled and the attribute would never have
   * appeared: the contract would have been written and dead, which is the shape this repository
   * exists to catch. `data/call.ts` makes the same argument about itself in the file next door, and
   * `flags.ts` quotes it: a seam with no caller is not written.
   *
   * IT IS STILL NOT VACUOUS, and the property that matters is untouched. Chrome carries no
   * attribute: mounting the shell settles nothing, because the value comes from a route SAYING what
   * it drew or from a call coming back, and a rail and a tab bar do neither. What has changed is
   * that a synchronous screen can make the claim honestly, which it can, because it is true of that
   * screen right now. The day it fetches, `opened()` puts `pending` above zero and the first line
   * above takes the attribute away until the answer lands: the claim stops being available exactly
   * when it stops being true, without the route being edited again.
   */
  if (s.refusals > 0) return 'refused';
  if (s.empties > 0) return 'empty';
  if (s.ready) return 'ready';
  return s.calls > 0 ? 'ready' : undefined;
}

/**
 * THE QUIET MARK, a second and separate answer from `data-screen`: nothing the screen asked is still out.
 *
 * `data-screen` says a screen is drawn, and a screen drawn from the tab's kept copy says so before the reads behind it
 * have landed. That is the speed, and it is kept. What it cannot say is that the page is at rest, and a gate that
 * navigates away while those reads are in flight is told by WebKit that each was refused. So this is the other half:
 * the client's calls out (`onCallsOut`) and any later read a screen has promised (`holdQuiet`) are both nothing.
 * Nothing waits on it in the app; the gates read it, after the drawn mark, with a short cap.
 */
const q = $state({ out: 0, held: 0 });

/** The client's count of calls out, kept here for the layout to show. */
export function callsOut(out: number): void {
  q.out = out;
}

/** A read this screen means to start later (behind a timer or a chunk): quiet is not told until the returned function runs. */
export function holdQuiet(): () => void {
  let open = true;
  /* UNTRACKED, or an effect that holds reads the count it writes and runs again for ever. */
  untrack(() => q.held++);
  return () => {
    if (!open) return;
    open = false;
    untrack(() => q.held--);
  };
}

/** Whether nothing is out and nothing is promised. */
export function quiet(): boolean {
  return q.out === 0 && q.held === 0;
}
