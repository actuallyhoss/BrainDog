/**
 * Sign-in over HTTP, for both hosts: the route table, the cookie, and the loop that answers `/auth/*`.
 * `12 §3` row 49, `33 §4`, `49 §5.4` to `§5.10`, `51 §5.8`.
 *
 * THE CONTRACT, IN ONE PLACE, because the web app, the self-host and the Worker all read it:
 *
 *   Paths    `/auth/` and the `AuthCall` flow with its dots as slashes, except `key.exchange`, which is
 *            `POST /auth/token` (`49 §5.7`), and `provision`, which is the operator's and not a flow.
 *            `AUTH_ROUTES` below is the table, and a test pins every row.
 *   In       JSON. A POST needs `content-type: application/json` and `sameOrigin`, except the two
 *            operator routes, which take `Authorization: Bearer <PROVISION_KEY>` instead. The fields are
 *            the `AuthCall`'s: `{ serverKey }`, `{ credential, label? }`, `{ credential }`, `{ email }`,
 *            `{ linkToken }` or `{ claimToken }`, `{ id }`, `{ id, label }`, `{ keep }`; provision takes `{ slug, email, name? }`.
 *   200      `{ ok: true, value }`, the value being `AuthBodies[flow]`; `/auth/methods` answers `MethodsBody`.
 *   202      `/auth/invite` alone: `{ ok: true, value: { proving: true, to } }`, a new address mailed its proof.
 *            A host that sends no mail answers that path 501 `NOT_IN_THIS_BUILD` instead (`invite.ts`).
 *   Refused  `{ ok: false, refusal: { code, fix, at? } }` at 400, 401, 403, 404, 405 or 422, with codes
 *            already in `REFUSAL_CODES`. Every sign-in that does not sign somebody in is 401
 *            `UNAUTHORIZED`, "That did not sign you in." The one 401 that is not a failed sign-in carries
 *            `reason: 'stale'` beside its refusal: the session is good and its last proof is more than
 *            fifteen minutes old, so the page signs in again rather than telling somebody they failed.
 *   429      a `Retry-After` header in seconds, and `{ ok: false, retryAfter }`. The operator's key is
 *            locked out the same way: ten wrong keys from one address, then fifteen minutes of 429.
 *   503      `{ ok: false }`: the lockout's store failed, and a lockout that cannot count refuses.
 *   Cookie   `__Host-bd_s` on https, `bd_s` on http at a loopback name, and none on any other http
 *            origin, where `/auth/methods` says `why: 'insecure'`. One opaque id; the record is on the row.
 *   Links    `${origin}/signin#magic=<token>` and `#claim=<token>`, redeemed by `POST /auth/magic/redeem`.
 *            A fragment never reaches a server, a log or a link pre-fetcher, and a press is what spends it.
 *            `/auth/magic/start` also reads `next`, the one field that is the host's and not the call's: a
 *            path of the app on this origin (`appNext`) goes in the link as `?next=<path>`, before the fragment;
 *            and `app`, the Mac app's PKCE challenge, goes in as `?app=` so the page hands the link back to it.
 *
 * STANDARD `Request`, `Response` AND WEBCRYPTO, like the rest of this package, so the Worker and the
 * self-host run this file unchanged. Neither adds a sign-in route, and neither answers one differently.
 *
 * NOTHING HERE LOGS, AND NOTHING ECHOES. A cookie value, a token, a key and an address arrive in a request
 * and leave, at most, as the one cookie or the one link they exist to become.
 */

import type { AccountCall, AccountClosed, AssertionJSON, Auth, AuthCall, AuthFlow, AuthResult, Mail, Methods, RegistrationJSON, Refusal, Result, Who } from '@braindog/ports';
import type { Wheres } from '@braindog/kernel';
import { FRESH } from '@braindog/record';

import { DEVICE_ROUTES, serveDevice, type DeviceDoor, type DeviceFlow } from './device.ts';
import { INVITE_ROUTES, personName, serveInvite, type InviteDoor, type InviteFlow } from './invite.ts';
import { httpStatus } from './index.ts';

export { DEVICE_ROUTES, type DeviceAsk, type DeviceDoor, type DeviceFlow, type DeviceStarted } from './device.ts';
export { INVITE_ROUTES, NO_MAIL, type InviteDoor, type InviteFlow, type InviteSeen } from './invite.ts';
export { personName } from './invite.ts';

/* ── the account ─────────────────────────────────────────────────────────── */

/**
 * One account route: where it is, which hosts serve it, and what it needs.
 *
 * `stripe` IS THE ONE NEED THAT READS NO COOKIE. Stripe's webhook carries no session and comes from no page, only a
 * signature over the body exactly as it was sent, so its door is handed the untouched `Request` and checks that
 * itself: a body read or parsed here first is a body the signature no longer has to match.
 *
 * `worker` ROWS ARE BILLING'S AND CLOSING'S, which a self-host has no use for. A host that serves a row answers it;
 * one that does not hand `serveAccount` the row's door answers 404, and the row stays one table for both.
 */
export type AccountRoute = { path: string; method: 'GET' | 'POST'; on: 'both' | 'worker'; needs: 'session' | 'stripe'; what: string };

/**
 * The routes that answer about a person's account rather than a record.
 *
 * THE DIRECTORY'S, LIKE SIGN-IN, and never a record's: usage is billing, and a record cannot see its own allowance.
 * A person sees the records they own and nothing of anybody else's.
 *
 * THE BILLING ROWS AND CLOSING ARE DECLARED BEFORE THEY ARE BUILT, so the code that
 * builds them writes a door and never a route. Until a host hands `serveAccount` that door, the
 * row answers 404 `ROUTE_UNKNOWN`, which is what a path nobody serves already answered.
 */
export const ACCOUNT_ROUTES: readonly AccountRoute[] = [
  { path: '/account/usage', method: 'GET', on: 'both', needs: 'session', what: 'What the BrainDogs you own used between two days, and each month so far against its allowance.' },
  /* THE SWITCHER'S INDEX, and not an authorisation: every open record this person can REACH, by
     the level they actually hold there. `usage` above answers for records this person OWNS; this
     answers for every one they can open at all, which is the wider question the sidebar asks. */
  { path: '/account/records', method: 'GET', on: 'both', needs: 'session', what: 'Which records you can reach, each with its name and the level you hold there.' },
  { path: '/account/billing', method: 'GET', on: 'worker', needs: 'session', what: 'Each BrainDog you own, whether it is paid for, and whether this host takes payment at all.' },
  { path: '/account/billing/checkout', method: 'POST', on: 'worker', needs: 'session', what: 'A payment page for a new record, `{ slug, name?, tz?, plan? }`, for paying again, `{ record, plan? }`, or for Slash credits, `{ record, pack }`.' },
  { path: '/account/billing/portal', method: 'POST', on: 'worker', needs: 'session', what: 'The page the payment provider keeps for a BrainDog you own, `{ record }`, or `{ record, plan }` to switch its plan.' },
  { path: '/account/billing/invoices', method: 'POST', on: 'worker', needs: 'session', what: 'The newest invoices for a BrainDog you own and pay for, `{ record }`, each with its own page at the payment provider.' },
  { path: '/account/billing/extra', method: 'POST', on: 'worker', needs: 'session', what: 'Extra usage past the allowance for a paid record you own, under a monthly cap: `{ record, cap_cents }`, 0 turning it off.' },
  { path: '/account/billing/webhook', method: 'POST', on: 'worker', needs: 'stripe', what: 'The payment provider saying a payment happened, signed over the body as it was sent.' },
  { path: '/account/close', method: 'POST', on: 'worker', needs: 'session', what: 'Close your account, `{ email }` typed to confirm, from a sign-in in the last fifteen minutes.' },
  /* THE WAY BACK FROM A LOST MAILBOX, with the operator's claim link: sign in by passkey or claim link, then change the
     address. Both hosts, because a self-host's person loses a mailbox as easily; a host with no way to send mail is
     handed no door and answers 404, as for every row. */
  { path: '/account/email', method: 'POST', on: 'both', needs: 'session', what: 'Change the address you sign in with, `{ email }`: a link good for a day is mailed to the new address, and nothing moves until it is pressed.' },
  { path: '/account/email/confirm', method: 'POST', on: 'both', needs: 'session', what: 'Press the mailed link, `{ token }`, from a sign-in in the last fifteen minutes: the address moves in every record you belong to.' },
];

/** A door a signed-in person's POST reaches: who they are, and the JSON object they sent. */
export type AccountAsk = (who: Who, body: Record<string, unknown>) => Result<unknown> | Promise<Result<unknown>>;

/**
 * What a host hands `serveAccount`: its origin, the Directory's sign-in or `null` where nobody signs in, the ledger,
 * and the doors of the rows it serves.
 *
 * A DOOR LEFT OUT IS A ROW THIS HOST DOES NOT SERVE, answered 404. The self-host leaves out every billing door and
 * `close`, because it bills nobody and closes no account; the Worker hands them in as each is built.
 *
 * `who` AND NOT A PERSON ID for the new doors, because two of them need more than the id: closing needs `provedAt`
 * for its fifteen minutes and `email` for the address typed to confirm, and a checkout needs the address the payment
 * provider mails a receipt to.
 */
