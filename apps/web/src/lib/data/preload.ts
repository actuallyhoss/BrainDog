/**
 * A screen's first read, asked while a pointer rests on its link, a key focuses it or a finger lands on it, so the
 * press opens a screen whose answer is already here or on its way (d5-speed: "load a page when he hovers
 * or touches its link").
 *
 * THE READ GOES THROUGH THE CLIENT'S KEPT READS (`keepReads`), so the screen's own read, asked the moment it opens, is
 * handed the same answer or joins it while it is out, and asks nothing twice. The route's code is Kit's to preload
 * (`data-sveltekit-preload-data` in `app.html`); this asks only the record.
 *
 * BOUNDED. One link at a time, asked once the pointer has stayed `DWELL_MS` (a finger at once), and only for the
 * screens named in `warmFor`. CALLED OFF WHEN THE POINTER LEAVES before the press: the wait is cleared, and a read still
 * out is stopped, unless that link was pressed. Never a write: every call below is a read, `previewPage` drawing a body
 * nobody installs among them.
 *
 * PURE OF RUNES. The shell loads it after the first paint and hands it the document.
 */

import { apiBase, here, split } from '../at.ts';
import { filterOf } from '../page/filters.ts';

/** How long a pointer rests on a link before its screen is read: a pointer passing over a rail asks nothing. */
export const DWELL_MS = 80;

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type Warm = (base: string, io: Fetch) => Promise<unknown>;

/**
 * The first read of the screen at `url`, or `null` for a screen with nothing worth asking ahead. A page (`/p/<slug>`,
 * a project and Money among them) reads its page with the choice its address holds; Needs you reads its body, its calls
 * and what BrainDog handled.
 */
export function warmFor(url: URL): Warm | null {
  const inner = here(url.pathname);
  const page = /^\/p\/([^/]+)\/?$/u.exec(inner);
  if (page) {
    const slug = decodeURIComponent(page[1]!);
    const filter = filterOf(url.searchParams);
    return async (base, io) => {
      const { pageReader } = await import('../record/page-live.ts');
      return pageReader(base, io).read(slug, filter);
    };
  }
  if (inner === '/decide') {
    return async (base, io) => {
      const [{ readDecide, readCalls }, { loadHandled }, { createClient }] = await Promise.all([
        import('../../routes/decide/views.ts'),
        import('../home/handled.ts'),
        import('@braindog/client'),
      ]);
      return Promise.all([readDecide(base, undefined, io), readCalls(createClient({ base, fetch: io })), loadHandled(base, io)]);
    };
  }
  return null;
}

/** The link a pointer, a focus or a finger is on, if it opens a screen of this app in this tab. */
function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
  const a = target instanceof Element ? target.closest('a[href]') : null;
  if (!(a instanceof HTMLAnchorElement) || a.target || a.hasAttribute('download')) return null;
  /* THIS HOST'S OWN APP, by its scheme and host, and not one of its doors: an address anywhere else is no screen of
     this tab, and `/api` or `/auth` on this host is the host's and not a screen either (`split` in `at.ts`). */
  if (a.protocol !== location.protocol || a.host !== location.host || split(a.pathname) === null) return null;
  if (a.closest('[data-sveltekit-preload-data="off"], [data-sveltekit-preload-data="false"]')) return null;
  return a;
}

/** Watch `root` for links to read ahead of. The function it returns stops watching. */
export function watch(root: Document): () => void {
  let on: { link: HTMLAnchorElement; timer: ReturnType<typeof setTimeout> | null; stop: AbortController; pressed: boolean } | null = null;

  const leave = (): void => {
    if (on === null) return;
    if (on.timer !== null) clearTimeout(on.timer);
    if (!on.pressed) on.stop.abort();
    on = null;
  };

  const start = (link: HTMLAnchorElement, wait: number): void => {
    if (on?.link === link) return;
    leave();
    const url = new URL(link.href);
    /* THE SCREEN ALREADY OPEN asks nothing ahead: its own reads are on screen. */
    if (url.pathname === location.pathname && url.search === location.search) return;
    const warm = warmFor(url);
    if (warm === null) return;
    const stop = new AbortController();
    const io: Fetch = (input, init) => fetch(input, { ...init, signal: stop.signal });
    const mine = { link, timer: null as ReturnType<typeof setTimeout> | null, stop, pressed: false };
    mine.timer = setTimeout(() => {
      mine.timer = null;
      void warm(apiBase(url), io).catch(() => undefined);
    }, wait);
    on = mine;
  };

  const over = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const link = linkOf(e.target);
    if (link) start(link, DWELL_MS);
  };
  const out = (e: PointerEvent): void => {
    if (on === null) return;
    const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (to !== null && on.link.contains(to)) return;
    if (linkOf(e.target) === on.link) leave();
  };
  const touch = (e: TouchEvent): void => {
    const link = linkOf(e.target);
    if (link) start(link, 0);
  };
  /* A FINGER THAT MOVES IS SCROLLING, not pressing: its read is called off. */
  const drag = (): void => {
    if (on !== null && !on.pressed) leave();
  };
  const focus = (e: FocusEvent): void => {
    const link = linkOf(e.target);
    if (link) start(link, DWELL_MS);
  };
  const blur = (e: FocusEvent): void => {
    if (on !== null && linkOf(e.target) === on.link) leave();
  };
  /* A PRESSED LINK KEEPS ITS READ: the screen it opens takes it over. */
  const press = (e: MouseEvent): void => {
    if (on !== null && linkOf(e.target) === on.link) on.pressed = true;
  };

  root.addEventListener('pointerover', over, { passive: true });
  root.addEventListener('pointerout', out, { passive: true });
  root.addEventListener('touchstart', touch, { passive: true });
  root.addEventListener('touchmove', drag, { passive: true });
  root.addEventListener('touchcancel', drag, { passive: true });
  root.addEventListener('focusin', focus);
  root.addEventListener('focusout', blur);
  root.addEventListener('pointerdown', press, { capture: true, passive: true });
  root.addEventListener('click', press, { capture: true });
  return () => {
    leave();
    root.removeEventListener('pointerover', over);
    root.removeEventListener('pointerout', out);
    root.removeEventListener('touchstart', touch);
    root.removeEventListener('touchmove', drag);
    root.removeEventListener('touchcancel', drag);
    root.removeEventListener('focusin', focus);
    root.removeEventListener('focusout', blur);
    root.removeEventListener('pointerdown', press, { capture: true });
    root.removeEventListener('click', press, { capture: true });
  };
}
