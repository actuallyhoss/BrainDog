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
 * stop. So a screen is settled only once it has made a call AND has none outstanding.
 */
const s = $state({ pending: 0, calls: 0, refused: false, drew: null as Settled | null });

/** A call started. */
export function opened(): void {
  s.pending++;
  s.calls++;
}

/** A call answered. A refusal is a value in this codebase, so this is where one is recorded. */
export function closed(ok: boolean): void {
  s.pending--;
  if (!ok) s.refused = true;
}

/** A route, or an `Empty`, saying what it drew. */
export function drew(what: Settled): void {
  s.drew = what;
}

/**
 * Cleared on every navigation, so the previous screen's answer is never this screen's.
 *
 * Without it the attribute is stale for exactly as long as the new screen takes to arrive, which is
 * the window every one of these gates measures in.
 */
export function leaving(): void {
  s.pending = 0;
  s.calls = 0;
  s.refused = false;
  s.drew = null;
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
  if (s.pending > 0 || s.calls === 0) return undefined;
  if (s.refused) return 'refused';
  return s.drew ?? 'ready';
}
