/**
 * The site knows you are signed in (LAUNCH 103 job 9): a small cookie a page can read, set beside the
 * session and cleared with it, so `brain.dog` draws "Open BrainDog" in place of "Start free" and "Sign in" before it
 * paints (`/signed-in.js` reads it and sets `html[data-in]`).
 *
 * IT HOLDS THE RECORD'S ADDRESS OR `1`, AND NOTHING A CREDENTIAL IS MADE OF. Never the session id, never an email: the
 * cookie is readable by every script on the page by design, so it says only "somebody is signed in here" and, when the
 * Worker has seen it, which record they were last on. A stale one costs nothing: it only opens the app, and the app
 * asks to sign in.
 *
 * ONE WRAPPER ON EVERY ANSWER, IN THE ENTRY, so sign-in, Google, the kennel, rotation, sign-out and account close are
 * all covered without a line in any of them: whatever sets or clears the session cookie sets or clears this one.
 * Pure, with no `cloudflare:` import, so Node's tests run it as it ships.
 */
import { COOKIE, readSid } from '@braindog/host/auth';

/** The cookie's name. Not `__Host-`, because the site's script reads it; not `HttpOnly`, for the same reason. */
export const SIGNED_IN = 'bd_in';

/** The session's own life, 30 days, written as the number because `MAX_AGE` in `@braindog/host/auth` is not exported. */
const MAX_AGE = 2_592_000;

/** A record's address as the app's paths carry it. Anything else is written as `1`, so the cookie never carries a stray. */
const ADDRESS = /^[a-z0-9-]{1,64}$/;

/** A redirect into one record: `/app/<address>/`, absolute or not. `/app/start` has no trailing slash and is not one. */
const INTO_RECORD = /^\/app\/([^/]+)\/$/;

type Mode = 'secure' | 'local';

const set = (value: string, mode: Mode): string =>
  `${SIGNED_IN}=${value}; Path=/; Max-Age=${MAX_AGE}; ${mode === 'secure' ? 'Secure; ' : ''}SameSite=Lax`;

const clear = (mode: Mode): string => `${SIGNED_IN}=; Path=/; Max-Age=0; ${mode === 'secure' ? 'Secure; ' : ''}SameSite=Lax`;

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

/** The record a redirect sends this browser into, or `null`. */
function addressOf(answer: Response, request: Request): string | null {
  if (answer.status < 300 || answer.status > 399) return null;
  const location = answer.headers.get('location');
  if (location === null) return null;
  let path: string;
  try {
    path = new URL(location, request.url).pathname;
  } catch {
    return null;
  }
  const slug = INTO_RECORD.exec(path)?.[1];
  return slug !== undefined && ADDRESS.test(slug) ? slug : null;
}

/** The address the request's own `bd_in` already holds, or `null` when it holds none or `1`. */
function heldAddress(request: Request): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== SIGNED_IN) continue;
    const value = part.slice(at + 1).trim();
    return ADDRESS.test(value) && value !== '1' ? value : null;
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
 * Four rules. A session `Set-Cookie` with a value adds `bd_in` holding the address the answer redirects into, else the
 * one the request's `bd_in` holds, else `1`. `GET /app` answering its 302 into a record for a request carrying a session
 * (no rotation, so no session cookie in the answer) adds `bd_in` with that address, so the cookie learns it. A cleared
 * session clears `bd_in`. Anything else, and always a 101 or an answer holding a WebSocket, is the answer itself.
 */
export function withSignedIn(answer: Response, request: Request): Response {
  if (answer.status === 101 || (answer as Response & { webSocket?: unknown }).webSocket) return answer;
  const moved = sessionMove(answer);
  if (moved?.move === 'clear') return adding(answer, clear(moved.mode));
  const into = addressOf(answer, request);
  if (moved?.move === 'set') return adding(answer, set(into ?? heldAddress(request) ?? '1', moved.mode));
  if (into === null || request.method !== 'GET') return answer;
  const path = new URL(request.url).pathname;
  if (path !== '/app' && path !== '/app/') return answer;
  const mode: Mode | null = readSid(request, 'secure') !== undefined ? 'secure' : readSid(request, 'local') !== undefined ? 'local' : null;
  return mode === null ? answer : adding(answer, set(into, mode));
}
