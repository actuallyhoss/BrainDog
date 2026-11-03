/**
 * `POST /api/seen`: one visit to a page of the site, counted by the day, the page and where the visitor came from, and
 * nothing else (LAUNCH 103 job 9).
 *
 * THE SITE SENDS IT, AND ONLY THE SITE. `apps/site/static/seen.js` posts `{ p: location.pathname, r: <referrer host> }`
 * with `credentials: 'omit'`, so no cookie comes with it, and sends nothing at all under Global Privacy Control.
 * `/api/*` is already forwarded by the site, so no route list changes.
 *
 * IT ALWAYS ANSWERS 204, counted or not, so the answer tells a caller nothing: not whether counting is on, not whether
 * its Origin passed, not whether the page is one the site has. It counts only when `COUNT_VISITS` is `yes`, the Origin
 * is the public host, the browser says `sec-fetch-site: same-origin`, the address is under its write limit, and the
 * page and where it came from are both on the Directory's closed lists, which it checks again.
 *
 * WHAT IT NEVER KEEPS OR LOGS: the IP, the user agent, the language, any cookie, the query or full address, the full
 * referrer, any time finer than a day, a country, a screen size, or any id or hash that tells one visitor from another.
 * The limiter is asked by address and keeps nothing of it here. Nothing is logged per visit, and a Directory that fails
 * is not logged either, since the line would be one per visit.
 *
 * ITS OWN FILE, FREE OF `cloudflare:`, so every decision runs in a test over fakes; `index.ts` mounts it.
 */

import { SEEN_CAME, SEEN_PAGES, type SeenCame, type SeenPage } from '@braindog/record/directory';

import { NOSNIFF } from './files.ts';

export { SEEN_CAME, SEEN_PAGES, type SeenCame, type SeenPage };

/**
 * The site's pages a visit may be counted from, each the page that opens a section: home and the first part of every
 * place `apps/site/src/lib/nav.ts` lists, held pages included, so the day the site is public counts them with no change
 * here. A page under one (a doc, a legal text, a page for one kind of person) counts as its section, which is all the
 * Directory keeps. `test/seen.test.ts` holds these to the site's own sections both ways, so a section the site gains or
 * loses fails that test by its path, and holds each one to the Directory's `SEEN_PAGES`.
 */
export const SITE_PAGES = ['/', '/slash', '/agents', '/packs', '/pricing', '/for', '/docs', '/changelog', '/support', '/security', '/download', '/legal'] as const;

/* EACH NAMED SOURCE BY ITS HOSTS, matched as the host itself or any name under it: `www.google.com` is a search, and so
   is `google.co.uk`, which is why Google is a pattern and the rest are names. AN ASSISTANT THAT ANSWERS WITH A LINK IS A
   SEARCH here, since the Directory's list has no word of its own for one, and a word added there would be a second
   list to hold equal to this one. */
const HOSTS: readonly (readonly [SeenCame, RegExp])[] = [
  ['search', /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/],
  ['search', /(^|\.)(bing\.com|duckduckgo\.com|search\.brave\.com|search\.yahoo\.com|ecosia\.org|kagi\.com)$/],
  ['search', /(^|\.)(chatgpt\.com|chat\.openai\.com|claude\.ai|perplexity\.ai)$/],
  ['github', /(^|\.)github\.com$/],
  ['hacker-news', /(^|\.)news\.ycombinator\.com$/],
  ['reddit', /(^|\.)reddit\.com$/],
  ['x', /(^|\.)(x\.com|twitter\.com|t\.co)$/],
  ['linkedin', /(^|\.)(linkedin\.com|lnkd\.in)$/],
];

/** The most of a path or a host this door reads; anything longer is not a page of the site or a real host. */
const PART_MAX = 200;

/** The most of a body this door reads: `{ p, r }` with both at their longest, and room to spare. */
export const SEEN_BODY_MAX = 1_024;

