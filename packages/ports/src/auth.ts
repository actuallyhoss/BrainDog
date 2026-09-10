/**
 * Sign-in, as the seam between a host and the Directory. `12 §3` row 49, `12 §8`, `49 §5.4` to `§5.10`,
 * `51 §5.8`.
 *
 * TYPES AND NOTHING ELSE, like the rest of this package. The Directory implements `auth(call)` over its own
 * tables (`@braindog/record/directory`); a host turns HTTP into an `AuthCall` and an `AuthResult` back into a
 * status, a cookie and a body. Both hosts run the same Directory, so both answer alike.
 *
 * FOUR RAW VALUES CROSS THIS SEAM, AND EACH HAS EXACTLY ONE NAME: `sid` (the session cookie), `linkToken` (a
 * sign-in link), `claimToken` (a claim link) and `serverKey` (the self-host's `BRAINDOG_TOKEN`). One name each is
 * what lets `secret-grep` follow them to a sink. The Directory stores only their MACs and never sends mail, so a
 * raw value leaves it in exactly two fields: `session.sid`, which becomes the cookie, and `mail`, which the host
 * delivers and never prints.
 */

import type { Refusal } from './index.ts';

/**
 * What `navigator.credentials.create()` answers, in the WebAuthn JSON shape, base64url throughout.
 *
 * ONLY THE FIELDS THAT ARE READ. `transports`, `authenticatorAttachment` and the extension results may ride
 * along and are ignored; nothing here decides anything on them.
 */
export type RegistrationJSON = {
  id: string;
  response: { clientDataJSON: string; attestationObject: string };
};

/** What `navigator.credentials.get()` answers, the same way. `userHandle` is the person id the passkey was made for. */
export type AssertionJSON = {
  id: string;
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null };
};

/**
 * One request to the Directory's sign-in half.
 *
 * `ip` IS WHAT THE LOCKOUT IS KEYED ON, and the host decides what it is: the socket address, or the first
 * `X-Forwarded-For` value only when it has been told to trust a proxy. A caller that could choose its own `ip`
 * could lock anyone out.
 *
 * A PRESENTED `sid` ON A SIGN-IN IS DELETED BEFORE THE NEW SESSION IS WRITTEN. That is the fixation defence: a
 * cookie planted before sign-in never becomes a signed-in cookie.
 */
export type AuthCall =
  | { flow: 'methods'; sid?: string }
  | { flow: 'session'; sid: string }
  | { flow: 'key.exchange'; serverKey: string; ip: string; sid?: string }
  | { flow: 'passkey.register.options'; sid: string }
  | { flow: 'passkey.register'; sid: string; credential: RegistrationJSON; label?: string }
  | { flow: 'passkey.assert.options' }
  | { flow: 'passkey.assert'; credential: AssertionJSON; ip: string; sid?: string }
  | { flow: 'magic.start'; email: string; ip: string }
  | { flow: 'magic.redeem'; linkToken: string; ip: string; sid?: string }
  | { flow: 'magic.redeem'; claimToken: string; ip: string; sid?: string }
  | { flow: 'passkeys'; sid: string }
  | { flow: 'passkey.remove'; sid: string; id: string }
  | { flow: 'logout'; sid: string }
  /** Operator only: the host checks who is asking before this reaches the Directory. */
  | { flow: 'claim.mint'; email: string };

export type AuthFlow = AuthCall['flow'];

/**
 * Who a live session belongs to.
 *
 * `record` IS THE ONE COOKIE'S SECOND HALF. The session row carries the record it was opened for, so the browser
 * holds one opaque id rather than an id and a slug. `null` when the person reaches no open record yet.
 *
 * `provedAt` IS WHEN THEY LAST PROVED IT, in epoch milliseconds: a passkey, a link or the server key. Rotation
 * never moves it, which is what lets the vault ask for a proof in the last fifteen minutes.
 */
export type Who = { person: string; email: string; record: string | null; provedAt: number };

/** What `/auth/methods` needs from the Directory. The host adds what only it knows: open mode, the demo, and why. */
export type Methods = {
  /** False when the host gave the Directory no MAC key: nothing but this answer is served. */
  configured: boolean;
  passkey: boolean;
  magic: boolean;
  /** The server key is offered, and this Directory holds at most one person, so it would be accepted. */
  key: boolean;
  /** No passkey exists anywhere yet, so the screen leads with the way that does not need one. */
  firstRun: boolean;
  me: Who | null;
};

/** A passkey as its owner sees it in Settings. Never the public key: nothing on the screen needs it. */
export type PasskeyInfo = {
  id: string;
  label: string | null;
  alg: -7 | -257;
  backedUp: boolean;
  createdAt: number;
  lastUsed: number | null;
};

/** `PublicKeyCredentialCreationOptions`, JSON-safe, exactly as the browser half passes it on. */
export type RegistrationOptions = {
  challenge: string;
  rp: { id: string; name: 'BrainDog' };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: readonly [{ type: 'public-key'; alg: -7 }, { type: 'public-key'; alg: -257 }];
  timeout: 300000;
  attestation: 'none';
  authenticatorSelection: { residentKey: 'required'; userVerification: 'preferred' };
  excludeCredentials: { type: 'public-key'; id: string }[];
};

/** `PublicKeyCredentialRequestOptions`. An empty `allowCredentials` is what makes a discoverable passkey and autofill work. */
export type AssertionOptions = {
  challenge: string;
  rpId: string;
  timeout: 300000;
  userVerification: 'preferred';
  allowCredentials: readonly [];
};

/** A link for the host to deliver. The host builds the URL; the Directory never knows the origin a link is read on. */
export type Mail = { to: string; linkToken: string } | { to: string; claimToken: string };

/**
 * The answer.
 *
 * `session` ON EVERY ARM, because a rotation must reach the cookie whatever else happened in the call. A session
 * that rotated during a registration that then failed still has a new id, and the old one dies sixty seconds
 * later. `'clear'` tells the host to expire the cookie.
 *
 * EVERY SIGN-IN FAILURE IS THE SAME 401: `UNAUTHORIZED`, "That did not sign you in." The reason goes to the
 * Directory's log callback and never into this value.
 */
export type AuthResult<B = unknown> =
  | { status: 200; body: B; session?: { sid: string } | 'clear'; mail?: Mail }
  | { status: 401 | 403 | 404 | 422; refusal: Refusal; session?: { sid: string } | 'clear' }
  | { status: 429; retryAfter: number; session?: { sid: string } | 'clear' }
  | { status: 503; session?: { sid: string } | 'clear' };

/** The body each flow answers with on a 200. */
export type AuthBodies = {
  methods: Methods;
  session: Who;
  'key.exchange': Who;
  'passkey.register.options': RegistrationOptions;
  'passkey.register': PasskeyInfo;
  'passkey.assert.options': AssertionOptions;
  'passkey.assert': Who;
  'magic.start': Record<string, never>;
  'magic.redeem': Who;
  passkeys: PasskeyInfo[];
  'passkey.remove': Record<string, never>;
  logout: Record<string, never>;
  'claim.mint': { expires: number };
};

/** `auth(call)`, typed so the body matches the flow that was asked. */
export type Auth = <C extends AuthCall>(call: C) => Promise<AuthResult<AuthBodies[C['flow']]>>;
