/**
 * Where the app lives, and which record an address names.
 *
 * THE APP IS `app.brain.dog` AT ITS ROOT, AND THE RECORD IS THE FIRST SEGMENT. `/acme/r/tasks` is acme's tasks, checked
 * by the Directory before any id is used; `/r/tasks` is the record the session is on, which is what the app meant by
 * every address before the move and what a legacy redirect lands on, because the redirect cannot know the slug. It was
 * `app.brain.dog/app/acme` until 29 Oct, and he did not want the second `app`: the Worker answers every address under
 * `/app` with a 308 to the same address without it, so a link kept from then still opens.
 *
 * THE ROOT IS SHARED WITH THE HOST'S OWN DOORS. `/api`, `/auth`, `/mcp` and the rest are answered by the Worker and
 * never by the app, so a first segment in `DOORS` is outside the app, and no record can be called by one of them
 * because the Directory refuses every word in `APP_WORDS` as a name.
 *
 * STORED ADDRESSES STAY RECORD-RELATIVE. A rail address is `/p/<page>` inside the record, a nav-prefs key is
 * `/r/<list>`, and a record is not rewritten because its host moved. So nothing here is called on data. It is called
 * where an address is RENDERED (`href`, `goto`, a copied link), and `here` undoes it where the rail compares.
 *
 * PURE AND TINY, AND BOTH ARE REQUIREMENTS. `node --test` imports it with no SvelteKit, so it reads `location` only as
 * a default argument; and it is in the entry chunk, beside every link the rail draws, which has a budget.
 */

/** `paths.base` in `svelte.config.js`, which a test holds equal to this. Empty: the app is the root. */
export const BASE = '';

/**
 * EVERY FIRST SEGMENT THE HOST ANSWERS ITSELF, AND THE APP NEVER DRAWS. The Worker's doors (`apps/worker/src/route.ts`),
 * the build's own chunks, the frame a drawn block is drawn in, and `app`, the prefix the app lived under until it moved
 * to the root, which the Worker sends on with a 308. An address here is not the app's, so sign-in never sends anybody
 * on to one and no slug is read from one.
 */
export const DOORS: ReadonlySet<string> = new Set('api auth account mcp in oauth a ws healthz app _app .well-known drawn-frame'.split(' '));

/**
 * EVERY FIRST SEGMENT THAT IS NOT A RECORD. The app's top-level routes and static folders, which a test reads off the
 * tree, the host's doors, and the Directory's own reserved words (`packages/record/src/directory.ts`), so a name the
 * Directory could never hand out is never read as one here.
 */
export const APP_WORDS: ReadonlySet<string> = new Set(
  (
    'activity add addons agents audit automations catalogue connect count decide design fonts inbox invite jobs p packs plugins r s scripts search settings signin signup slash start t usage v vault keychain ' +
    'api auth account mcp oauth healthz drawn-frame a in ws admin app assets static www new _app'
  ).split(' '),
);

/* A SLUG IS THE DIRECTORY'S GRAMMAR, AND A SPOKEN ID IS NEVER ONE. `d41` is a legal slug by the grammar alone, and
   `/d41` has to mean the question D41, so the Directory refuses that shape and this reads it as an id. */
const SLUG = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
const SPOKEN = /^[a-z]{1,3}\d+$/i;

/* THE ADDRESSES THAT NAME NO RECORD. Sign-in, sign-up and an invitation are before any record is open, and `/s/<token>` is
   a capability that must not imply a record behind it; a slug added to any of them would ask for a record nobody meant. */
const RECORDLESS = new Set(['signin', 'signup', 'invite', 's']);

const now = (): string => globalThis.location?.pathname ?? '';

