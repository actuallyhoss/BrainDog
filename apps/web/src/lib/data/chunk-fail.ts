/**
 * A file of the app's own code that did not arrive, and what the page does about it.
 *
 * THE BROWSER KEEPS A FAILED MODULE FOR THE LIFE OF THE DOCUMENT (24 November). One chunk under `_app/immutable/`
 * answered 500 for a few minutes, Today's lazy chunk imports it, and its import failed with "Failed to fetch dynamically
 * imported module". A second import of the same file in that document fails the same way without asking the network,
 * so nothing short of a new document mends it. The worker asks for the file twice more before the page hears
 * (`service-worker.ts`); when the page hears anyway, it reloads, once, by itself, and draws nothing in between.
 *
 * ONCE IN 30 SECONDS, KEPT IN THE TAB (`sessionStorage`), so a file that stays broken is a page that says so rather than
 * a page that reloads for ever. A tab that cannot keep the mark does not reload by itself at all, for the same reason.
 *
 * FOUR WAYS IN, ONE RULE:
 *   - a lazy block's import (`vite:preloadError`, heard by the root layout): `preloadFailed`;
 *   - a navigation whose route's code did not arrive: the same event while a navigation is under way, and the reload
 *     lands on the address the person was going to, so an old tab after a deploy lands on the new build there;
 *   - a link's code asked for ahead of a press (a hover) is not a reason to reload under the pointer: the next press
 *     loads its page whole instead (`data-sveltekit-reload`);
 *   - a route that failed on its first load: the router's error path, `hooks.client.ts`'s `handleError` marks the
 *     error `chunk` and `+error.svelte` reloads onto it.
 */

/**
 * WHAT EACH ENGINE SAYS WHEN AN IMPORT OF A FILE FAILS: Chromium's "Failed to fetch dynamically imported module",
 * Firefox's "error loading dynamically imported module", WebKit's "Importing a module script failed." and, for a file
 * answered with the shell's HTML, "is not a valid JavaScript MIME type"; and Vite's own "Unable to preload CSS".
 */
const FAILED = /dynamically imported module|Importing a module script failed|Unable to preload CSS|not a valid JavaScript MIME type/iu;

/** Whether `error` is a file of the app's own code that did not arrive. */
export const isChunkFailure = (error: unknown): boolean =>
  FAILED.test(error instanceof Error ? error.message : typeof error === 'string' ? error : '');

/** Where the tab keeps when it last reloaded by itself, in milliseconds. */
export const RELOADED = 'braindog.chunk-reload';
/** The least time between two reloads the page makes by itself. */
export const AGAIN_AFTER_MS = 30_000;

/** A route's own code, the file a link's press imports. */
const ROUTE_CODE = /\/_app\/immutable\/nodes\//u;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Here = { readonly href: string; reload(): void; assign(url: string): void };
/** What the rule reads and moves, handed in so a test can hand in its own. */
export type Env = { store(): Store | null; here(): Here; now(): number; body(): { setAttribute(name: string, value: string): void } | null };

const sameDocument = (a: string, b: string): boolean => a.split('#')[0] === b.split('#')[0];

/** The rule over one document's life: `going` is set once it has decided to reload, and nothing undoes that. */
export function recovery(env: Env) {
  let going = false;

  /**
   * Reload once, by itself, onto `to` (a navigation's address) or the address it is at: `true` when it is reloading,
   * `false` when it reloaded by itself less than 30 seconds ago or cannot keep the mark that says so.
   */
  const reloadOnce = (to?: URL | string | null): boolean => {
    if (going) return true;
    try {
      const store = env.store();
      if (store === null) return false;
      const since = env.now() - Number(store.getItem(RELOADED));
      if (since >= 0 && since < AGAIN_AFTER_MS) return false;
      store.setItem(RELOADED, String(env.now()));
    } catch {
      return false;
    }
    going = true;
    const here = env.here();
    const at = to ? new URL(String(to), here.href).href : null;
    if (at === null || sameDocument(at, here.href)) here.reload();
    else here.assign(at);
    return true;
  };

  /**
   * `vite:preloadError`: `to` is the address of the navigation under way, or `null` when none is. Nothing is prevented,
   * so the import still fails where it was made, and the error page drawn in the moment before the reload draws nothing
   * (`reloading`).
   */
  const preloadFailed = (error: unknown, to: URL | null): void => {
    if (to !== null) return void reloadOnce(to);
    const said = error instanceof Error ? error.message : String(error ?? '');
    if (ROUTE_CODE.test(said)) return void env.body()?.setAttribute('data-sveltekit-reload', '');
    reloadOnce();
  };

  return { reloadOnce, preloadFailed, reloading: (): boolean => going };
}

const session = (): Store | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

const browser = recovery({
  store: session,
  here: () => location,
  now: () => Date.now(),
  body: () => (typeof document === 'undefined' ? null : document.body),
});

export const { reloadOnce, preloadFailed, reloading } = browser;

/**
 * The router's error, as `hooks.client.ts` hands it on: said in the console as SvelteKit's own handler said it, and
 * marked `chunk` when it is a file that did not arrive, which `+error.svelte` reads.
 */
export function handled(error: unknown, message: string): App.Error {
  console.error(error);
  return isChunkFailure(error) ? { message, chunk: true } : { message };
}
