/**
 * Where the app lives, and which record an address names (`loop/research-one-domain.md` §2.4).
 *
 * THE APP IS `brain.dog/app` AND THE RECORD IS THE NEXT SEGMENT. `/app/acme/r/tasks` is acme's tasks, checked by the
 * Directory before any id is used; `/app/r/tasks` is the record the session is on, which is what the app meant by every
 * address before the move and what a legacy redirect lands on, because the redirect cannot know the slug.
 *
 * STORED ADDRESSES STAY RECORD-RELATIVE. A rail address is `/p/<page>` inside the record, a nav-prefs key is
 * `/r/<list>`, and a record is not rewritten because its host moved. So nothing here is called on data. It is called
 * where an address is RENDERED (`href`, `goto`, a copied link), and `here` undoes it where the rail compares.
 *
 * PURE AND TINY, AND BOTH ARE REQUIREMENTS. `node --test` imports it with no SvelteKit, so it reads `location` only as
 * a default argument; and it is in the entry chunk, beside every link the rail draws, which has a budget.
 */

/** `paths.base` in `svelte.config.js`, which a test holds equal to this. */
export const BASE = '/app';

/**
 * EVERY FIRST SEGMENT THAT IS NOT A RECORD. The app's top-level routes and static folders, which a test reads off the
 * tree, and the Directory's own reserved words (`packages/record/src/directory.ts`), so a name the Directory could never
 * hand out is never read as one here.
 */
export const APP_WORDS: ReadonlySet<string> = new Set(
  (
    'audit automations catalogue decide fonts inbox invite jobs p packs r s search settings signin spark start t usage v vault ' +
    'api auth mcp a in ws admin app assets static www new _app'
  ).split(' '),
);

/* A SLUG IS THE DIRECTORY'S GRAMMAR, AND A SPOKEN ID IS NEVER ONE. `d41` is a legal slug by the grammar alone, and
   `/app/d41` has to mean the question D41, so the Directory refuses that shape and this reads it as an id. */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const SPOKEN = /^[a-z]{1,3}\d+$/i;

/* THE THREE ADDRESSES THAT NAME NO RECORD. Sign-in and an invitation are before any record is open, and `/s/<token>` is
   a capability that must not imply a record behind it; a slug added to any of them would ask for a record nobody meant. */
const RECORDLESS = new Set(['signin', 'invite', 's']);

const now = (): string => globalThis.location?.pathname ?? '';

/** The slug an app address names and the address inside the record, or `null` for an address outside the app. */
export function split(pathname: string): { slug: string | null; rest: string } | null {
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return null;
  const inner = pathname.slice(BASE.length) || '/';
  const first = inner.split('/')[1] ?? '';
  if (!SLUG.test(first) || SPOKEN.test(first) || APP_WORDS.has(first)) return { slug: null, rest: inner };
  return { slug: first, rest: inner.slice(first.length + 1) || '/' };
}

export const slugOf = (pathname: string = now()): string | null => split(pathname)?.slug ?? null;

/** The address inside the record: what the rail compares `/decide` against, whichever record the tab is on. */
export const here = (pathname: string = now()): string => split(pathname)?.rest ?? pathname;

/**
 * A record-relative address, rendered for the page it is drawn on.
 *
 * SAFE TO CALL TWICE, and it has to be: `Button` calls it on every `href` it is handed, and some of those were rendered
 * by a caller first. An address already under the app, a query, a fragment and another origin come back unchanged.
 */
