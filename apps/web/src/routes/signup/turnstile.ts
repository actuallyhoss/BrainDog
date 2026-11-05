/**
 * Cloudflare's bot check script on the sign-up page, and what the page says while it waits for it.
 *
 * LOADED BY THE SIGN-UP ROUTE ONLY, never by the entry: the page imports it, so it rides in that route's chunk.
 *
 * WHY IT EXISTS. The page added the script and waited on its `load` with nothing else: a script blocked by a filter, a
 * network that dropped it or one that loaded and defined nothing left the box empty and Send disabled for good, with no
 * word on screen. Now a script error, or no `turnstile` global by `timeoutMs`, is `failed`, the page says so in
 * `widgetWords`, and a second call tries again.
 *
 * ONE SCRIPT TAG AT A TIME. A call while one is loading is answered by that same load. A call after a failure takes the
 * old tag away before adding a fresh one, so the page never holds two and Cloudflare is never asked twice at once.
 */

/** Where the script is, rendered explicitly into the page's own slot. */
export const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The most the page waits for Cloudflare's script before it says the check did not load. */
export const WIDGET_MS = 10_000;

export type WidgetState = 'loading' | 'ready' | 'failed';

/** The addresses whose page may load the check (`SIGNUP` in `apps/worker/src/route.ts`). */
const CHECK_PAGES = /^\/(signup|signin)\/?$/u;

/**
 * THE CHECK IS ALLOWED BY THE PAGE THE BROWSER LOADED, NOT THE ONE ON SCREEN. Opening `/` signed out (the installed app's
 * start address, or anybody's bookmark) loads a page whose policy leaves Cloudflare out, and the app moves to the sign-in
 * screen without loading another, so the script was refused and the check "did not load", every time. So a sign-in or
 * sign-up screen drawn on any other page is loaded afresh at its own address, once: that page is one that may hold it, and
 * the service worker never answers those two addresses. `true` says the browser is on its way and nothing should load.
 */
export function reopenForCheck(win: Pick<Window, 'location' | 'performance'> = globalThis as unknown as Window): boolean {
  const entry = win.performance.getEntriesByType('navigation')[0];
  if (entry === undefined || CHECK_PAGES.test(new URL(entry.name).pathname) || !CHECK_PAGES.test(win.location.pathname)) return false;
  win.location.replace(win.location.href);
  return true;
}

/** The parts of a document this file uses; a test hands a stub cast to it. */
export type WidgetDoc = Pick<Document, 'defaultView' | 'head' | 'querySelector' | 'createElement'>;

/** The load each document has in flight, so a second call while it runs is answered by the same one. */
const loading = new WeakMap<object, Promise<'ready' | 'failed'>>();

const hasGlobal = (doc: WidgetDoc): boolean => (doc.defaultView as { turnstile?: unknown } | null)?.turnstile != null;

/**
 * Load Cloudflare's script into `doc` once, and say whether the `turnstile` global came.
 *
 * `ready` AT ONCE when the global is already there (the read's widget loaded it earlier). `failed` on the script's
 * `error`, or when `timeoutMs` passes without the global; a `load` that defined nothing waits out the limit, in case
 * the global lands a moment after.
 */
export function loadWidget({ doc, src = TURNSTILE_SRC, timeoutMs = WIDGET_MS }: { doc: WidgetDoc; src?: string; timeoutMs?: number }): Promise<'ready' | 'failed'> {
  if (hasGlobal(doc)) return Promise.resolve('ready');
  const running = loading.get(doc);
  if (running) return running;

  /* A TAG LEFT BY A LOAD THAT FAILED, OR BY ANY LOAD THIS FILE IS NOT WATCHING, goes before a fresh one is added. */
  doc.querySelector<HTMLScriptElement>('script[data-turnstile]')?.remove();
  const script = doc.createElement('script');
  script.src = src;
  script.async = true;
  script.dataset['turnstile'] = '';

  const load = new Promise<'ready' | 'failed'>((done) => {
    let over = false;
    const end = (state: 'ready' | 'failed'): void => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      loading.delete(doc);
      done(state);
    };
    const timer = setTimeout(() => end(hasGlobal(doc) ? 'ready' : 'failed'), timeoutMs);
    script.addEventListener('load', () => void (hasGlobal(doc) && end('ready')), { once: true });
    script.addEventListener('error', () => end('failed'), { once: true });
  });
  loading.set(doc, load);
  doc.head.append(script);
  return load;
}

/** The box's line, Send's label while it waits on the check, and the button that tries again. */
export type WidgetWords = { line: string | null; send: string; again: string };

/**
 * What the page says for each state of the check. `line` is drawn in the box only when it failed; `send` is Send's
 * label while the rest of the form is ready and only the check's answer is missing, so it says what it waits for.
 */
export function widgetWords(state: WidgetState): WidgetWords {
  const again = 'Try again';
  switch (state) {
    case 'failed':
      return { line: 'The check that you are a person did not load. Try again.', send: 'Try the check above again to send', again };
    case 'loading':
      return { line: null, send: 'Loading the check that you are a person', again };
    default:
      return { line: null, send: 'Finish the check above to send', again };
  }
}