/** `/api/seen`, asked of a path already moved to the root, as every method is. */
export const servesSeen = (pathname: string): boolean => /^\/+api\/+seen\/*$/.test(pathname);

/** A page of the site as the section the Directory keeps it under: `home` for `/`, else its first part. */
export const sectionOf = (page: string): string => (page === '/' ? 'home' : (page.split('/')[1] ?? ''));

/**
 * The section a path is counted under, or `null` for one the site does not have. A trailing slash and a doc's or a
 * legal text's own address count under their page (`/docs/agents` is `docs`); the query and the fragment never arrive,
 * since the site sends only the path, and one that does is refused.
 */
export function pageOf(path: unknown): SeenPage | null {
  if (typeof path !== 'string' || path === '' || path.length > PART_MAX || path[0] !== '/' || /[?#\\\s]/.test(path)) return null;
  const bare = path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
  const page = (SITE_PAGES as readonly string[]).find((p) => p === bare || (p !== '/' && bare.startsWith(`${p}/`)));
  if (page === undefined) return null;
  const section = sectionOf(page);
  return (SEEN_PAGES as readonly string[]).includes(section) ? (section as SeenPage) : null;
}

/**
 * Where a visit came from, by the referrer's host as the site sent it. `publicHost` and every name under it is `site`,
 * so a move from one page to the next is told apart from a visitor arriving.
 */
export function cameOf(host: unknown, publicHost: string): SeenCame {
  if (host === undefined || host === null || host === '') return 'direct';
  if (typeof host !== 'string' || host.length > PART_MAX) return 'other';
  const name = host.trim().toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(name)) return 'other';
  const own = publicHost.trim().toLowerCase();
  if (own !== '' && (name === own || name.endsWith(`.${own}`))) return 'site';
  for (const [came, pattern] of HOSTS) if (pattern.test(name)) return came;
  return 'other';
}

/** What `index.ts` hands the door. Every one is a value or a function, so a test builds it over fakes. */
export type SeenDeps = {
  /** `COUNT_VISITS` is `yes`. Unset, empty or anything else is off, and nothing is read or counted. */
  on: boolean;
  /** `PUBLIC_HOST`, the one Origin a counted visit may carry. */
  host: string;
  /** The write limit by address (`overLimit` with `write`), or `null` to go on. */
  limit: (request: Request) => Promise<Response | null>;
  /** The Directory's `seen.count`: one more visit today to this page from there. */
  count: (call: { flow: 'seen.count'; page: SeenPage; came: SeenCame }) => Promise<unknown>;
};

/* THE ONE ANSWER, with nothing a cache or another page may keep. */
const NOTHING = (): Response =>
  new Response(null, { status: 204, headers: [['cache-control', 'no-store'], ...NOSNIFF] });

/** `POST /api/seen`, in order: on, method, origin, limit, body, lists, count. Every way out is the same 204. */
export async function seenDoor(request: Request, deps: SeenDeps): Promise<Response> {
  if (!deps.on || request.method !== 'POST' || deps.host === '') return NOTHING();
  if (request.headers.get('origin') !== `https://${deps.host}`) return NOTHING();
  if (request.headers.get('sec-fetch-site') !== 'same-origin') return NOTHING();
  if ((await deps.limit(request)) !== null) return NOTHING();
  if (Number(request.headers.get('content-length') ?? '0') > SEEN_BODY_MAX) return NOTHING();
  let body: unknown = null;
  try {
    body = JSON.parse((await request.text()).slice(0, SEEN_BODY_MAX));
  } catch {
    return NOTHING();
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return NOTHING();
  const said = body as { p?: unknown; r?: unknown };
  const page = pageOf(said.p);
  if (page === null) return NOTHING();
  try {
    await deps.count({ flow: 'seen.count', page, came: cameOf(said.r, deps.host) });
  } catch {
    /* A COUNT THAT FAILED IS ONE VISIT NOT COUNTED, and saying so would be a line a visit. */
  }
  return NOTHING();
}