export type AccountDoor = {
  origin: string;
  auth: Auth | null;
  usage: (person: string, range: { from: string; to: string }) => Result<unknown> | Promise<Result<unknown>>;
  /** `/account/records`: every open record this person can reach, each `{ slug, name, level }`. */
  records: (person: string) => Result<unknown> | Promise<Result<unknown>>;
  /** `GET /account/billing`: `{ records, open }`. */
  billing?: ((who: Who) => Result<unknown> | Promise<Result<unknown>>) | undefined;
  /** `POST /account/billing/checkout`: `{ url }` of a payment page. */
  checkout?: AccountAsk | undefined;
  /** `POST /account/billing/portal`: `{ url }` of the provider's page for a record this person owns. */
  portal?: AccountAsk | undefined;
  /** `POST /account/billing/invoices`: `{ invoices }`, the newest invoices of the customer a record this person owns pays as. */
  invoices?: AccountAsk | undefined;
  /** `POST /account/billing/extra`: `{ record, extra }`, the record's extra usage under the cap just set. */
  extra?: AccountAsk | undefined;
  /** `POST /account/close`: the account closed, after the checks the door makes. */
  close?: AccountAsk | undefined;
  /**
   * `POST /account/billing/webhook`: the request as it arrived, answered whole by the door.
   *
   * THE DOOR WRITES ITS OWN RESPONSE, status and body, because the provider reads the status and nothing else, and
   * it must be able to answer 400 to a bad signature before anything here has an opinion about the body.
   */
  webhook?: ((request: Request) => Promise<Response>) | undefined;
  /** `POST /account/email` and `/account/email/confirm`: the Directory's halves, each record's mirror, and the mail. */
  email?: EmailDoor | undefined;
};

/* ── a person's own name and sign-in address ───────────────────────────────────────────────────────────────────── */

/**
 * What moves in a person's mirror in each record: a new name, a new sign-in address, or both.
 *
 * A RENAME CARRIES THE ADDRESS TOO, the Directory's as it stands, so a record that could not be reached when the address
 * last moved catches up the next time the person changes either (`mirrorEverywhere`). The kernel writes only what
 * differs, so a record already in line writes nothing for the value it already held.
 */
export type PersonChange = { name?: string | undefined; email?: string | undefined };

/**
 * What a host hands the two email routes.
 *
 * `ask` AND `move` ARE THE DIRECTORY'S (`emailAsk` and `emailMove` in `packages/record/src/directory.ts`): the link is
 * minted and spent there, and the address moves there first. `mirror` is one record's `mirrorPerson`, reached however
 * the host reaches a record (over RPC on the Worker, in the same process on a self-host). `mail` sends one of the two
 * letters (`email.change` with the link, `email.changed` to the old address) and must not throw; it is not awaited, so
 * the answer never waits for a mail server.
 */
export type EmailDoor = {
  /** `token` is `null` for an address somebody else signs in with: nothing is mailed, and the answer is the same (SEC6). */
  ask: (person: string, email: string) => Promise<Result<{ to: string; token: string | null }>>;
  move: (person: string, token: string) => Promise<Result<{ from: string; to: string; records: string[] }>>;
  mirror: (record: string, person: string, change: PersonChange) => Promise<Result<unknown>>;
  mail: (kind: 'email.change' | 'email.changed', to: string, link?: string) => void;
  /** The clock `FRESH` is read against. Absent, it is the platform's own. */
  now?: (() => number) | undefined;
};

/**
 * The most records one change is carried into, in order of joining. A person on more than this is told how many were
 * not reached, and the rest keep the old value in their mirror until the next change, rather than one request walking
 * an unbounded list of objects.
 */
export const MIRROR_RECORDS_MOST = 200;

/** What carrying one change into a person's records came to: how many took it, and how many could not be reached. */
export type Mirrored = { reached: number; unreached: number };

/**
 * One change, carried into every record in `records`, one at a time.
 *
 * NEVER SKIPPED SILENTLY. A record that refused, threw or was past `MIRROR_RECORDS_MOST` is counted in `unreached`, and
 * the screen says how many still show the old value. The Directory has already moved, so the person signs in with the
 * new address everywhere; what an unreached record keeps is its own copy of who they are, which the next change of
 * name or address carries in again, since a rename carries the Directory's address with it (`PersonChange`).
 */
export async function mirrorEverywhere(records: readonly string[], mirror: (record: string) => Promise<Result<unknown>>): Promise<Mirrored> {
  let reached = 0;
  let unreached = Math.max(0, records.length - MIRROR_RECORDS_MOST);
  for (const record of records.slice(0, MIRROR_RECORDS_MOST)) {
    try {
      if ((await mirror(record)).ok) reached++;
      else unreached++;
    } catch {
      unreached++;
    }
  }
  return { reached, unreached };
}

/** Whether a request is the record's `renamePerson`, under either base: `/api/...` or `/<slug>/api/...`. */
export const renameAsked = (method: string, pathname: string): boolean => method === 'POST' && /\/api\/+renamePerson\/*$/.test(pathname);

/**
 * The name a record kept, read from a copy of its answer to `renamePerson`, or `null` when it kept none.
 *
 * THE HOST FOLLOWS A RENAME THE RECORD ACCEPTED with the Directory's `renamePerson` and `mirrorEverywhere` over the
 * person's other records, as it follows a removal with the Directory's `leave`: the record's answer is what says the
 * name was good, so nothing is written anywhere else unless it was.
 */
export async function renamedName(answer: Response): Promise<string | null> {
  if (answer.status !== 200) return null;
  try {
    const body = (await answer.json()) as { ok?: unknown; value?: { name?: unknown } } | null;
    return body?.ok === true && typeof body.value?.name === 'string' ? body.value.name : null;
  } catch {
    return null;
  }
}

/**
 * `POST /account/email`: a link to the new address, and `{}` whatever it was, so the answer never carries the link.
 *
 * `{}` FOR AN ADDRESS SOMEBODY ELSE SIGNS IN WITH TOO, AND NO MAIL (SEC6). It was refused in its own sentence, which
 * told any session, a guest's included, who has an account here. And a sign-in in the last fifteen minutes is asked for
 * at this step as it is at the confirming one, so a session left open on a shared screen cannot start the move.
 */
async function emailAsked(door: EmailDoor, origin: string, who: Who, body: Record<string, unknown>): Promise<Result<unknown>> {
  const now = door.now ?? Date.now;
  if (now() - who.provedAt > FRESH)
    return {
      ok: false,
      refusal: {
        code: 'NEEDS_BROWSER_SESSION',
        fix: 'Sign in again to change your sign-in email. It has been more than fifteen minutes since you last did.',
        at: 'proof',
      },
    };
  const typed = text(body.email).trim();
  if (typed === '') return { ok: false, refusal: { code: 'REQUIRED_MISSING', fix: 'Type the new address you want to sign in with.', at: 'email' } };
  const out = await door.ask(who.person, typed);
  if (!out.ok) return out;
  if (out.value.token === null) return { ok: true, value: {} };
  /* THE LANDING IS IDENTITY, IN WHICHEVER RECORD THE SESSION IS ON (`/settings/...` names none), and the token is
     in the fragment, which no server, proxy or `Referer` ever reads, as a sign-in link's is. */
  door.mail('email.change', out.value.to, `${origin}/settings/identity#email=${out.value.token}`);
  return { ok: true, value: {} };
}

/**
 * `POST /account/email/confirm`: the link spent, the address moved in the Directory and then in every record the person
 * belongs to, and one line to the old address saying so.
 *
 * FRESH FIRST, BEFORE THE LINK IS SPENT. Moving the address is taking over the account's way in, so a session left
 * signed in for a month is asked to sign in again (`FRESH`), and the link still works when they come back to it.
 */
async function emailConfirmed(door: EmailDoor, who: Who, body: Record<string, unknown>): Promise<Result<unknown>> {
  const now = door.now ?? Date.now;
  if (now() - who.provedAt > FRESH)
    return {
      ok: false,
      refusal: {
        code: 'NEEDS_BROWSER_SESSION',
        fix: 'Sign in again to finish changing your sign-in email, then open the link once more. It has been more than fifteen minutes since you last did.',
        at: 'proof',
      },
    };
  const moved = await door.move(who.person, text(body.token).trim());
  if (!moved.ok) return moved;
  const { to, from, records } = moved.value;
  const { unreached } = await mirrorEverywhere(records, (record) => door.mirror(record, who.person, { email: to }));
  door.mail('email.changed', from);
  return { ok: true, value: { email: to, unreached } };
}

/** A row this host does not serve: the same answer as a path that is no row at all. */
const unserved = (): Response => refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'There is no account route at that address.' });

/* ── closing an account ─────────────────────────────────────────────────────────────────────────────────────── */

/** The most owned records the close door asks for their other owners; past it the account is not closed. */
export const CLOSE_RECORDS_MOST = 200;

/** What the close door needs from its host: each record's owners, the Directory's half, and the letter. */
export type CloseDeps = {
  /**
   * The names of the open records this person owns with nobody else as owner. Each record answers for itself, since
   * who owns it is its own `member` table and not the Directory's. A host that could not ask every one names the
   * rest, so the door refuses rather than closing past a record nobody would then own.
   */
  alone: (who: Who) => Promise<string[]>;
  /** The Directory's `account.close`, asked only after every check below has passed. */
  close: (call: AccountCall) => Promise<AuthResult<AccountClosed>>;
  /** The `sessions.ended` letter. It must not throw, and the answer never waits for it. */
  mail: (to: string) => void;
  now: () => number;
};

/**
 * `POST /account/close`: `{ email }` typed to confirm, from a session proved in the last fifteen minutes (`FRESH`).
 *
 * REFUSED WHILE THEY ARE A RECORD'S ONLY OWNER. Closing would leave that record with nobody who can pay for it, invite
 * to it or delete it, so the person is told which one and the two ways out of that. Every other record
 * keeps its own history of them, which its owner can erase (`erase` in the kernel).
 *
 * THE LETTER GOES TO THE ADDRESS THE SESSION READ, once the Directory has answered. That address is in hand before the
 * Directory forgets it, and sending only after a close that happened means nobody is told they were signed out by a
 * close that failed.
 */
