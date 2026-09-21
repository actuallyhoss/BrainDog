/**
 * Opening an invitation link: `POST /auth/invite`. `12 §3`, `30 §5`.
 *
 * THE LINK IS `<origin>/invite#<token>`, and the token lives in the fragment, as a sign-in link's does, so it never
 * reaches a server log, a proxy or a `Referer`. The page reads the fragment, clears it, and posts the token here.
 *
 * THREE WAYS THROUGH, and which one is decided by who is already here:
 *
 *   1. Somebody signed in. Their address must be the invitation's, and they go on the record.
 *   2. Nobody signed in, and the address already has a sign-in on this host. They sign in first and open the link
 *      again, because a link that signed somebody in as an existing person would be a way into their other records.
 *   3. Nobody signed in, and the address is new here. The person is made, with the name the page sent if it sent
 *      one, put on the record and given a session, and the page asks them to add a passkey so they can come back.
 *
 * NOTHING HERE LOGS, and nothing is mailed. The token is in one request body and nowhere else.
 *
 * NO VALUE IS IMPORTED FROM `auth.ts`, which imports this file, for the reason `device.ts` gives.
 */

import type { Auth, AuthResult, Methods, Refusal, Result, Who } from '@braindog/ports';

import type { AuthRoute } from './auth.ts';
import { httpStatus } from './index.ts';

/** The one flow. It is not an `AuthCall`: the Directory hears only the calls it already knows. */
export type InviteFlow = 'invite';

/** The route, as data, appended to `AUTH_ROUTES`. */
export const INVITE_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/invite', method: 'POST', flow: 'invite', on: 'both', needs: 'nothing', what: 'An invitation link, looked at or accepted: the person signed in, then put on the record it names.' },
];

/** The host's half: the record the token names, and the Directory. In process on the self-host. */
export type InviteDoor = {
  /** The live invitation behind a token: the address it is for, and when it runs out. */
  look(token: string): Promise<Result<{ email: string; expires_at: string }>>;
  /** Spend it for a verified person, and give them the record in the Directory. */
  accept(token: string, person: { id: string; email: string }): Promise<Result<unknown>>;
  /** Whether this address can already sign in here, and so must, before a link is spent for it. */
  known(email: string): Promise<boolean>;
  /**
   * The Directory's person for a new address, made now, under the name the page sent if it sent one.
   *
   * THE NAME REACHES THE ROW ONLY WHERE THE ROW IS BEING MADE. `person$` returns the row it finds before it
   * looks at the name it was handed (`packages/record/src/directory.ts:650`), so every later invitation for the
   * same address is a lookup and the name on it is dropped. Measured against a real Directory: somebody who has
   * since named themselves keeps their name, and somebody still unnamed is left unnamed rather than named by
   * whatever a second invitation typed. An invitation is somebody else's typing about a person, so a name that
   * arrives after the row exists is not written here at all.
   */
  person(email: string, name?: string): Promise<Result<{ id: string; email: string }>>;
};

/** The part of a host's `AuthDoor` this route reads. */
type Door = { on: 'selfhost' | 'worker'; ip: string; auth: Auth; invite?: InviteDoor | undefined };

type Header = readonly [string, string];

const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

function reply(status: number, payload: object): Response {
  const headers = new Headers();
  for (const [k, v] of HEADERS) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal): Response => reply(status, { ok: false, refusal: refused });

/** What the page is told before anybody accepts: the address, when it runs out, and who is signed in. */
export type InviteSeen = { email: string; expires_at: string; signedInAs: string | null };

/**
 * Answer `/auth/invite`. `serveAuth` has matched the route, checked the origin and read the body, and has already
 * turned away a host that holds no sessions.
 *
 * `finish` IS `serveAuth`'s OWN ANSWER, so a session this sets, or rotates, reaches the cookie by the one path every
 * other sign-in does. `{ accept: true }` accepts; anything else only looks.
 */
export async function serveInvite(
  body: Record<string, unknown>,
  sid: string | undefined,
  door: Door,
  finish: (out: AuthResult) => Response,
): Promise<Response> {
  const invite = door.invite;
  if (!invite) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not take invitations.' });

  const token = typeof body.inviteToken === 'string' ? body.inviteToken : '';
  if (!token) return refusal(400, { code: 'REQUIRED_MISSING', fix: 'Open the whole invitation link, as it was sent.', at: 'inviteToken' });

  const found = await invite.look(token);
  if (!found.ok) return reply(httpStatus(found), found);
  const { email, expires_at } = found.value;

  const seen = sid === undefined ? null : await door.auth({ flow: 'session', sid });
  const live = seen !== null && seen.status === 200 ? (seen as Extract<AuthResult, { status: 200 }>) : null;
  const who = live ? (live.body as Who) : null;

  if (body.accept !== true) {
    const value: InviteSeen = { email, expires_at, signedInAs: who?.email ?? null };
    return live ? finish({ ...live, body: value }) : reply(200, { ok: true, value });
  }

  /* 1. SIGNED IN: the address is the invitation's or nothing happens, and the link is not spent. */
  if (live && who) {
    if (who.email.toLowerCase() !== email.toLowerCase())
      return refusal(403, { code: 'FORBIDDEN', fix: 'This invitation is for another address. Sign out, then open the link again.', at: 'email' });
    const out = await invite.accept(token, { id: who.person, email: who.email });
    if (!out.ok) return reply(httpStatus(out), out);
    return finish({ ...live, body: who });
  }

  /* 2. AN ADDRESS THAT CAN ALREADY SIGN IN HERE signs in first. */
  if (await invite.known(email))
    return refusal(401, { code: 'UNAUTHORIZED', fix: 'You already have a sign-in here. Sign in first, then open this link again.', at: 'session' });

  /* 3. A NEW PERSON, and only where sign-in is on and a second person breaks nothing. On a self-host the server key
     signs in only while one person exists, so an owner with no passkey yet would be locked out by this. */
  const ways = await door.auth({ flow: 'methods' });
  const m = ways.status === 200 ? (ways.body as Methods) : null;
  if (!m?.configured) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not take invitations.' });
  if (door.on === 'selfhost' && m.key && m.firstRun)
    return refusal(409, {
      code: 'FORBIDDEN',
      fix: 'The owner needs to add a passkey before anybody else can join. Ask them to add one in Settings, then open this link again.',
      at: 'passkey',
    });

  /* TRIMMED, AND AN EMPTY ONE IS NO NAME AT ALL. The column is NULL for everybody invited by address alone, and a
     screen asks it "is there a name" before it draws one, so a name of spaces would answer yes and draw nothing.
     Anything that is not a string is a page sending the wrong shape, which is not a name either. */
  const asked = typeof body.name === 'string' ? body.name.trim() : '';
  const made = await invite.person(email, asked || undefined);
  if (!made.ok) return reply(httpStatus(made), made);
  const out = await invite.accept(token, { id: made.value.id, email: made.value.email });
  if (!out.ok) return reply(httpStatus(out), out);

  /* THE SESSION IS A CLAIM LINK SPENT AT ONCE, in the Directory, by the same two calls a provisioned owner's first
     sign-in makes. The claim token goes from one call to the next and is never answered, mailed or logged. */
  const claim = await door.auth({ flow: 'claim.mint', email: made.value.email });
  if (claim.status !== 200 || !claim.mail || !('claimToken' in claim.mail)) return finish(claim);
  return finish(await door.auth({ flow: 'magic.redeem', claimToken: claim.mail.claimToken, ip: door.ip }));
}
