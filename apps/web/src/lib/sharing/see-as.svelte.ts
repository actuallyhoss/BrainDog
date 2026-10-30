/**
 * See as: an owner or an Admin reads the record as one person would, from the Share sheet's
 * "See as Priya".
 *
 * THE HOST DOES THE SEEING. The app sends `x-braindog-as: <person>` on every call to the record (`SEE_AS_HEADER` in
 * `packages/host/src/auth.ts`), and the host answers with that person's context marked `preview`: their lens, none of
 * the rows they keep private, and every change refused. This file only says who, and says it on every call.
 *
 * EVERY CALL, SO THE FETCH ITSELF CARRIES IT. The app builds a client wherever it reads, each over `globalThis.fetch`, so
 * the header is added there (`install`), to this origin's `/api/` and nothing else. A change refused because the record
 * is being seen as somebody comes back in this sheet's words, with their name.
 *
 * ONE TAB, AND A FRESH START EACH WAY. Who is kept in this tab's session storage and the page loads again, in and out,
 * so no answer read as the owner is drawn as Priya's or the other way round, and no screen has to know.
 *
 * THE LOCAL COPY IS OFF WHILE IT IS ON. Nothing read as Priya is kept in the owner's copy, nothing from the copy is drawn
 * for her, and the last shell is neither drawn nor kept (`local-tab.ts`, `routes/+layout.ts`). The page's own early
 * `boot` was asked without the header, so it is dropped unread.
 *
 * NO RUNE AT ITS TOP, so Node loads it for a test as it is: who is read once as the page loads, and changes only by
 * loading the page again.
 */

import { copy } from '../copy.ts';

/** The header the host reads (`packages/host/src/auth.ts`, `SEE_AS_HEADER`). */
export const SEE_AS_HEADER = 'x-braindog-as';
const KEY = 'braindog.see-as';
/** The longest id the host reads the header for; anything longer names nobody. */
const ID_MOST = 64;

export type SeenAs = { id: string; name: string };

type Strings = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const strings = (): Strings | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

/** Who this tab is seeing the record as, from what it kept, or `null`. */
export function readSeenAs(store: Strings | null = strings()): SeenAs | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: unknown; name?: unknown };
    return typeof v.id === 'string' && v.id !== '' && v.id.length <= ID_MOST && typeof v.name === 'string' && v.name !== '' ? { id: v.id, name: v.name } : null;
  } catch {
    return null;
  }
}

let current: SeenAs | null = readSeenAs();

/** Who the record is being seen as now, or `null`. */
export const seeingAs = (): SeenAs | null => current;

const methodOf = (input: RequestInfo | URL, init?: RequestInit): string => (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();

/**
 * `fetch`, with the header on every call to this origin's record, and a change the host refused for See as said with
 * the person's name. Anything else, and everything while nobody is seen as, goes through untouched.
 */
export function seeing(f: typeof globalThis.fetch, as: () => SeenAs | null, origin: () => string | undefined): typeof globalThis.fetch {
  return async (input, init) => {
    const who = as();
    if (who === null) return f(input, init);
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const here = origin();
    let url: URL;
    try {
      url = new URL(href, here);
    } catch {
      return f(input, init);
    }
    if (url.origin !== here || !/\/api\//u.test(url.pathname)) return f(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(SEE_AS_HEADER, who.id);
    const res = await f(input, { ...init, headers });
    if (res.status !== 403 || methodOf(input, init) !== 'POST') return res;
    try {
      const body = (await res.clone().json()) as { refusal?: { at?: unknown } };
      if (body.refusal?.at !== 'preview') return res;
      return new Response(JSON.stringify({ ...body, refusal: { ...body.refusal, fix: copy.seeAsRefused(who.name) } }), { status: res.status, headers: res.headers });
    } catch {
      return res;
    }
  };
}

/**
 * The event the Sharing page asks See as by (`askSeeAs` in `sharing.ts`, which spells the same name): `{ person, name }`.
 * The page never imports this file's way in, and this file never imports the page's.
 */
export const SEE_AS_EVENT = 'braindog:see-as';

/** What an ask carried, as somebody to see the record as, or `null` for anything else. */
export function askedOf(detail: unknown): SeenAs | null {
  const d = detail as { person?: unknown; name?: unknown } | null | undefined;
  return typeof d?.person === 'string' && d.person !== '' && typeof d.name === 'string' && d.name !== '' ? { id: d.person, name: d.name } : null;
}

let installed = false;

/**
 * Put the header on this tab's fetch, once, and listen for the Sharing page's ask. While seeing as somebody, the page's
 * early `boot` and Today are dropped unread.
 */
export function install(): void {
  if (installed || typeof globalThis.fetch !== 'function' || globalThis.location === undefined) return;
  installed = true;
  globalThis.fetch = seeing(globalThis.fetch.bind(globalThis), seeingAs, () => globalThis.location?.origin);
  if (current !== null) {
    const early = globalThis as { __bdBoot?: unknown; __bdToday?: unknown };
    early.__bdBoot = undefined;
    early.__bdToday = undefined;
  }
  globalThis.addEventListener?.(SEE_AS_EVENT, (e) => {
    const who = askedOf((e as CustomEvent<unknown>).detail);
    if (who !== null) enterSeeAs(who);
  });
}

install();

/** Start seeing the record as somebody: kept for this tab, and the page loaded again as them. */
export function enterSeeAs(who: SeenAs, reload: () => void = () => globalThis.location.reload()): boolean {
  if (who.id === '' || who.id.length > ID_MOST) return false;
  const store = strings();
  try {
    store?.setItem(KEY, JSON.stringify({ id: who.id, name: who.name }));
  } catch {
    return false;
  }
  if (readSeenAs(store)?.id !== who.id) return false;
  current = who;
  reload();
  return true;
}

/** Stop, and load the page again as yourself. */
export function exitSeeAs(reload: () => void = () => globalThis.location.reload()): void {
  try {
    strings()?.removeItem(KEY);
  } catch {
    /* A store that will not forget is a tab that keeps seeing as them until it closes; the reload still asks. */
  }
  current = null;
  reload();
}
