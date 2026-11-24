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
 *
 * AND A START THAT FAILED (`src/error.html`, which SvelteKit draws over the page when even the root layout cannot be
 * drawn) TRIES AGAIN BY ITSELF: three reloads 1.5 seconds apart, counted in the tab and cleared by the next start that
 * draws the root layout (`started`), with "Loading BrainDog…" on screen meanwhile, and only then the failure. It is
 * done from here because nothing in that page can run: SvelteKit parses it and moves its head and body into the
 * document, which runs no script, and the policy would refuse an inline one anyway.
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

/** Where the tab counts the reloads a failed start has made by itself. */
export const START_TRIES = 'braindog.start-tries';
/** How many times a failed start reloads by itself before it says so, and how long it waits before each. */
export const START_AGAIN = 3;
export const START_AGAIN_MS = 1500;

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Here = { readonly href: string; reload(): void; assign(url: string): void };
/** `error.html`'s box (`#start`), as far as the rule touches it. */
type StartBox = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelector(selector: 'button'): { addEventListener(type: 'click', fn: (e: { preventDefault(): void }) => void): void } | null;
};
/** What the rule reads and moves, handed in so a test can hand in its own. */
export type Env = {
  store(): Store | null;
  here(): Here;
  now(): number;
  body(): { setAttribute(name: string, value: string): void } | null;
  start(): StartBox | null;
  later(fn: () => void, ms: number): void;
};

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

  /**
   * `error.html` is on screen: `again` when it reloads by itself in 1.5 seconds, `failed` when it has done so three
   * times (or the tab cannot count them) and says so, `none` when there is no such page or it has already been
   * decided. Its Try again reloads the address it is at; without this, the button's form asks for the address again
   * without its query.
   */
  const startFailed = (): 'again' | 'failed' | 'none' => {
    const box = env.start();
    if (box === null || box.getAttribute('data-state') !== null) return 'none';
    let tries = START_AGAIN;
    try {
      const store = env.store();
      if (store !== null) {
        tries = Number(store.getItem(START_TRIES)) || 0;
        if (tries < START_AGAIN) store.setItem(START_TRIES, String(tries + 1));
      }
    } catch {
      tries = START_AGAIN;
    }
    box.querySelector('button')?.addEventListener('click', (e) => {
      e.preventDefault();
      env.here().reload();
    });
    if (tries >= START_AGAIN) {
      box.setAttribute('data-state', 'failed');
      return 'failed';
    }
    box.setAttribute('data-state', 'again');
    env.later(() => env.here().reload(), START_AGAIN_MS);
    return 'again';
  };

  /** The root layout is drawn: the next start that fails tries three times again. */
  const started = (): void => {
    try {
      env.store()?.removeItem(START_TRIES);
    } catch {
      /* Nothing kept, nothing to clear. */
    }
  };

  return { reloadOnce, preloadFailed, reloading: (): boolean => going, startFailed, started };
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
  start: () => (typeof document === 'undefined' ? null : document.getElementById('start')),
  later: (fn, ms) => void setTimeout(fn, ms),
});

export const { reloadOnce, preloadFailed, reloading, startFailed, started } = browser;

/**
 * Once what the router is drawing has been put in the document: SvelteKit draws `error.html` right after this hook's
 * answer, in the same task, so the next frame sees it (and a hidden tab, which has no frames, a moment later).
 */
const afterDraw = (fn: () => void): void => {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    fn();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(once);
  setTimeout(once, 100);
};

/**
 * The router's error, as `hooks.client.ts` hands it on: said in the console as SvelteKit's own handler said it, and
 * marked `chunk` when it is a file that did not arrive, which `+error.svelte` reads. When what it draws next is
 * `error.html`, a failed start, that page tries again by itself (`startFailed`).
 */
export function handled(error: unknown, message: string): App.Error {
  console.error(error);
  if (typeof document !== 'undefined') afterDraw(startFailed);
  return isChunkFailure(error) ? { message, chunk: true } : { message };
}
