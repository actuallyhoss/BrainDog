/**
 * admin.brain.dog, the owner's page ("i can invite through admin.brain.dog"): applications with Invite
 * and Decline, an invite to anyone by email, and the sign-up codes with End.
 *
 * ONE PAGE, ONE SCRIPT AND ONE STYLE, ALL FROM THIS WORKER, and the operator doors it calls (`/account/ops/*`) are the
 * normal router's, reached on the same origin, so the page needs no CORS and its CSP allows `'self'` and nothing else.
 * Every other path on the name is a plain 404, so the admin host is never a second copy of the app or its API.
 *
 * THE OPERATOR KEY (`PROVISION_KEY`) IS THE SIGN-IN FOR NOW. The page keeps it in `sessionStorage` only and sends it
 * as `Authorization: Bearer`, which the doors already check. CLOUDFLARE ACCESS CAN GO IN FRONT LATER with no code
 * change: an Access application on the hostname `admin.brain.dog` makes Cloudflare ask for a sign-in before a request
 * reaches this Worker, and the key check stays behind it.
 *
 * Pure, with no `cloudflare:` import, so Node's tests run it as it ships. Wired in `index.ts`'s `route()` right after
 * the liveness line.
 */
import { ADMIN_CSS, ADMIN_HTML, ADMIN_JS } from './admin-page.ts';
import { FILE_HEADERS } from './files.ts';

/**
 * `nosniff` under its header's name, read off the headers every file goes out with (`FILE_HEADERS`), so the worker
 * writes that header once and this host and the application door send it in the same words.
 */
export const NOSNIFF: readonly [string, string][] = Object.entries(FILE_HEADERS).filter(([, value]) => value === 'nosniff');

/** The five headers on every answer this host gives, the 404 and the 405 included. */
export const ADMIN_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
  ...Object.fromEntries(NOSNIFF),
};

/** The operator doors, which the normal router answers on this host as on any other. */
const OPS = /^\/+account\/+ops(\/|$)/;

/** The Kennel's review door, which the queue on this page lists and decides through; its own bearer check is the gate. */
const REVIEW = /^\/+api\/+kennel\/+v1\/+review\/*$/;

const PAGES: Readonly<Record<string, { type: string; body: string }>> = {
  '/': { type: 'text/html; charset=utf-8', body: ADMIN_HTML },
  '/admin.js': { type: 'text/javascript; charset=utf-8', body: ADMIN_JS },
  '/admin.css': { type: 'text/css; charset=utf-8', body: ADMIN_CSS },
};

/**
 * Whether this request is for `admin.<PUBLIC_HOST>`: exactly that name, case-blind, any port. No `PUBLIC_HOST` is no
 * admin host, because `wrangler.jsonc` declares a var as `""` before an environment fills it.
 */
export const isAdminHost = (request: Request, publicHost: string | undefined): boolean => {
  const host = (publicHost ?? '').trim().toLowerCase();
  if (host === '') return false;
  let name: string;
  try {
    name = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return name === `admin.${host}`;
};

const answer = (status: number, body: string | null, type: string, extra: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { ...ADMIN_HEADERS, 'content-type': type, ...extra } });

/**
 * The admin host's answer, or `null` for an operator door the router serves. `GET` and `HEAD` read the page, the
 * script and the style; any other method is 405; any other path is a plain 404.
 */
export function serveAdmin(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  if (OPS.test(path) || REVIEW.test(path)) return null;
  const head = request.method === 'HEAD';
  if (request.method !== 'GET' && !head) return answer(405, 'This page is only read.', 'text/plain; charset=utf-8', { allow: 'GET, HEAD' });
  const page = PAGES[path];
  if (page === undefined) return answer(404, head ? null : 'Not found.', 'text/plain; charset=utf-8');
  return answer(200, head ? null : page.body, page.type);
}