export function at(path: string, pathname: string = now()): string {
  if (!path.startsWith('/') || path.startsWith('//') || path === BASE || path.startsWith(`${BASE}/`)) return path;
  const slug = slugOf(pathname);
  const word = /^\/([^/?#]*)/.exec(path)?.[1] ?? '';
  return slug === null || RECORDLESS.has(word) ? `${BASE}${path}` : `${BASE}/${slug}${path}`;
}

/**
 * Where this page's record answers `/api/<method>`: the named record under a slug, and the session's record otherwise.
 *
 * ONLY THE RECORD'S METHODS. `/auth/*` and `/account/*` are the person's and not a record's, and `/in/*` is a door a
 * stranger posts to, so those keep the bare origin wherever they are built.
 */
export function apiBase(url: { origin: string; pathname: string } = globalThis.location): string {
  const slug = slugOf(url.pathname);
  return slug === null ? url.origin : `${url.origin}${BASE}/${slug}`;
}

/** What the `reroute` hook hands SvelteKit: the address with its slug taken out, or nothing when there is none. */
export function rerouted(pathname: string): string | undefined {
  const parts = split(pathname);
  return parts?.slug ? `${BASE}${parts.rest}` : undefined;
}

/** Sign-in, asked to come back here afterwards. */
export const signinFor = (url: { pathname: string; search: string }): string =>
  `${BASE}/signin?next=${encodeURIComponent(`${url.pathname}${url.search}`)}`;

/**
 * Where a refused `boot` sends the page instead of drawing it, or `null` to draw it.
 *
 * EVERY 401, UNDER A SLUG OR NOT. It was a 401 under a slug only, because `/app` with nobody signed in drew the sample
 * record the marketing site linked to. The sample is gone (DIRECTION 26), so the bare address asks for sign-in as
 * `/app/acme/…` always did, and `/start` with it: making a record needs somebody to own it. The answer is the same 401
 * whether acme exists or not, so the redirect says nothing about which names are taken. Sign-in and the other addresses
 * with no record are never sent, or sign-in would be sent to itself.
 */
export function signInFirst(code: string, url: { pathname: string; search: string }): string | null {
  const parts = split(url.pathname);
  const word = /^\/([^/?#]*)/.exec(parts?.rest ?? '')?.[1] ?? '';
  return code === 'UNAUTHORIZED' && parts !== null && !RECORDLESS.has(word) ? signinFor(url) : null;
}

/* AN ORIGIN NOBODY SERVES, so a `next` that names any real one resolves off it and is refused, and `onward()` needs no
   `location` to answer. It is the stand-in the host's `safeNext` resolves against too, so the two halves agree. */
const HERE = 'https://here.invalid';

/**
 * Where sign-in sends a person once they are in: the `next` it was handed, resolved as a browser will resolve the
 * href, when that lands in this app. The resolved address is returned in place of the typed one.
 *
 * ANYTHING ELSE IS THE APP'S FRONT DOOR. A `next` is written by whoever wrote the link, so one that leaves the app, the
 * origin, or reaches a backslash a browser reads as a slash is an open redirect and is dropped rather than followed.
 *
 * THE SPELLING PASSED AND THE ADDRESS DID NOT. This checked the string as typed, so `/app/../auth/session`,
 * `/app/%2e%2e/api/export`, `/app/.%2e/in/x` and `/app/..` each started with `/app/` and each opened on this origin
 * outside the app (`loop/research-batch-forty-nine-audit.md` §8). Wave 50 resolved them in `signin.ts` alone, which
 * left this function's own promise false for any other caller; so the rule is here, once, and sign-in calls it.
 *
 * A TAB, A NEWLINE OR A RETURN IS REFUSED BEFORE IT IS PARSED. The URL parser deletes them first, so `/\t/[` reads as
 * `//[`, a host that is not valid, and `new URL` threw; the sign-in page calls this on arrival before it takes its
 * link, so one crafted `next` stopped the page. Refused here, every value left is a path and the parse cannot throw.
 */
export function onward(search: string = globalThis.location?.search ?? ''): string {
  const next = new URLSearchParams(search).get('next') ?? '';
  if (!next.startsWith('/') || next.startsWith('//') || /[\\\t\n\r]/.test(next)) return `${BASE}/`;
  const url = new URL(next, HERE);
  return url.origin === HERE && split(url.pathname) !== null ? `${url.pathname}${url.search}${url.hash}` : `${BASE}/`;
}
