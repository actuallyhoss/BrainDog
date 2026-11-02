/**
 * The lists the reader holds on the record, as its `boot` named them (`me.levels`), for a walk or a list's declaration to
 * be asked only where the record would answer it (collab pass 4).
 *
 * A REF IS NAMED BY WALKING ITS TARGET LIST, AND A READER HELD TO ONE PROJECT DOES NOT READ EVERY TARGET. Sam, a
 * contractor on Kiln website, opened Kiln's page and Tasks, and each asked `list people`, `list tracks` and
 * `schema tracks`, three 403s a screen for names he was never going to be shown. `boot` already says which lists he
 * holds, so the walker (`ref-rows.ts`) and `learn` (`remote.ts`) ask this first.
 *
 * NOTHING HELD IS NOT NOTHING READ. Before any `boot` has answered, after a refusal, and from a host older than
 * `me.levels`, every list is asked as before; only a list a live `boot` left out is not. A walk asked while `boot` is
 * still out waits for it (`heldNow`), since the early asks of a page opened by its address go out beside `boot`.
 *
 * PLAIN NODE, no imports, so the walker loads nothing more for it.
 */

type Held = { base: string; reads: ReadonlySet<string>; holds: ReadonlySet<string> };

let held: Held | null = null;
let pending: { base: string; at: Promise<void>; done: () => void } | null = null;

/** A `boot` for `base` has been asked: a walk on it asked from now waits for its answer. */
export function expectLists(base: string): void {
  if (pending?.base === base) return;
  pending?.done();
  let done = () => {};
  const at = new Promise<void>((resolve) => (done = resolve));
  pending = { base, at, done };
}

/** What a `boot` for `base` said the reader holds, by list, or `null` where it said nothing (a refusal, an older host). */
export function holdLists(base: string, levels: Readonly<Record<string, string>> | null): void {
  held =
    levels === null
      ? null
      : { base, holds: new Set(Object.keys(levels)), reads: new Set(Object.entries(levels).flatMap(([list, level]) => (level === 'append' ? [] : [list]))) };
  if (pending?.base === base) {
    pending.done();
    pending = null;
  }
}

/** Drop what was held, on a record switch and a sign-out. */
export function forgetLists(): void {
  held = null;
  pending?.done();
  pending = null;
}

/** Whether the reader reads `list` on the record at `base` (any record when none is named), as far as `boot` said. */
export function readsList(list: string, base?: string): boolean {
  return held === null || (base !== undefined && held.base !== base) || held.reads.has(list);
}

/** Whether the reader holds any level on `list`, which a list's declaration is asked for. */
export function holdsList(list: string, base?: string): boolean {
  return held === null || (base !== undefined && held.base !== base) || held.holds.has(list);
}

/** Whether what is held is as true as it will be now: a `boot` was heard, or none is out. */
export const listsSettled = (): boolean => held !== null || pending === null;

/** Once any `boot` out for `base` has answered: what is held is then as true as it will be. */
export async function heldNow(base?: string): Promise<void> {
  /* A `boot` ALREADY HEARD stands until the next lands: a walk on a screen after the first waits for nothing. */
  if (held !== null && (base === undefined || held.base === base)) return;
  const wait = pending;
  if (wait !== null && (base === undefined || wait.base === base)) await Promise.race([wait.at, new Promise((done) => setTimeout(done, 4000))]);
}