export function closeDoor(deps: CloseDeps): AccountAsk {
  return async (who, body) => {
    if (deps.now() - who.provedAt > FRESH)
      return {
        ok: false,
        refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Sign in again to close your account. It has been more than fifteen minutes since you last did.', at: 'proof' },
      };
    const typed = text(body.email).trim().toLowerCase();
    if (typed === '' || typed !== who.email.trim().toLowerCase())
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'Type the address you sign in with, as it is, to close your account.', at: 'email' } };
    const alone = await deps.alone(who);
    if (alone.length > 0) return { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix: `Delete ${alone[0]}, or make somebody else its owner, first.`, at: 'records' } };
    const out = await deps.close({ flow: 'account.close', person: who.person });
    if (out.status !== 200)
      return { ok: false, refusal: 'refusal' in out ? out.refusal : { code: 'RECORD_UNAVAILABLE', fix: 'Your account could not be closed just now. Try again in a minute.' } };
    deps.mail(who.email);
    return { ok: true, value: out.body };
  };
}

/** What one row does once the session is known, or `null` where this host was handed no door for it. */
type Asked = (who: Who, body: Record<string, unknown>, url: URL) => Result<unknown> | Promise<Result<unknown>>;

function askedOf(path: string, door: AccountDoor): Asked | null {
  const { billing, checkout, portal, invoices, extra, close, email } = door;
  switch (path) {
    case '/account/usage':
      return (who, _body, url) => door.usage(who.person, { from: url.searchParams.get('from') ?? '', to: url.searchParams.get('to') ?? '' });
    case '/account/records':
      return (who) => door.records(who.person);
    case '/account/billing':
      return billing ? (who) => billing(who) : null;
    case '/account/billing/checkout':
      return checkout ? (who, body) => checkout(who, body) : null;
    case '/account/billing/portal':
      return portal ? (who, body) => portal(who, body) : null;
    case '/account/billing/invoices':
      return invoices ? (who, body) => invoices(who, body) : null;
    case '/account/billing/extra':
      return extra ? (who, body) => extra(who, body) : null;
    case '/account/close':
      return close ? (who, body) => close(who, body) : null;
    case '/account/email':
      return email ? (who, body) => emailAsked(email, door.origin, who, body) : null;
    case '/account/email/confirm':
      return email ? (who, body) => emailConfirmed(email, who, body) : null;
    default:
      return null;
  }
}

/** The one sentence a signed-out request is told, by what it was trying to see or do. */
function signInFor(path: string): string {
  if (path === '/account/records') return 'Sign in to see which records you can reach.';
  if (path === '/account/usage') return 'Sign in to see what your BrainDogs used.';
  if (path === '/account/close') return 'Sign in to close your account.';
  if (path.startsWith('/account/email')) return 'Sign in to change the address you sign in with, then open the link again.';
  return 'Sign in to see billing for the BrainDogs you own.';
}

/**
 * Answer one `/account/*` request.
 *
 * THE SESSION COOKIE AND NOTHING ELSE, EXCEPT FOR THE WEBHOOK. A bearer is an agent or the server key, and neither
 * is a person with an account. No cookie, a host where nobody signs in, or a session that has ended is 401
 * `UNAUTHORIZED`. The webhook is the payment provider, which has no cookie, and it is handed on before anything
 * here reads the request.
 *
 * A POST IS A PAGE ON THIS ORIGIN SENDING JSON, as every sign-in POST is: the cookie rides on any request a browser
 * makes, so a page elsewhere that could POST here would be spending somebody's session on a checkout or a closing.
 */
export async function serveAccount(request: Request, door: AccountDoor): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const route = ACCOUNT_ROUTES.find((r) => r.path === path);
  if (!route) return unserved();
  if (request.method !== route.method)
    return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `${route.path} takes a ${route.method}.` }, [['allow', route.method]]);

  /* UNTOUCHED: no cookie read, no origin asked, no byte of the body consumed. */
  if (route.needs === 'stripe') return door.webhook ? door.webhook(request) : unserved();

  const asked = askedOf(path, door);
  if (asked === null) return unserved();

  let body: Record<string, unknown> = {};
  if (route.method === 'POST') {
    if (!sameOrigin(request, door.origin))
      return refusal(403, { code: 'FORBIDDEN', fix: `Your account is answered only for pages on ${door.origin}.`, at: 'origin' });
    const parsed = isJson(request) ? await objectOf(request) : null;
    if (!parsed) return refusal(400, { code: 'BODY_MALFORMED', fix: `${route.path} takes a JSON object, sent as application/json.` });
    body = parsed;
  }

  const mode = cookieMode(door.origin);
  const sid = mode === null ? undefined : readSid(request, mode);
  if (!door.auth || mode === null || sid === undefined) return refusal(401, { code: 'UNAUTHORIZED', fix: signInFor(path) });
  const seen = await door.auth({ flow: 'session', sid });
  if (seen.status !== 200) return answered(seen, mode);

  /* A ROTATION REACHES THE COOKIE whatever the row below answers. */
  const kept: Header[] = seen.session === undefined ? [] : [['set-cookie', seen.session === 'clear' ? clearCookie(mode) : sessionCookie(seen.session.sid, mode)]];
  const out = await asked(seen.body as Who, body, url);
  /* A CLOSED ACCOUNT HAS NO SESSION LEFT, so the cookie that named one is cleared on the same answer. */
  if (path === '/account/close' && out.ok) return reply(200, out, [['set-cookie', clearCookie(mode)]]);
  return reply(out.ok ? 200 : httpStatus(out), out, kept);
}

/**
 * The three sign-up flows, declared here before the Directory has them.
 *
 * THEIR ROWS COME BEFORE THEIR FLOWS: the table is fixed
 * now so the sign-up screen is written against it, and until the `AuthCall` union names these three, `serveAuth`
 * answers each row as a way in this host does not offer.
 */
export type SignupFlow = 'signup.start' | 'signup.verify' | 'signup.name';

const SIGNUP: ReadonlySet<string> = new Set<SignupFlow>(['signup.start', 'signup.verify', 'signup.name']);

/**
 * The two halves of signing in with Google, which are routes and never Directory flows.
 *
 * THE WORKER ANSWERS BOTH ITSELF (`apps/worker/src/google.ts`): Google proves the address, and the Directory is asked
 * for a sign-in link and has it spent, through the two `magic` flows it already has. A self-host has no Google
 * client, so `serveAuth` answers each row as a way in this host does not offer.
 */
export type GoogleFlow = 'google.start' | 'google.callback' | 'google.desktop';

const GOOGLE: ReadonlySet<string> = new Set<GoogleFlow>(['google.start', 'google.callback', 'google.desktop']);

/**
 * The Mac app's way back from a sign-in finished in the browser, which are routes and never Directory flows.
 *
 * AN EMAILED LINK OPENS IN THE DEFAULT BROWSER, not in the app that asked for it. The app sends its PKCE challenge with
 * `magic.start` (`app` beside `next`), the link carries it (`?app=`), and the page the link opens hands the unspent link
 * to `desktop.handoff`, which seals it to that challenge as a one-time code for `braindog://auth?code=`. The app's
 * window then posts the code and its verifier to `desktop`, which spends the link and sets the cookie there. The
 * Worker answers both (`apps/worker/src/desktop-signin.ts`); a self-host has no Mac app to hand back to.
 */
export type DesktopFlow = 'desktop' | 'desktop.handoff';

const DESKTOP: ReadonlySet<string> = new Set<DesktopFlow>(['desktop', 'desktop.handoff']);

/** A PKCE S256 challenge, as the Mac app sends one: 43 characters of base64url, and nothing else is carried. */
const APP_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;


/** One sign-in route: where it is, who serves it, and what it needs. */
export type AuthRoute = {
  path: string;
  method: 'GET' | 'POST';
  /**
   * The `AuthCall` it becomes. `provision` is the one that is not a flow: it makes a record, then mints a claim.
   * The two device flows reach a record and never the Directory, and `device.ts` answers them.
   */
  flow: AuthFlow | 'provision' | DeviceFlow | InviteFlow | SignupFlow | GoogleFlow | DesktopFlow;
  /** The server key is the self-host's; provisioning and sign-up are the Worker's; everything else is both. */
  on: 'both' | 'selfhost' | 'worker';
  /** Nothing, the session cookie, or the operator's key. A route that needs a session still answers without one: 401. */
  needs: 'nothing' | 'session' | 'operator';
  what: string;
};

/**
 * Every sign-in route, as data, in the shape `ROUTES` has for `/api`.
 *
 * ONE ROW PER FLOW, AND THE FLOW THE PLAN DID NOT NAME GOT THE SAME RULE. `claim.mint` is in the `AuthCall`
 * union and is operator only, so it is `POST /auth/claim/mint` beside provision: a claim link that expired
 * before somebody opened it can be minted again without making a second record.
 *
 * EXCEPT THE TWO HALVES OF AN INVITATION'S PROOF, WHICH HAVE NO ROW AND MUST NOT. `invite.prove` trusts the host to
 * have looked the invitation up and to hand it the address that invitation was made for; routed on its own, it
 * would mail a proof to any address anybody typed. `/auth/invite` is the one door to both (`invite.ts`).
 */
