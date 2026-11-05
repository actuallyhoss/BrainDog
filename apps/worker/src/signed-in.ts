/**
 * The site knows you are signed in (LAUNCH 103 job 9): a small cookie a page can read, set beside the
 * session and cleared with it, so `brain.dog` draws "Open BrainDog" in place of "Start free" and "Sign in" before it
 * paints (`/signed-in.js` reads it and sets `html[data-in]`).
 *
 * IT HOLDS `1`, AND NOTHING ELSE. Never the session id, an email or a record's name: the cookie is readable by every
 * script on the page and sent to every name under the site's, so it says only "somebody is signed in here". It held the
 * record's address until 5 Nov, which nothing ever read back but this file. A stale one costs nothing: it only opens the
 * app, and the app asks to sign in.
 *
 * ONE WRAPPER ON EVERY ANSWER, IN THE ENTRY, so sign-in, Google, the kennel, rotation, sign-out and account close are
 * all covered without a line in any of them: whatever sets or clears the session cookie sets or clears this one.
 * Pure, with no `cloudflare:` import, so Node's tests run it as it ships.
 */
import { COOKIE } from '@braindog/host/auth';

/** The cookie's name. Not `__Host-`, because the site's script reads it; not `HttpOnly`, for the same reason. */
export const SIGNED_IN = 'bd_in';

/** The session's own life, 30 days, written as the number because `MAX_AGE` in `@braindog/host/auth` is not exported. */
const MAX_AGE = 2_592_000;

type Mode = 'secure' | 'local';

/**
 * `Domain=` WHEN THE APP IS ON A SUBDOMAIN OF THE NAME THE SITE IS ON. The session cookie is `__Host-`, so it never
 * leaves `app.brain.dog`; this one exists to be read by the site on `brain.dog`, which a host-only cookie set on
 * `app.brain.dog` is not. `parent` is the Worker's `RP_ID` and it is used only when `host` is a proper subdomain of it,
 * so a self-host, which has no parent, keeps the host-only cookie it always had. Set and cleared with the same Domain,
 * because a cookie is cleared only by the name, domain and path it was set with.
 */
export function cookieDomain(host: string | undefined, parent: string | undefined): string | null {
  const h = (host ?? '').trim().toLowerCase();
  const p = (parent ?? '').trim().toLowerCase();
  return p.includes('.') && h.endsWith(`.${p}`) ? p : null;
}

const domained = (domain: string | null): string => (domain === null ? '' : `Domain=${domain}; `);

const set = (value: string, mode: Mode, domain: string | null): string =>
  `${SIGNED_IN}=${value}; Path=/; ${domained(domain)}Max-Age=${MAX_AGE}; ${mode === 'secure' ? 'Secure; ' : ''}SameSite=Lax`;

const clear = (mode: Mode, domain: string | null): string =>
  `${SIGNED_IN}=; Path=/; ${domained(domain)}Max-Age=0; ${mode === 'secure' ? 'Secure; ' : ''}SameSite=Lax`;

/** What the answer does to the session: `set` with a value, `clear` at age zero, or nothing. */
function sessionMove(answer: Response): { move: 'set' | 'clear'; mode: Mode } | null {
  const cookies = typeof answer.headers.getSetCookie === 'function' ? answer.headers.getSetCookie() : [];
  for (const cookie of cookies) {
    const mode: Mode | null = cookie.startsWith(`${COOKIE.secure}=`) ? 'secure' : cookie.startsWith(`${COOKIE.local}=`) ? 'local' : null;
    if (mode === null) continue;
    const value = cookie.slice(COOKIE[mode].length + 1).split(';')[0]?.trim() ?? '';
    if (/;\s*max-age=0\s*(;|$)/i.test(cookie) || value === '') return { move: 'clear', mode };
    return { move: 'set', mode };
  }
  return null;
}

/** The answer with one more `Set-Cookie`. A new Response, because a fetched or asset answer's headers are immutable. */
function adding(answer: Response, cookie: string): Response {
  const next = new Response(answer.body, answer);
  next.headers.append('set-cookie', cookie);
  return next;
}

/**
 * Every answer as it leaves the Worker, with `bd_in` set or cleared beside the session.
 *
 * A session `Set-Cookie` with a value adds `bd_in=1`, and a cleared session clears it. With a `domain` (`cookieDomain`) the
 * cookie is written for that parent name, so the site on `brain.dog` reads one set by the app on `app.brain.dog`. Anything
 * else, and always a 101 or an answer holding a WebSocket, is the answer itself. `request` is no longer read, and stays so
 * the entry's one wrapper did not have to move.
 */
export function withSignedIn(answer: Response, _request: Request, domain: string | null = null): Response {
  if (answer.status === 101 || (answer as Response & { webSocket?: unknown }).webSocket) return answer;
  const moved = sessionMove(answer);
  if (moved?.move === 'clear') return adding(answer, clear(moved.mode, domain));
  if (moved?.move === 'set') return adding(answer, set('1', moved.mode, domain));
  return answer;
}
