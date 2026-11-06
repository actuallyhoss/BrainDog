/**
 * What the site tells BrainDog when a page is opened, so a visit can be counted with nothing kept about who made it
 * (batch 103b, LAUNCH 103 job 9).
 *
 * ONE SMALL POST TO `/api/seen` ON THIS ORIGIN, with the page's path and the host it came from and nothing else. It goes
 * by `fetch` with `keepalive` and `credentials: 'omit'`, so no cookie goes either way: `sendBeacon` would have carried
 * the session cookie and `bd_in`. Its body is a string, which the browser sends as a simple request of text, so no preflight is asked for. When the
 * browser says Global Privacy Control, nothing is sent at all.
 *
 * THE WORKER CLOSES BOTH FIELDS. It counts a page only when it is one of `PAGES` (its own list is held equal to this one
 * by its test) and a came-from host only from its own short list, and it counts by day. It never keeps the address,
 * the browser, the full referrer or the query, so this file sends none of them.
 *
 * `static/seen.js` IS `seenBody` AGAIN, in plain script with no imports, for `app.html` to load `defer` because the CSP
 * allows no inline script and the count must never hold up the first paint. IT IS NOT LOADED YET: counting is off in
 * production (`COUNT_VISITS`), so until it is switched on a page would only send a POST nobody answers. `test/seen.test.ts` runs both on the same
 * pages and referrers and holds them equal.
 */

import { cases } from '../copy/cases.ts';
import { HELD } from '../launch.ts';

/** Where the count goes: this origin's own door, which the site's Worker hands to the app. */
export const SEEN = '/api/seen';

/**
 * EVERY PAGE THE SITE SERVES, by the path a reader opens. A page under a dynamic segment counts as its section (a docs
 * page as `/docs`, a legal text as `/legal`), and the 404 page and the held pages are not here. The pages written for
 * each kind of person are read from the drawn app's "More for" links, the addresses those pages are built at, less
 * the ones held (`launch.ts`).
 * `test/seen.test.ts` reads the route tree and holds this list equal to it.
 */
export const PAGES: readonly string[] = [
  '/',
  '/agents',
  '/docs',
  '/download',
  ...Object.values(cases.drawn.moreFor)
    .map((more) => more.href)
    .filter((href) => !(HELD as readonly string[]).includes(href)),
  '/legal',
  '/pricing',
  '/security',
  '/slash',
  '/support',
];

/** The host of `referrer` (as `document.referrer` gives it), or '' when there is none or it does not parse. */
export const cameFrom = (referrer: string): string => {
  try {
    return referrer ? new URL(referrer).hostname : '';
  } catch {
    return '';
  }
};

/** The body `/seen.js` posts for a page at `pathname` opened from `referrer`: the path and the referrer's host. */
export const seenBody = (pathname: string, referrer: string): string => JSON.stringify({ p: pathname, r: cameFrom(referrer) });

/** The request `/seen.js` makes: same origin, kept alive past the page, no cookie, a simple request. */
export const SEEN_INIT = {
  method: 'POST',
  keepalive: true,
  credentials: 'omit',
} as const;