export const AUTH_ROUTES: readonly AuthRoute[] = [
  { path: '/auth/methods', method: 'GET', flow: 'methods', on: 'both', needs: 'nothing', what: 'Which ways in this host offers, and who the cookie belongs to.' },
  { path: '/auth/session', method: 'GET', flow: 'session', on: 'both', needs: 'session', what: 'Who the cookie belongs to, or a 401 and the cookie cleared.' },
  { path: '/auth/token', method: 'POST', flow: 'key.exchange', on: 'selfhost', needs: 'nothing', what: 'The server key for a session, where this host has one person.' },
  { path: '/auth/passkey/register/options', method: 'POST', flow: 'passkey.register.options', on: 'both', needs: 'session', what: 'A challenge for a new passkey. A session stands in for attestation.' },
  { path: '/auth/passkey/register', method: 'POST', flow: 'passkey.register', on: 'both', needs: 'session', what: 'Keep the passkey the browser just made.' },
  { path: '/auth/passkey/assert/options', method: 'POST', flow: 'passkey.assert.options', on: 'both', needs: 'nothing', what: 'A challenge for signing in with a passkey.' },
  { path: '/auth/passkey/assert', method: 'POST', flow: 'passkey.assert', on: 'both', needs: 'nothing', what: 'Sign in with a passkey.' },
  { path: '/auth/magic/start', method: 'POST', flow: 'magic.start', on: 'both', needs: 'nothing', what: 'Send a sign-in link. An address nobody has gets the same answer and no mail.' },
  { path: '/auth/magic/redeem', method: 'POST', flow: 'magic.redeem', on: 'both', needs: 'nothing', what: 'Spend a sign-in or claim link, once.' },
  { path: '/auth/magic/whose', method: 'POST', flow: 'magic.whose', on: 'both', needs: 'nothing', what: 'The address of the account a sign-in or claim link opens, said before the press. Spends nothing.' },
  { path: '/auth/passkeys', method: 'GET', flow: 'passkeys', on: 'both', needs: 'session', what: 'Your passkeys, never their keys.' },
  { path: '/auth/passkey/remove', method: 'POST', flow: 'passkey.remove', on: 'both', needs: 'session', what: 'Remove one of your passkeys, the last one included.' },
  { path: '/auth/passkey/rename', method: 'POST', flow: 'passkey.rename', on: 'both', needs: 'session', what: 'Give one of your passkeys a name of your choosing. `{ id, label }`.' },
  { path: '/auth/logout', method: 'POST', flow: 'logout', on: 'both', needs: 'nothing', what: 'End this session and clear the cookie.' },
  { path: '/auth/sessions', method: 'GET', flow: 'sessions', on: 'both', needs: 'session', what: 'Every live session you have, this one marked, each by a short reference and never by its id.' },
  { path: '/auth/logout/all', method: 'POST', flow: 'logout.all', on: 'both', needs: 'session', what: 'End your other sessions, `{ keep: "this" }`, or every one of them, `{ keep: "none" }`.' },
  /* LOCK NOW, for the keychain (`12 §6.3`): the session's proof is put behind the keychain's longest window, so the next
     keychain act asks for a sign-in again and nothing else changes. A POST, as everything that changes a session is. */
  { path: '/auth/keychain/lock', method: 'POST', flow: 'keychain.lock', on: 'both', needs: 'session', what: 'Lock the keychain in this browser: its next use asks you to sign in again, and nothing else changes.' },
  { path: '/auth/switch', method: 'POST', flow: 'switch', on: 'both', needs: 'session', what: 'Open another BrainDog you are on, in this browser. `{ slug }`.' },
  { path: '/auth/signup/start', method: 'POST', flow: 'signup.start', on: 'worker', needs: 'nothing', what: 'Ask for a BrainDog of your own: a link is mailed to prove the address. `{ email, slug, name?, tz? }`.' },
  { path: '/auth/signup/verify', method: 'POST', flow: 'signup.verify', on: 'worker', needs: 'nothing', what: 'Spend the mailed link, once: the person is made and signed in. `{ token }`.' },
  { path: '/auth/signup/name', method: 'GET', flow: 'signup.name', on: 'worker', needs: 'nothing', what: 'Whether a name for a new record is free, `?slug=`, and why not when it is not.' },
  { path: '/auth/google/start', method: 'GET', flow: 'google.start', on: 'worker', needs: 'nothing', what: 'Send the browser to Google to say which address it is signed in as. `?next=` is where to land afterwards.' },
  { path: '/auth/google/callback', method: 'GET', flow: 'google.callback', on: 'worker', needs: 'nothing', what: 'Back from Google: an address somebody here has is signed in, and any other is sent to the sign-in page told why.' },
  { path: '/auth/google/desktop', method: 'POST', flow: 'google.desktop', on: 'worker', needs: 'nothing', what: 'The Mac app swaps the one-time code from `braindog://auth` and its PKCE verifier for the session cookie. `?desktop=1&challenge=` on the start asks for that flavour.' },
  { path: '/auth/desktop', method: 'POST', flow: 'desktop', on: 'worker', needs: 'nothing', what: 'The Mac app swaps a one-time code from `braindog://auth` and its PKCE verifier for the session cookie.' },
  { path: '/auth/desktop/handoff', method: 'POST', flow: 'desktop.handoff', on: 'worker', needs: 'nothing', what: 'A sign-in link the Mac app asked for, opened in a browser: sealed to the app\'s challenge as a one-time code, and not spent. `{ linkToken, challenge }`.' },
  { path: '/auth/claim/mint', method: 'POST', flow: 'claim.mint', on: 'worker', needs: 'operator', what: 'A new 24-hour claim link for somebody already provisioned.' },
  { path: '/auth/provision', method: 'POST', flow: 'provision', on: 'worker', needs: 'operator', what: 'A BrainDog, its Directory rows and a 24-hour claim link, handed to the operator.' },
  { path: '/auth/suspend', method: 'POST', flow: 'suspend', on: 'worker', needs: 'operator', what: 'Stop somebody signing in, `{ email }`, ending every session they hold, or let them in again, `{ email, suspended: false }`.' },
  ...DEVICE_ROUTES,
  ...INVITE_ROUTES,
];

/** Why `/auth/methods` offers nothing: no key to take the MACs under, or an origin no cookie can be set on. */
export type Why = 'not-configured' | 'insecure';

/**
 * What `/auth/methods` answers. The Directory says what it can do; the host adds what only it knows.
 *
 * `open` IS A SELF-HOST WITH NO SERVER KEY, where a request carrying nothing is the owner and there is no
 * session to have. `firstRun` is there whenever sign-in is.
 *
 * NO `demo`. A Worker with a pinned public record said so here, and the app offered a way into it; the public demo is
 * gone, so there is nothing to offer and the key is not sent. The web reads an absent
 * key as `false`, so an app older than this host draws the same screen.
 *
 * `magic: 'down'` IS A HOST THAT MEANS TO MAIL AND CANNOT: the Worker with no sender set, a Directory that
 * offers links on a host that gave `serveAuth` no `mail`, or `mailDown` saying the last sign-in letters all failed.
 * The screen then says mail is not going out, rather than that a link is on its way. It is the host's fault and never
 * an address's, so it says nothing about who has an account.
 */
export type MethodsBody = {
  passkey: boolean;
  magic: boolean | 'down';
  key: boolean;
  open: boolean;
  why?: Why;
  me: Who | null;
  firstRun?: boolean;
  /** This host has a Google client and can spend a sign-in link, so the screen offers the button. Absent is no. */
  google?: true;
  /**
   * THIS HOST SERVES `/auth/signup/*`, the Worker and nothing else: the app asks who may sign up only where it does, since
   * a self-host answers that door 404 and the browser printed it as an error on every sign-in (audit 31 Oct A29). Absent
   * is no, on any answer.
   */
  signup?: true;
};

/** The cookie's two names. `__Host-` pins it to this host, `/` and `Secure`, so no subdomain can plant one. */
export const COOKIE = { secure: '__Host-bd_s', local: 'bd_s' } as const;
export type CookieMode = keyof typeof COOKIE;

/** Ninety days, the session's own life, renewed by each daily rotation (`12 §3` row 49). The row expires on the server whatever the browser keeps. */
const MAX_AGE = 7_776_000;

const LOOPBACK = (host: string): boolean => host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';

/**
 * Which cookie an origin can hold: `secure` on https, `local` on http at a loopback name, `null` otherwise.
 *
 * NONE ON ANY OTHER HTTP ORIGIN, because a session cookie a network can read is a session anybody on it can
 * spend. A browser treats loopback as a secure context, which is what makes `bd_s` without `Secure` honest
 * there and nowhere else.
 */
export function cookieMode(origin: string): CookieMode | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol === 'https:') return 'secure';
  return url.protocol === 'http:' && LOOPBACK(url.hostname) ? 'local' : null;
}

/**
 * The WebAuthn relying party for an origin, or `null` where a browser will not run a ceremony.
 *
 * THE EXACT HOST UNLESS THE HOST NAMES A PARENT. A passkey made for `app.brain.dog` answers nothing at any other
 * name, which was the whole rule until the app moved to `brain.dog`:
 * production has no magic links, so the owner's first passkey, made at `app.brain.dog`, would have been his only
 * way in and would have stopped working on the day of the move. `rpId` is the Worker's `RP_ID`, and a passkey
 * made under `brain.dog` is offered at `app.brain.dog` and `brain.dog` alike.
 *
 * THE PARENT MUST BE THE HOST OR END IN `.` AND IT, AND HOLD A DOT OF ITS OWN. WebAuthn allows a registrable
 * suffix of the origin's host and a browser refuses anything else at the ceremony, so a name outside that is
 * answered here as no passkeys rather than as a button that fails in the browser: `rain.dog` ends
 * `app.brain.dog` as text and is somebody else's domain, and `dog` is a public suffix no browser accepts. Empty
 * is unset, because `wrangler.jsonc` declares a var as `""` before an environment fills it.
 *
 * An IP literal is not a valid RP ID, and an http origin that is not loopback is not a secure context.
 */
export function relyingParty(origin: string, rpId?: string): { id: string; origin: string } | null {
  if (cookieMode(origin) === null) return null;
  const url = new URL(origin);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.startsWith('[')) return null;
  const id = (rpId ?? '').trim().toLowerCase() || url.hostname;
  if (id === url.hostname) return { id, origin: url.origin };
  if (!id.includes('.') || id.startsWith('.') || !url.hostname.endsWith(`.${id}`)) return null;
  return { id, origin: url.origin };
}

/** The `Set-Cookie` value that carries a session id. Exact, because a test pins every attribute. */
export function sessionCookie(sid: string, mode: CookieMode): string {
  return mode === 'secure'
    ? `${COOKIE.secure}=${sid}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`
    : `${COOKIE.local}=${sid}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`;
}

