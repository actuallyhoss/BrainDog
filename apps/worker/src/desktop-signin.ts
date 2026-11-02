/**
 * A BrainDog app's way back from a sign-in finished somewhere else: `POST /auth/desktop/handoff` and `POST /auth/desktop`
 * for the Mac app as it always was, and the same pair as `POST /auth/app/handoff` and `POST /auth/app` for both apps,
 * the iPhone's and the Mac's (`DesktopFlow` in `packages/host/src/auth.ts`, docs/55-DESKTOP-APP.md).
 *
 * `/auth/app` OPENS AN APP SESSION. It is `/auth/desktop` with a device label (`label`, "iPhone, BrainDog app"): the
 * session it opens is listed under that label in Settings, never rotates on read, and is renewed by the app with
 * `/auth/app/refresh`. ON THE IPHONE THE LINK OPENS THE APP ITSELF, as a universal link (`apple.ts`), so the app reads
 * the link and posts the handoff and the swap itself, and no browser is between them.
 *
 * AN EMAILED LINK OPENS IN THE DEFAULT BROWSER, NOT IN THE APP THAT ASKED FOR IT. So the app's window keeps a PKCE
 * verifier and sends its challenge with the link request (`app` beside `next`), and the mailed link carries it as
 * `?app=`. The page that link opens in the browser does not spend it: on a press it posts the link and the challenge to
 * `handoff`, which seals the unspent link to that challenge as the same two-minute code Google's desktop flavour makes
 * (`desktopCode` in `google.ts`), and the page sends the browser to `braindog://auth?code=`. The app loads
 * `/signin/desktop?code=`, whose window posts the code and its verifier to `/auth/desktop`, and that spends the link and
 * sets the cookie in the app.
 *
 * WHAT KEEPS IT SAFE IS WHAT KEEPS GOOGLE'S SAFE. ONE USE: the link inside the code is spent once by the Directory, and
 * the code dies with it. SHORT-LIVED: the code is good for two minutes, and the link for its own life. BOUND TO THE
 * WINDOW THAT ASKED: the code opens only with the verifier whose hash is the challenge, and that verifier never left the
 * app's window. Handing off asks for nothing a person holding the link does not already have: the link alone signs
 * in wherever it is spent, so sealing it to somebody's challenge gives them no more than the link did.
 *
 * NO SESSION TOKEN IS EVER IN AN ADDRESS: the link token travels sealed, and the cookie is set by the window's own POST.
 */

import { sameOrigin } from '@braindog/host/auth';

import { desktopCode, exchange, type SwapDoor } from './google.ts';

/** The four routes and the one method each answers, as `AUTH_ROUTES` declares them. */
export const DESKTOP_ROUTES = { '/auth/desktop': 'POST', '/auth/desktop/handoff': 'POST', '/auth/app': 'POST', '/auth/app/handoff': 'POST' } as const;

export type DesktopDoor = SwapDoor & { now?: () => number };

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** A link token as the Directory mints one: base64url, 32 random bytes; a little room either way, and nothing else. */
const LINK = /^[A-Za-z0-9_-]{16,128}$/;

function reply(status: number, body: object): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function serveDesktop(request: Request, path: keyof typeof DESKTOP_ROUTES, door: DesktopDoor): Promise<Response> {
  const want = DESKTOP_ROUTES[path];
  if (request.method !== want) return new Response(null, { status: 405, headers: { allow: want, 'cache-control': 'no-store' } });
  const now = (door.now ?? Date.now)();
  if (path === '/auth/desktop') return exchange(request, door, now);
  if (path === '/auth/app') return exchange(request, door, now, true);

  /* THE HANDOFF: a page on this origin, a link and a challenge in the shapes they are made in, and the secret to seal with. */
  if (!sameOrigin(request, door.origin) || (door.secret ?? '').length < 32) return reply(403, { ok: false });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return reply(400, { ok: false });
  const body = (await request.json().catch(() => null)) as { linkToken?: unknown; challenge?: unknown } | null;
  const link = body?.linkToken;
  const challenge = body?.challenge;
  if (typeof link !== 'string' || typeof challenge !== 'string' || !LINK.test(link) || !CHALLENGE.test(challenge)) return reply(400, { ok: false });
  return reply(200, { ok: true, value: { code: await desktopCode(door.secret as string, link, challenge, now) } });
}