/** The first segment of an address, before any query or fragment. */
const firstOf = (path: string): string => /^\/([^/?#]*)/.exec(path)?.[1] ?? '';

/**
 * The address an old one under `/app` names now: `/app/acme/r/tasks` is `/acme/r/tasks` and `/app` is `/`. Any other
 * address comes back as it was. Read where an address from before the move can still arrive: a mailed `next`, a link
 * a person kept in a note.
 *
 * EVERY SLASH AFTER `/app` GOES, NOT ONE (SEC4). Taking one left `/app//evil.example/x` as `//evil.example/x`, which a
 * browser reads as another host: a `next` that passed every check as typed became an open redirect once `/app` was off.
 */
export const fromLegacy = (path: string): string => (/^\/app(?=[/?#]|$)/.test(path) ? `/${path.slice(4).replace(/^\/+/, '')}` : path);

/**
 * Whether an address can only ever be a path on this origin: one leading `/`, no backslash or control character, and
 * none once it is decoded either, since `/%2F%2Fevil.example` decodes to a host as `safeNext` reads it on the server.
 */
export function pathOnly(path: string): boolean {
  const bad = (p: string): boolean => !p.startsWith('/') || p.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(p);
  if (bad(path)) return false;
  try {
    return !bad(decodeURIComponent(path));
  } catch {
    return false;
  }
}

/** The slug an app address names and the address inside the record, or `null` for an address outside the app. */
export function split(pathname: string): { slug: string | null; rest: string } | null {
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return null;
  const inner = pathname.slice(BASE.length) || '/';
  const first = inner.split('/')[1] ?? '';
  if (DOORS.has(first)) return null;
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
 * by a caller first. With the app at the root a rendered address and a record-relative one are both paths, so what
 * tells them apart is the first segment: a slug there means the address is already rendered, and a page's word, a
 * spoken id or nothing means it is not. A query, a fragment, another origin and a host's door come back unchanged,
 * and an address kept from before the move loses its `/app` and is read as the one it names now.
 */
export function at(path: string, pathname: string = now()): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const moved = fromLegacy(path);
  const word = firstOf(moved);
  if (DOORS.has(word) || split(moved.replace(/[?#].*$/, ''))?.slug != null) return moved;
  const slug = slugOf(pathname);
  return slug === null || RECORDLESS.has(word) ? `${BASE}${moved}` : `${BASE}/${slug}${moved}`;
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
 * EVERY 401, UNDER A SLUG OR NOT. It was a 401 under a slug only, because the bare app with nobody signed in drew the
 * sample record the marketing site linked to. The sample is gone, so the bare address asks for sign-in as
 * `/acme/…` always did, and `/start` with it: making a record needs somebody to own it. The answer is the same 401
 * whether acme exists or not, so the redirect says nothing about which names are taken. Sign-in and the other addresses
 * with no record are never sent, or sign-in would be sent to itself.
 */
export function signInFirst(code: string, url: { pathname: string; search: string }): string | null {
  const parts = split(url.pathname);
  const word = firstOf(parts?.rest ?? '');
  return code === 'UNAUTHORIZED' && parts !== null && !RECORDLESS.has(word) ? signinFor(url) : null;
}

/* AN ORIGIN NOBODY SERVES, so a `next` that names any real one resolves off it and is refused, and `onward()` needs no
   `location` to answer. It is the stand-in the host's `safeNext` resolves against too, so the two halves agree. */
const HERE = 'https://here.invalid';

/**
 * Where sign-in sends a person once they are in: the `next` it was handed, resolved as a browser will resolve the
 * href, when that lands in this app. The resolved address is returned in place of the typed one.
 *
 * ANYTHING ELSE IS THE APP'S FRONT DOOR. A `next` is written by whoever wrote the link, so one that leaves the app for
 * one of the host's doors, leaves the origin, or reaches a backslash a browser reads as a slash is an open redirect and
 * is dropped rather than followed.
 *
 * THE SPELLING PASSED AND THE ADDRESS DID NOT. This checked the string as typed, so `/app/../auth/session`,
 * `/app/%2e%2e/api/export`, `/app/.%2e/in/x` and `/app/..` each started with `/app/` and each opened on this origin
 * outside the app. A first fix resolved them in `signin.ts` alone, which
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
  /* A `next` FROM BEFORE THE MOVE IS READ AS THE ADDRESS IT NAMES NOW, after it is resolved and not before, so
     `/app/../auth/session` is still `/auth/session`, a door, and is refused. */
  const path = fromLegacy(url.pathname);
  /* AND THE CHECKS AGAIN ON THE ADDRESS THAT WILL BE OPENED, after `/app` is off (SEC4): what is checked is what is
     followed, and the address as typed is neither. */
  if (url.origin !== HERE || !pathOnly(path) || new URL(path, HERE).origin !== HERE) return `${BASE}/`;
  return split(path) !== null ? `${path}${url.search}${url.hash}` : `${BASE}/`;
}