/** The `Set-Cookie` value that ends one: the same name and attributes, empty, at age zero. */
export function clearCookie(mode: CookieMode): string {
  return mode === 'secure'
    ? `${COOKIE.secure}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    : `${COOKIE.local}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * The session id a request carries, or `undefined` when it carries none.
 *
 * WHAT WAS SENT, NOT WHAT IS VALID. An empty or malformed value comes back as it is, and the Directory
 * answers it with a 401 and a cleared cookie; reading it as "no cookie" would let a broken cookie reach
 * whatever the host does for a request that carries nothing.
 */
export function readSid(request: Request, mode: CookieMode): string | undefined {
  const name = COOKIE[mode];
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * Whether a browser sent this from a page on `origin`.
 *
 * `Origin` WHEN IT IS THERE, and it must be exactly this one. Without it, `Sec-Fetch-Site` must say
 * `same-origin`, or `none` for something the person typed. A request with neither is refused: every
 * browser that holds a cookie sends one of the two on a POST, so a request carrying neither did not come
 * from a page this host served.
 */
export function sameOrigin(request: Request, origin: string): boolean {
  const said = request.headers.get('origin');
  if (said !== null) return said === origin;
  const site = request.headers.get('sec-fetch-site');
  return site === 'same-origin' || site === 'none';
}

/** A backslash or a control character: a browser reads the first as `/` and drops the second, before a person notices. */
function slippery(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127 || c === 92) return true;
  }
  return false;
}

/**
 * A `next` that can only ever be a path on this origin; anything else is `/`.
 *
 * THE SHAPES THAT LEAVE ARE THE ONES A BROWSER READS DIFFERENTLY FROM A PERSON: `//evil.example` is a host,
 * so is `/\evil.example`, a tab or newline inside is dropped before it is read, and `%2F%2F` decodes to the
 * first. So the text must start with one `/`, carry no backslash or control character, decode to neither,
 * and still resolve to this origin.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.length > 2048 || slippery(next)) return '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return '/';
  }
  if (next.startsWith('//') || decoded.startsWith('//') || slippery(decoded)) return '/';
  const url = new URL(next, 'https://here.invalid');
  return url.origin === 'https://here.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
}

/**
 * THE FIRST SEGMENTS A HOST ANSWERS ITSELF, AND NO PAGE OF THE APP IS AT: its doors, the build's chunks, the frame a
 * drawn block is drawn in, and `app`, the prefix the app had before it moved to the root. The web app keeps the same
 * list as `DOORS` in `apps/web/src/lib/at.ts`, and the Worker its built half as `ROOT_DOORS` in `route.ts`.
 */
export const HOST_DOORS: ReadonlySet<string> = new Set(['api', 'auth', 'account', 'mcp', 'in', 'oauth', 'a', 'ws', 'healthz', 'app', '_app', '.well-known', 'drawn-frame']);

/**
 * A `next` that is a page of the app on this origin, or `null`: `safeNext`, and then not one of the host's doors.
 *
 * THE APP IS THE ROOT, SO A PATH ON THIS ORIGIN IS NOT YET A PAGE. `/auth/session` and `/api/export` are this origin and
 * no page, and sending somebody there after sign-in is the open door `safeNext` exists to close, one step further in.
 * AN ADDRESS FROM BEFORE THE MOVE IS READ AS THE ONE IT NAMES NOW: `/app/acme/r/tasks` is `/acme/r/tasks`, so a sign-in
 * page opened from a link mailed before 29 Oct still sends him back to the page he was on. It is taken off after
 * `safeNext` has resolved the path, so `/app/../auth/session` is `/auth/session` and refused.
 */
export function appNext(next: unknown): string | null {
  const safe = safeNext(next);
  /* EVERY SLASH AFTER `/app` GOES, AND THE RESULT IS CHECKED AGAIN (SEC4): taking one slash turned `/app//evil.example`
     into `//evil.example`, another host, after `safeNext` had passed it. What is checked is what will be followed. */
  const path = /^\/app(?=[/?#]|$)/.test(safe) ? `/${safe.slice(4).replace(/^\/+/, '')}` : safe;
  if (path !== '/' && safeNext(path) === '/') return null;
  const first = /^\/([^/?#]*)/.exec(path)?.[1] ?? '';
  return HOST_DOORS.has(first) ? null : path;
}

/**
 * Two secrets compared in time that does not depend on either: SHA-256 of both, then every byte.
 *
 * DIGESTED FIRST, so the lengths are always 32 and a length that differed cannot answer early.
 */
export async function sameKey(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(a)), crypto.subtle.digest('SHA-256', encoder.encode(b))]);
  const p = new Uint8Array(x);
  const q = new Uint8Array(y);
  let differ = 0;
  for (let i = 0; i < p.length; i++) differ |= (p[i] ?? 0) ^ (q[i] ?? 0);
  return differ === 0;
}

/**
 * The Directory's MAC key, by HKDF-SHA-256 with the info `braindog/session`, from the KEK's bytes or a
 * configured secret.
 *
 * DERIVED, NOT USED AS IT IS. The KEK also wraps every record's keys, and a secret used for two jobs is a
 * secret whose second job can leak the first; `braindog/session` makes this a key for this job only.
 */
export async function deriveSessionKey(material: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(material);
  const base = await crypto.subtle.importKey('raw', copy, 'HKDF', false, ['deriveBits']);
  copy.fill(0);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('braindog/session') },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * What a record's `access` answers about one person, as every door reads it: the role, the ceiling, the per-list levels
 * and rules, and what the lens adds when shares made the answer.
 */
export type HeldAccess<L extends string = string> = {
  level: L | null;
  registers: readonly string[] | null;
  levels: Readonly<Record<string, L>>;
  wheres?: Readonly<Wheres> | undefined;
  writes?: Readonly<Wheres> | undefined;
  hides?: Readonly<Record<string, readonly string[]>> | undefined;
  nots?: Readonly<Record<string, readonly ('history' | 'delete')[]>> | undefined;
  grant?: HeldGrant | undefined;
};

/** Where a lens came from and how long it holds: the access epoch, the next clock edge, the shares, whether agents carry it. */
export type HeldGrant = Readonly<{ epoch: number; until: string | null; via: string[]; agents: boolean }>;

/** The part of a call's context a held answer makes, each key present only when it says something. */
export type HeldParts<L extends string = string> = {
  registers?: readonly string[];
  levels?: Readonly<Record<string, L>>;
  wheres?: Readonly<Wheres>;
  writes?: Readonly<Wheres>;
  hides?: Readonly<Record<string, readonly string[]>>;
  nots?: Readonly<Record<string, readonly ('history' | 'delete')[]>>;
  grant?: HeldGrant;
};

const says = (o: object | undefined): o is object => o !== undefined && Object.keys(o).length > 0;

/**
 * THE ONE PLACE A HELD ANSWER BECOMES A CONTEXT (choke point 2). Every door calls it: the session path
 * here, the Worker's bearer and the self-host's two, so a key the lens grows tomorrow is one edit and no door can forget
 * it. `wheres` goes wherever `levels` goes, the rows of each list a narrowed grant reaches, and `writes`, `hides`, `nots`
 * and `grant` go with them. A key that says nothing is left off, so a caller holding no share gets the context it always
 * got.
 */
export function heldContext<L extends string>(held: HeldAccess<L>): HeldParts<L> {
  return {
    ...(held.registers === null ? {} : { registers: held.registers }),
    ...(says(held.levels) ? { levels: held.levels } : {}),
    ...(says(held.wheres) ? { wheres: held.wheres } : {}),
    ...(says(held.writes) ? { writes: held.writes } : {}),
    ...(says(held.hides) ? { hides: held.hides } : {}),
    ...(says(held.nots) ? { nots: held.nots } : {}),
    ...(held.grant === undefined ? {} : { grant: held.grant }),
  };
}

/**
 * The context a live session is, in the shape the bearer path builds, from the Directory's `Who` and the
 * record's own `access(person)`.
 *
 * `provedAt` COMES FROM THE SESSION ROW AND FROM NOWHERE ELSE, which is what lets the keychain ask for a proof
 * in the last fifteen minutes. `credentialed`, because a cookie is a credential of the person's own.
 *
 * WHAT THE PERSON HOLDS IS `heldContext`'s, as at every other door, so a narrowed grant reaches every reader the same
 * way through a session as through a bearer.
 */
export function sessionContext<L extends string>(
  who: Who,
  held: HeldAccess<L>,
): HeldParts<L> & {
  principal: { kind: 'person'; id: string; level: L | null };
  credentialed: true;
  provedAt: number;
  confirmable: boolean;
} {
  return {
    principal: { kind: 'person', id: who.person, level: held.level },
    ...heldContext(held),
    credentialed: true,
    provedAt: who.provedAt,
    /* WHETHER THEY CAN CONFIRM IT IS THEM WITH A PASSKEY, inline, as a share that widens asks. */
    confirmable: who.passkey === true,
  };
}

/**
 * Whether a request is the one an operation grant was started for: its body's SHA-256 is the grant's `binds`, or the
 * grant named none. Read from a copy, so the body is still there for the record.
 *
 * AN OPERATION GRANT NAMED ITS METHOD AND NOT ITS ARGUMENTS, so a `token` grant minted any scope, life and reach, and an
 * `import` grant took any file, while the person approving had seen only the word. A command that names its body when
 * it starts (`binds` on `/auth/device`) is held to that body here, on both hosts, after the grant is spent.
 */
export async function boundRequest(request: Request, binds: string | null | undefined): Promise<boolean> {
  if (binds === null || binds === undefined) return true;
  const bytes = new Uint8Array(await request.clone().arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('') === binds;
}

/** What a request under an operation grant started for another body is told. The grant is spent, so it is started again. */
export const OTHER_REQUEST: Refusal = {
  code: 'FORBIDDEN',
  fix: 'This approval was for one request, and this is a different one, so nothing was done. Start the command again and approve it.',
  at: 'operation',
};

/** The header the app sends on every call while an owner or Admin is seeing the record as somebody (§3.3). */
export const SEE_AS_HEADER = 'x-braindog-as';

/**
 * The header a door's refusal carries when a person's access to the record ended (§2.8), `ended`: the service worker
 * deletes its read copy on it, as it does on a 401, so nothing of the record stays on the device to draw.
 */
export const ACCESS_HEADER = 'x-braindog-access';

/** The headers a refusal is answered with: `x-braindog-access: ended` for one `at: 'access'`, and nothing else. */
export const accessHeaders = (refusal: { at?: string | undefined } | undefined): [string, string][] => (refusal?.at === 'access' ? [[ACCESS_HEADER, 'ended']] : []);

/** The longest person id the header is read for. Ids are short; anything longer names nobody. */
const SEE_AS_MOST = 64;

/**
 * "See as Priya": a live session's context replaced by the one the named person would have,
 * marked `preview`, or a refusal, or `null` when the request asks nothing of the kind.
 *
 * AN OWNER OR AN ADMIN, AND NEVER AS AN OWNER. Anybody else asking is refused, and so is asking to see as somebody who
 * owns the record, or who is not on it. The context is the person's own (`sessionContext` over what the record holds
 * for them), so every answer is theirs; `preview` makes it read-only twice over (the router and `allows`) and makes the
 * viewer nobody, so no row they keep private is shown. `provedAt` stays the viewer's.
 *
 * `previewBy` IS WHO IS SEEING, the session's own person, for the audit: the record counts each
 * read made this way as `preview:<person>` against them, and never as the person's own.
 */
export async function seeAs<L extends string>(
  asked: string | null,
  who: Who,
  held: HeldAccess<L>,
  accessOf: (person: string) => Promise<HeldAccess<L> | null> | HeldAccess<L> | null,
): Promise<{ ctx: ReturnType<typeof sessionContext<L>> & { preview: string; previewBy: string } } | { refusal: Refusal } | null> {
  const as = asked?.trim() ?? '';
  if (as === '') return null;
  if (held.level !== 'owner' && held.level !== 'decide')
    return { refusal: { code: 'FORBIDDEN', fix: 'Only an owner or an Admin can see this BrainDog as somebody else.', at: 'as' } };
  const theirs = as.length > SEE_AS_MOST ? null : await accessOf(as);
  if (theirs === null) return { refusal: { code: 'FORBIDDEN', fix: 'That person is not on this BrainDog, so there is nothing to see as them.', at: 'as' } };
  if (theirs.level === 'owner') return { refusal: { code: 'FORBIDDEN', fix: 'An owner sees everything. See as somebody else.', at: 'as' } };
  const seen = within(held, theirs);
  if (seen === null) return { refusal: { code: 'FORBIDDEN', fix: 'You see only some lists here, so you cannot see the record as somebody who sees more. Ask an owner.', at: 'as' } };
  return { ctx: { ...sessionContext({ ...who, person: as }, seen), confirmable: false, preview: as, previewBy: who.person } };
}

/**
 * What a viewer sees of the record seen as somebody: the person's own access, held inside the viewer's, or `null` when
 * that cannot be said without widening the person's.
 *
 * NO WIDER THAN EITHER OF THEM. See as read only the person's lens, so an Admin held off a list (`payroll` at `append`,
 * which reads nothing) read its rows by seeing as the bookkeeper who holds it. Every step here only narrows the person's
 * lens, never adds to it, so a list or row the person could not read stays out:
 *   - a list the viewer cannot read (a level that reads nothing) gets a rule no row meets (`null`, which reaches no row);
 *   - a list the viewer reads only some rows of gets both rules, `all` of them;
 *   - the fields and the history the viewer is kept from are kept from the preview too;
 *   - when the viewer reaches only some lists, so must the preview: the two lists are met, and a person who reaches
 *     every list cannot be cut down to the viewer's without naming lists the person never held, so it is refused.
 * A viewer who holds the whole record unnarrowed (every owner, and an ordinary Admin) sees the person's lens as it is.
 */
export function within<L extends string>(viewer: HeldAccess<L>, theirs: HeldAccess<L>): HeldAccess<L> | null {
  const levels = viewer.levels ?? {};
  const narrowed = viewer.registers !== null || says(levels) || says(viewer.wheres) || says(viewer.hides) || says(viewer.nots);
  if (!narrowed) return theirs;

  let registers = theirs.registers;
  if (viewer.registers !== null) {
    if (theirs.registers === null) return null;
    const mine = new Set(viewer.registers);
    registers = theirs.registers.filter((list) => mine.has(list));
  }

  type Rule = Wheres[string];
  const wheres: Wheres = { ...(theirs.wheres ?? {}) };
  const meet = (list: string, rule: Rule): void => {
    const had = Object.hasOwn(wheres, list) ? wheres[list] : undefined;
    wheres[list] = rule === null || had === null ? null : had === undefined ? rule : { all: [had, rule] };
  };
  for (const [list, level] of Object.entries(levels) as [string, string][]) if (level === 'append') meet(list, null);
  for (const [list, rule] of Object.entries(viewer.wheres ?? {})) meet(list, rule);

  const join = <T extends string>(a: Readonly<Record<string, readonly T[]>> | undefined, b: Readonly<Record<string, readonly T[]>> | undefined) => {
    const out: Record<string, T[]> = {};
    for (const side of [a ?? {}, b ?? {}]) for (const [list, words] of Object.entries(side)) out[list] = [...new Set([...(out[list] ?? []), ...words])];
    return out;
  };

  return {
    ...theirs,
    registers,
    wheres,
    hides: join(theirs.hides, viewer.hides),
    nots: join(theirs.nots, viewer.nots),
  };
}

/** What the operator's provisioning made, before the claim link is minted for it. */
export type Provisioned = { record: string; slug: string; person: string };

/** The letters a flow names by kind rather than as a link, spelled as `MailKind` in `apps/worker/src/mail.ts` spells them. */
export type MailNotice = Extract<Mail, { kind: string }>['kind'];

/** A mail that is a link and nothing else: a sign-in link or a claim link, which carry no kind. */
type LinkMail = Exclude<Mail, { kind: string }>;

/**
 * What a host hands `serveAuth`.
 *
 * `ip` IS THE HOST'S DECISION: the socket address, `cf-connecting-ip`, or a forwarded address only behind a
 * proxy the host was told to trust. `mail` is called and not awaited, so a known and an unknown address take
 * the same time to answer; it must not throw. `operator` is the Worker's, and absent everywhere else.
 *
 * `mail` TAKES THE LETTER'S KIND WHERE THE MAIL IS NOT A SIGN-IN LINK: an invitation's proof, or the notice that a
 * passkey was added or removed. A mail with no kind is a sign-in or claim link, as it always was. A host with no
 * `mail` sends nothing, and an invitation to a new address says so rather than making anybody (`invite.ts`).
 */
export type AuthDoor = {
  on: 'selfhost' | 'worker';
  /** The one origin this host serves pages from, without a trailing slash. */
  origin: string;
  auth: Auth;
  ip: string;
  open?: boolean;
  mail?: ((to: string, link: string, kind?: MailNotice) => void) | undefined;
  /** The clock the operator's lockout counts by. Absent, it is the platform's own. */
  now?: (() => number) | undefined;
  operator?:
    | {
        key: string | undefined;
        provision: (args: { slug: string; email: string; name?: string }) => Promise<Result<Provisioned>>;
      }
    | undefined;
  /** The `host[:port]` this request arrived by: the socket's `Host`, or the Worker's URL. A device is told to open `origin` only when the two agree. */
  reached?: string | undefined;
  /** The record's half of the device grant. Absent where no device may sign in, and both device routes are 404. */
  device?: DeviceDoor | undefined;
  /** The record and Directory halves of an invitation link. Absent where nobody can accept one, and the route is 404. */
  invite?: InviteDoor | undefined;
  /** This host signs people in with Google, which `/auth/methods` says so the screen draws the button. */
  google?: boolean | undefined;
  /**
   * Whether this host's sign-in letters are not going out: on the Worker, the Directory's count of the last sends
   * (`lettersDown`, the last five all failed for a fault of the host's). Asked only by `/auth/methods`; a throw or a
   * slow answer is read as not down, so a count that cannot be read never hides a way in that works.
   */
  mailDown?: (() => boolean | Promise<boolean>) | undefined;
};

type Header = readonly [string, string];

const HEADERS: readonly Header[] = [
  ['content-type', 'application/json; charset=utf-8'],
  /* A sign-in answer is one browser's and never a cache's. */
  ['cache-control', 'no-store'],
  ['x-content-type-options', 'nosniff'],
];

/** Answers are JSON in the `/api` envelope, with no CORS header ever written. */
function reply(status: number, payload: object, extra: readonly Header[] = []): Response {
  const headers = new Headers();
  for (const [k, v] of [...HEADERS, ...extra]) headers.append(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

const refusal = (status: number, refused: Refusal, extra: readonly Header[] = []): Response => reply(status, { ok: false, refusal: refused }, extra);

/** A route this host does not serve, or a way in it has switched off. The screen already knows from `methods`. */
const off = (): Response => refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'This BrainDog does not offer that way to sign in.' });

/**
 * The link a person is sent or handed. The fragment is the whole of the design: see the header.
 *
 * AT THE ROOT, BECAUSE THAT IS WHERE THE APP IS SERVED: `app.brain.dog/signin`. A link already mailed at
 * `app.brain.dog/app/signin#…` or `brain.dog/app/signin#…` still works: the Worker answers a page load there with one
 * 308 to `/signin`, and a browser keeps the fragment across a redirect whose `Location` carries none.
 */
const linkOf = (origin: string, mail: LinkMail, next: unknown = undefined, app: unknown = undefined): string => {
  const back = mailedNext(next);
  /* THE MAC APP'S CHALLENGE, when the app asked for this link: the page it opens in a browser hands it back to the app
     (`DesktopFlow`). A hash and never a secret, so the query reaching a server costs nothing. */
  const handoff = 'linkToken' in mail && typeof app === 'string' && APP_CHALLENGE.test(app) ? app : null;
  const query = [...(back ? [`next=${encodeURIComponent(back)}`] : []), ...(handoff ? [`app=${handoff}`] : [])];
  const page = query.length > 0 ? `${origin}/signin?${query.join('&')}` : `${origin}/signin`;
  return 'linkToken' in mail ? `${page}#magic=${mail.linkToken}` : `${page}#claim=${mail.claimToken}`;
};

/**
 * The page a mailed link sends him back to, or `null` for the bare link.
 *
 * THE LINK WROTE NO QUERY, AND THE PAGE HE WAS SENT FROM WAS LOST. Sign-in at `/signin?next=/acme/r/tasks`
 * mailed `/signin#magic=...`, so the tab the mail opened read an empty search and "Open BrainDog" went to `/`
 * (`test/auth-next.test.ts`).
 *
 * `appNext` AND NOTHING ELSE. The value is whatever query reached the sign-in page, so a scheme, `//`, a backslash or a
 * control character is dropped before it is ever in a mail with this origin on it; and a door of the host is dropped
 * too, because the page's own `onward()` would send it to `/` anyway, and so is `/`, which is where a bare link lands.
 * It is a path and never a secret, so the query reaching a server or a link scanner costs nothing the fragment was
 * protecting.
 */
function mailedNext(next: unknown): string | null {
  const path = appNext(next);
  return path === null || path === '/' ? null : path;
}

const isJson = (request: Request): boolean =>
  (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() === 'application/json';

/** Sixty-four kilobytes: an RSA passkey registration is about two, and nothing else here is bigger. */
const BODY_LIMIT = 65_536;

/** The body as an object, or `null` for anything else: not JSON, too big, an array, a bare value. */
async function objectOf(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > BODY_LIMIT) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (x: unknown): string => (typeof x === 'string' ? x : '');

/**
 * The HTTP request as the `AuthCall` it asks for.
 *
 * SHAPES ARE THE DIRECTORY'S TO JUDGE. A missing credential goes over as `undefined` and comes back as the
 * one failure body; checking it here as well would be a second opinion that could disagree with the first.
 */
function callOf(flow: AuthFlow, body: Record<string, unknown>, sid: string | undefined, ip: string): AuthCall | null {
  const presented = sid === undefined ? {} : { sid };
  switch (flow) {
    case 'session':
    case 'passkey.register.options':
    case 'passkeys':
    case 'logout':
    case 'sessions':
    case 'keychain.lock':
      return { flow, sid: sid ?? '' };
    /* ANYTHING BUT `none` KEEPS THIS SESSION, as the Directory reads it too: a page that sent no `keep`, or a word
       this build does not know, never signs out the browser it was pressed in. */
    case 'logout.all':
      return { flow, sid: sid ?? '', keep: body.keep === 'none' ? 'none' : 'this' };
    case 'key.exchange':
      return { flow, serverKey: text(body.serverKey), ip, ...presented };
    case 'passkey.register':
      return {
        flow,
        sid: sid ?? '',
        credential: body.credential as RegistrationJSON,
        ...(typeof body.label === 'string' ? { label: body.label } : {}),
      };
    /* A CHALLENGE IS COUNTED AGAINST THE ADDRESS ASKING FOR IT (`chal:<ip>`), so the address goes with it. */
    case 'passkey.assert.options':
      return { flow, ip };
    case 'passkey.assert':
      return { flow, credential: body.credential as AssertionJSON, ip, ...presented };
    case 'magic.start':
      return { flow, email: text(body.email), ip };
    case 'magic.redeem':
      return typeof body.claimToken === 'string'
        ? { flow, claimToken: body.claimToken, ip, ...presented }
        : { flow, linkToken: text(body.linkToken), ip, ...presented };
    case 'magic.whose':
      return typeof body.claimToken === 'string' ? { flow, claimToken: body.claimToken, ip } : { flow, linkToken: text(body.linkToken), ip };
    case 'passkey.remove':
      return { flow, sid: sid ?? '', id: text(body.id) };
    case 'switch':
      return { flow, sid: sid ?? '', slug: text(body.slug) };
    /* A PERSON NAMING ONE OF THEIR OWN PASSKEYS: the Directory keeps the name to one line of 64 characters,
       refuses an empty one and renames only the person's own key (`passkey.rename` in `record/src/identity.ts`). */
    case 'passkey.rename':
      return { flow, sid: sid ?? '', id: text(body.id), label: text(body.label) };
    /* THE FIVE THAT ARE HANDLED ELSEWHERE AND NOT HERE. `methods` is answered above, `claim.mint`
       and `suspend` go through `operated`, which checks the operator key first, and the two halves of an
       invitation's proof are called by `serveInvite` alone, after it has looked the invitation up.
       Naming them is what lets `default` be a type error rather than a 404. */
    case 'methods':
    case 'claim.mint':
    case 'suspend':
    case 'invite.prove':
    case 'invite.proved':
      return null;
    default:
      return unhandled(flow);
  }
}

/**
 * A flow this host has no case for, refused at compile time rather than at the door.
 *
 * `default: return null` MEANT "THIS BRAINDOG DOES NOT OFFER THAT WAY TO SIGN IN", which `serveAuth`
 * answers with a 404. That is the right answer for a path nobody serves and the wrong one for a flow
 * that is in `AUTH_ROUTES`, in `AuthCall` and in `AuthBodies` and was only missed in the switch
 * above: the route exists, the Directory implements it, and the host answers as though neither did.
 *
 * MEASURED by adding a fourteenth flow to `AuthCall` and its body to `AuthBodies`.
 * `pnpm -C packages/host typecheck` passed, and the new route answered 404. The parameter below is
 * `never`, so the same edit now fails to compile, which is where a missing case belongs.
 *
 * IT STILL ANSWERS AT RUNTIME, because `serveAuth` reaches here through `route.flow as AuthFlow` and
 * a cast proves nothing about what a string really is.
 */
function unhandled(flow: never): null {
  void flow;
  return null;
}

/** The Directory's answer as a response: the envelope, the status, the cookie, and `Retry-After` on a 429. */
function answered(out: AuthResult, mode: CookieMode): Response {
  const extra: Header[] = [];
  if (out.session === 'clear') extra.push(['set-cookie', clearCookie(mode)]);
  else if (out.session !== undefined) extra.push(['set-cookie', sessionCookie(out.session.sid, mode)]);
  switch (out.status) {
    case 200:
      return reply(200, { ok: true, value: out.body }, extra);
    case 429:
      extra.push(['retry-after', String(out.retryAfter)]);
      return reply(429, { ok: false, retryAfter: out.retryAfter }, extra);
    case 503:
      return reply(503, { ok: false }, extra);
    /* `stale` GOES OUT BESIDE THE REFUSAL, because it is the one 401 a page answers by signing in again rather than
       by saying the sign-in failed, and the code alone cannot tell the two apart. */
    case 401:
      return reply(401, { ok: false, refusal: out.refusal, ...(out.reason === 'stale' ? { reason: 'stale' } : {}) }, extra);
    default:
      return refusal(out.status, out.refusal, extra);
  }
}

/**
 * Answer one `/auth/*` request.
 *
 * THE ORDER IS THE ARGUMENT. The route and its method first, so a path that is not a route says so and
 * nothing else; then the origin and the content type on every POST, before the body is read, so a page
 * elsewhere gets a 403 without the Directory hearing about it; then the host's own reasons it can hold no
 * session; and only then the Directory.
 */
export async function serveAuth(request: Request, door: AuthDoor): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  const route = AUTH_ROUTES.find((r) => r.path === path && (r.on === 'both' || r.on === door.on));
  /* The path is not repeated back. A link pasted into the path rather than the fragment would be a token. */
  if (!route) return refusal(404, { code: 'ROUTE_UNKNOWN', fix: 'There is no sign-in route at that address.' });
  if (request.method !== route.method)
    return refusal(405, { code: 'ROUTE_UNKNOWN', fix: `${route.path} takes a ${route.method}.` }, [['allow', route.method]]);

  if (route.needs === 'operator') return operated(request, route, door);
  /* A DEVICE HAS NO COOKIE AND NO PAGE, so its two routes are answered before the checks a browser's are. */
  if (route.flow === 'device' || route.flow === 'device.token') return serveDevice(request, route, door);

  const mode = cookieMode(door.origin);
  const sid = mode === null ? undefined : readSid(request, mode);

  let body: Record<string, unknown> = {};
  if (route.method === 'POST') {
    if (!sameOrigin(request, door.origin))
      return refusal(403, { code: 'FORBIDDEN', fix: `Sign-in is answered only for pages on ${door.origin}.`, at: 'origin' });
    const parsed = isJson(request) ? await objectOf(request) : null;
    if (!parsed) return refusal(400, { code: 'BODY_MALFORMED', fix: `${route.path} takes a JSON object, sent as application/json.` });
    body = parsed;
  }

  if (route.flow === 'methods') return methods(door, mode, sid);

  /* NO SESSION CAN BE HELD, SO NO WAY IN IS OFFERED: an open self-host has none to have, and an origin no
     cookie can be set on would mint one with nowhere to go. */
  if (door.open || mode === null) return off();

  /* AN INVITATION IS SPENT BY SIGNING IN, so it is answered after the checks every browser route has, and its
     session reaches the cookie through the same `answered`. */
  if (route.flow === 'invite') return serveInvite(body, sid, door, (out) => answered(out, mode));

  /* A SIGN-UP ROW IS DECLARED AND NOT YET SERVED: the Directory has no such flow to hand it to. The unit that adds
     the three flows to `AuthCall` removes this line, and `callOf`'s `never` then asks it for their three cases. */
  if (SIGNUP.has(route.flow) || GOOGLE.has(route.flow) || DESKTOP.has(route.flow)) return off();

  const call = callOf(route.flow as AuthFlow, body, sid, door.ip);
  if (!call) return off();
  const out = await door.auth(call);

  /* THE MAIL GOES OUT WITHOUT BEING WAITED FOR. A send that was awaited would make a known address slower to answer
     than an unknown one. A link goes out as a link, and a notice by its kind with no link at all, because a passkey
     notice opens nothing. An invitation's proof never reaches here: only `serveInvite` asks for one, and it mails the
     proof with the invitation beside it. */
  if (out.status === 200 && out.mail && door.mail) {
    const mail = out.mail;
    try {
      if (!('kind' in mail)) door.mail(mail.to, linkOf(door.origin, mail, body.next, body.app));
      else if (mail.kind !== 'invite.prove') door.mail(mail.to, '', mail.kind);
    } catch {
      /* A failed send is the host's to report; the answer is the same either way. */
    }
  }
  return answered(out, mode);
}

/**
 * `/auth/methods`: the Directory's half and the host's, and the reason when there is nothing to offer.
 *
 * A COOKIE THAT CAN NAME NOTHING IS CLEARED HERE, because this is the first call the app makes: a host that
 * is open, or has no key to check sessions with, cannot have issued it.
 */
async function methods(door: AuthDoor, mode: CookieMode | null, sid: string | undefined): Promise<Response> {
  const out = await door.auth({ flow: 'methods', ...(sid === undefined ? {} : { sid }) });
  if (out.status !== 200) return mode === null ? reply(503, { ok: false }) : answered(out, mode);

  const nothing: MethodsBody = { passkey: false, magic: false, key: false, open: door.open === true, me: null, ...(door.on === 'worker' ? { signup: true as const } : {}) };
  const clear: Header[] = mode === null || sid === undefined ? [] : [['set-cookie', clearCookie(mode)]];
  if (door.open) return reply(200, { ok: true, value: nothing }, clear);
  if (mode === null) return reply(200, { ok: true, value: { ...nothing, why: 'insecure' } satisfies MethodsBody });

  const m = out.body as Methods;
  if (!m.configured) return reply(200, { ok: true, value: { ...nothing, why: 'not-configured' } satisfies MethodsBody }, clear);
  /* GOOGLE NEEDS THE LINK FLOWS, because a sign-in through it is a link minted and spent on the spot. */
  const magic = (await mailIsDown(door, m.magic)) ? ('down' as const) : m.magic;
  const body: MethodsBody = {
    passkey: m.passkey,
    magic,
    key: m.key,
    open: false,
    me: m.me,
    firstRun: m.firstRun,
    ...(door.google === true && m.magic ? { google: true as const } : {}),
    ...(door.on === 'worker' ? { signup: true as const } : {}),
  };
  return answered({ ...out, body }, mode);
}

/** How long `/auth/methods` waits on `mailDown` before reading it as not down. */
const MAIL_DOWN_WAIT_MS = 1_000;

/**
 * Whether sign-in mail is down on this host: `magic: 'down'` on `/auth/methods`.
 *
 * NO SENDER WHERE ONE IS MEANT. The Worker always means to mail, so a Worker with no `mail` is down whatever the
 * Directory was told; a host whose Directory offers links (`offered`) and gave `serveAuth` no `mail` is down too. A
 * self-host with links off offers none, which is `false` and never `'down'`, whatever a count says. Then the count,
 * `mailDown`, raced against `MAIL_DOWN_WAIT_MS`.
 */
async function mailIsDown(door: AuthDoor, offered: boolean): Promise<boolean> {
  if (!offered && door.on !== 'worker') return false;
  if (!door.mail) return true;
  if (!door.mailDown) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise<boolean>((done) => (timer = setTimeout(() => done(false), MAIL_DOWN_WAIT_MS)));
    return (await Promise.race([Promise.resolve(door.mailDown()), late])) === true;
  } catch {
    return false;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Ten wrong operator keys from one address are compared; the eleventh is refused, as every other lockout is. */
const OPERATOR_TRIES = 10;
/** How long the strikes are remembered, and how long the lock lasts once they run out. */
const OPERATOR_WINDOW_MS = 15 * 60_000;
/**
 * The most addresses the lockout holds at once. Past it the address struck least recently goes first, so a flood
 * of invented addresses costs a bounded map and never the isolate.
 */
const OPERATOR_HELD = 4_096;

type Strikes = { n: number; first: number; until: number };

/**
 * Wrong operator keys, by the address that sent them.
 *
 * PER PROCESS, WHICH IS THE HONEST COST AND IS SAID HERE. The Directory's lockout (`dir_fail`) is the durable one,
 * and it has no flow a host can ask to count a key the Directory never sees; so on the Worker this is per isolate,
 * a brake on one sender's loop rather than a ceiling across every isolate, as the ingest budget in
 * `apps/worker/src/route.ts` says of itself. The route never answered a wrong key with anything but 401, so any
 * number of guesses could be sent before; now ten can, from one address to one isolate. The key, compared in
 * constant time, stays the defence; this makes guessing it slow.
 */
const struck = new Map<string, Strikes>();

/**
 * One strike against `ip`, before the key is compared. `null` means go on; a number is the seconds to wait.
 *
 * RESERVE BEFORE COMPARE, AS THE DIRECTORY DOES (`packages/record/src/identity.ts`, `LOCKOUT`): a strike written
 * after the comparison could be outrun by a burst of guesses sent together. A right key clears the address.
 */
function strike(ip: string, now: number): number | null {
  const key = ip || 'unknown';
  const held = struck.get(key);
  if (held && held.until > now) return Math.ceil((held.until - now) / 1000);
  const row: Strikes = held && now - held.first < OPERATOR_WINDOW_MS ? held : { n: 0, first: now, until: 0 };
  row.n += 1;
  if (row.n > OPERATOR_TRIES) row.until = now + OPERATOR_WINDOW_MS;
  /* Deleted and set again, so the map's order is the order addresses were last struck and the oldest is first. */
  struck.delete(key);
  struck.set(key, row);
  for (const oldest of struck.keys()) {
    if (struck.size <= OPERATOR_HELD) break;
    struck.delete(oldest);
  }
  return row.until > now ? Math.ceil(OPERATOR_WINDOW_MS / 1000) : null;
}

/**
 * The operator's three routes: a record and a claim link, a claim link on its own, or a person stopped or let back in.
 * Worker only.
 *
 * THE KEY IS COMPARED IN CONSTANT TIME, AND AN UNSET ONE IS NO ROUTE AT ALL. The link comes back to the
 * operator in the answer and is never mailed from here: a person should hear about their record from the
 * person who made it, and the operator decides how.
 *
 * AND A WRONG KEY IS LOCKED OUT LIKE EVERY OTHER DOOR'S: ten, then fifteen minutes of 429 with `Retry-After`, the
 * right key during it included, exactly as `/auth/token` answers the server key.
 */
async function operated(request: Request, route: AuthRoute, door: AuthDoor): Promise<Response> {
  const operator = door.operator;
  if (!operator?.key) return off();
  const now = door.now?.() ?? Date.now();
  const wait = strike(door.ip, now);
  if (wait !== null) return reply(429, { ok: false, retryAfter: wait }, [['retry-after', String(wait)]]);
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim() ?? '';
  if (!bearer || !(await sameKey(bearer, operator.key)))
    return refusal(401, { code: 'UNAUTHORIZED', fix: 'This route takes the operator key.', at: 'authorization' });
  struck.delete(door.ip || 'unknown');
  const body = isJson(request) ? await objectOf(request) : null;
  if (!body) return refusal(400, { code: 'BODY_MALFORMED', fix: `${route.path} takes a JSON object, sent as application/json.` });

  /* NOTHING IS MADE WHILE SIGN-IN IS OFF: a record whose claim link cannot be minted is a record nobody can reach. */
  const on = await door.auth({ flow: 'methods' });
  if (on.status !== 200 || !(on.body as Methods).configured) return off();

  const email = text(body.email).trim().toLowerCase();
  /* AN ABUSIVE ACCOUNT STOPPED: the one writer of `dir_person.suspended_at`. Anything but `false` stops them,
     so a body that forgot the field does the safer of the two. */
  if (route.flow === 'suspend') {
    return answered(await door.auth({ flow: 'suspend', email, suspended: body.suspended !== false }), cookieMode(door.origin) ?? 'secure');
  }
  let made: Provisioned | null = null;
  if (route.flow === 'provision') {
    /* THE SAME RULE AS AN INVITATION'S, because it is the same column and the same passkey `displayName`. This
       trimmed and capped nothing, so the operator's typing could store every name `/auth/invite` now refuses. */
    const named = personName(body.name);
    if (!named.ok) return reply(httpStatus(named), named);
    const name = named.value;
    const out = await operator.provision({ slug: text(body.slug).trim(), email, ...(name ? { name } : {}) });
    if (!out.ok) return reply(httpStatus(out), out);
    made = out.value;
  }
  const minted = await door.auth({ flow: 'claim.mint', email });
  if (minted.status !== 200) return answered(minted, cookieMode(door.origin) ?? 'secure');
  const mail = minted.mail;
  if (!mail || 'kind' in mail) return answered(minted, cookieMode(door.origin) ?? 'secure');
  const claim = linkOf(door.origin, mail);
  const expires = (minted.body as { expires: number }).expires;
  return reply(200, { ok: true, value: made ? { ...made, claim, expires } : { claim, expires } });
}
