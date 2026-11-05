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
 *
 * AND A FIFTH, WHICH `secret-grep` DOES NOT FOLLOW BY NAME: the proof that a new address is somebody's own mailbox.
 * The shared contract names it `link` in the `mail` that carries it out and `token` in the `invite.proved` call
 * that spends it, so neither spelling is one of the four above. It opens less
 * than they do (it makes nobody a person on its own: the invitation it was minted for has to come back beside it),
 * it is spent once, and it dies in a day.
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
 *
 * A PASSKEY CHALLENGE CARRIES `ip` TOO, because minting one is locked out per address (`chal:<ip>`, thirty a
 * minute). Without it one script could fill the Directory's live challenges and hold every tenant's sign-in at 503.
 */
export type AuthCall =
  | { flow: 'methods'; sid?: string }
  | { flow: 'session'; sid: string }
  | { flow: 'key.exchange'; serverKey: string; ip: string; sid?: string }
  | { flow: 'passkey.register.options'; sid: string }
  | { flow: 'passkey.register'; sid: string; credential: RegistrationJSON; label?: string }
  | { flow: 'passkey.assert.options'; ip: string }
  /**
   * `app` IS THE DEVICE LABEL OF A NATIVE APP SIGNING IN ("iPhone, BrainDog app"): with it the session opened is an app
   * session (`AppSessions` below), listed by that label and renewed by `app.refresh` rather than on read.
   */
  | { flow: 'passkey.assert'; credential: AssertionJSON; ip: string; sid?: string; app?: string }
  /**
   * `app` IS THE APP'S PKCE CHALLENGE (S256, 43 characters), when a BrainDog app asked for the link: the link carries it
   * as `?app=`, and the Directory mints a six-digit code bound to it and to the link, mailed beside the link as `appCode`.
   */
  | { flow: 'magic.start'; email: string; ip: string; app?: string }
  /** `app` as on `passkey.assert`: a link a BrainDog app spends (`/auth/app`) opens an app session with this label. */
  | { flow: 'magic.redeem'; linkToken: string; ip: string; sid?: string; app?: string }
  | { flow: 'magic.redeem'; claimToken: string; ip: string; sid?: string }
  /** Whose account a sign-in or claim link opens, asked before the press and spending nothing. */
  | { flow: 'magic.whose'; linkToken: string; ip: string }
  | { flow: 'magic.whose'; claimToken: string; ip: string }
  | { flow: 'passkeys'; sid: string }
  | { flow: 'passkey.remove'; sid: string; id: string }
  | { flow: 'passkey.rename'; sid: string; id: string; label: string }
  | { flow: 'logout'; sid: string }
  /** Open another record this person is on, in this browser: the session row's record moves, and the cookie does not. */
  | { flow: 'switch'; sid: string; slug: string }
  /** Operator only: the host checks who is asking before this reaches the Directory. */
  | { flow: 'claim.mint'; email: string }
  /** Every live session this person has, this one marked. */
  | { flow: 'sessions'; sid: string }
  /** End this person's other sessions (`keep: 'this'`), or all of them, this one included (`keep: 'none'`). */
  | { flow: 'logout.all'; sid: string; keep: 'this' | 'none' }
  /**
   * End ONE of this person's sessions, named by the `ref` `sessions` listed it under. Ending this one is signing out,
   * and the cookie is cleared with it.
   */
  | { flow: 'session.end'; sid: string; ref: string }
  /**
   * An app session renews itself: a new id by compare-and-set, the old one good for five more minutes, the expiry
   * renewed as a rotation renews it. A browser's session is refused, because it rotates itself on read.
   */
  | { flow: 'app.refresh'; sid: string }
  /**
   * The six digits a sign-in letter carries for the app that asked for it, typed in that app: `verifier` is the PKCE
   * verifier whose S256 is the challenge the code was minted for, and `label` names the device. The code and the link it
   * came with are one use between them.
   */
  | { flow: 'app.code'; code: string; verifier: string; label?: string; ip: string; sid?: string }
  /**
   * Lock the keychain in this browser: the session's last proof is put behind the longest keychain window, so the next
   * keychain act asks for a sign-in again. The session stays signed in for everything else.
   */
  | { flow: 'keychain.lock'; sid: string }
  /**
   * A new address accepting an invitation proves the mailbox first. The host has already looked the invitation up,
   * and `email` is the address it was made for; this mints the proof and hands it back in `mail`.
   */
  /* `operator` MARKS A PROOF THE SERVER'S OPERATOR MINTED AT A SHELL ON A SELF-HOST WITH NO MAIL (`invite` in
     apps/selfhost), never one a request asked for: no route passes it, and the joining is logged as theirs. */
  | { flow: 'invite.prove'; email: string; invite: string; name?: string; operator?: true }
  /** The proof coming back from the mailbox, spent once: the host makes the person only after this answers. */
  | { flow: 'invite.proved'; token: string }
  /**
   * Operator only, like `claim.mint`: stop a person signing in (`suspended: true`), which ends every session they hold,
   * or let them sign in again (`false`). `email` names them as the operator knows them.
   */
  | { flow: 'suspend'; email: string; suspended: boolean };

export type AuthFlow = AuthCall['flow'];

/**
 * Closing an account (`POST /account/close`), a union beside `AuthCall` as `SignupCall` is, because it has no
 * `/auth/*` row and `router-groups` holds every arm of `AuthCall` to exactly one.
 *
 * BY PERSON ID, BECAUSE THE DOOR HAS ALREADY ASKED EVERYTHING. `serveAccount` read the session, and the close door
 * checked its proof is fifteen minutes old at most, the address typed against it, and every record the person owns for
 * another owner, before this reaches the Directory. Nothing a browser sends is ever this call.
 */
export type AccountCall = { flow: 'account.close'; person: string };

/** What closing answered: how many passkeys, sessions and memberships went with the person. */
export type AccountClosed = { passkeys: number; sessions: number; records: number };

/** What `suspend` answered: who, and since when they are stopped, `null` once they may sign in again. */
export type Suspended = { person: string; suspended_at: string | null; was?: string | null };

/**
 * A stranger asking for a record of their own. The Worker's alone: a self-host is
 * made by its operator and has nobody to sign up.
 *
 * A UNION BESIDE `AuthCall` AND NOT THREE MORE ARMS IN IT, because `serveAuth` (`packages/host/src/auth.ts`) switches
 * over `AuthCall` with a `never` default, and a flow it has no case for is meant to fail to compile there. These three
 * never reach that switch: the Worker's `signIn()` answers their routes before `serveAuth` is asked, so the Directory's
 * `auth` takes both unions and every host that holds an `Auth` is unchanged.
 *
 * `signup.start` ALWAYS ANSWERS `200 {}` for an address, known or not, and only the mail differs: a new address is sent
 * the proof, and one that can already sign in is sent a sign-in link. `turnstile` never reaches the Directory: the
 * Worker checks it and drops it.
 */
export type SignupCall =
  | { flow: 'signup.start'; email: string; slug: string; name?: string; tz?: string; ip: string }
  /**
   * The proof back from the mailbox, spent once: the person is made, and signed in. A presented `sid` is deleted before
   * the new session is written, as on every sign-in.
   */
  | { flow: 'signup.verify'; token: string; ip: string; sid?: string }
  /** Whether a name for a new record is free, and why not when it is not. Reads, and writes nothing. */
  | { flow: 'signup.name'; slug: string };

/** What `signup.name` answers: the name as it would be stored, whether it can be had, and the sentence when not. */
export type SignupName = { slug: string; free: boolean; why?: string };

/** What `signup.verify` answers: who was made, and the record name, person's name and zone typed at the start. */
export type SignupVerified = { person: string; email: string; slug: string; name: string | null; tz: string | null };

/**
 * Who a live session belongs to.
 *
 * `record` IS THE ONE COOKIE'S SECOND HALF. The session row carries the record it was opened for, so the browser
 * holds one opaque id rather than an id and a slug. `null` when the person reaches no open record yet.
 *
 * `provedAt` IS WHEN THEY LAST PROVED IT, in epoch milliseconds: a passkey, a link or the server key. Rotation
 * never moves it, which is what lets the keychain and the passkey flows ask for a proof in the last fifteen minutes,
 * and what ends a session ninety days after it however often it has rotated.
 *
 * `passkey` IS WHETHER THEY HAVE ONE, said by the session flow alone, so a share that widens can ask them to confirm it
 * is them inline (the sharing plan's §6) only when they can. Absent is a Directory that never said.
 */
export type Who = { person: string; email: string; record: string | null; provedAt: number; passkey?: boolean };

/** What `/auth/methods` needs from the Directory. The host adds what only it knows: open mode, and why. */
export type Methods = {
  /** False when the host gave the Directory no MAC key: nothing but this answer is served. */
  configured: boolean;
  passkey: boolean;
  magic: boolean;
  /** The server key is offered, and this Directory holds at most one person, so it would be accepted. */
  key: boolean;
  /**
   * The screen leads with the way that does not need a passkey. Signed in, it is whether THIS PERSON has none yet,
   * so a newcomer on a Cloud where others have passkeys is still offered to add one first. Signed out nobody is
   * known, so it is whether the Directory holds none at all: the one case where a passkey button could sign
   * nobody in.
   */
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

/**
 * `PublicKeyCredentialCreationOptions`, JSON-safe, exactly as the browser half passes it on.
 *
 * USER VERIFICATION IS `required`, IN BOTH CEREMONIES, AND THE VERIFIER CHECKS THE UV FLAG. `preferred` lets a
 * passkey be one tap on a device somebody else is holding; `required` asks for the device's PIN, face or
 * fingerprint as well. A platform passkey (Windows Hello, iCloud Keychain, Google Password Manager) always verifies;
 * a security key with no PIN set is refused, and the Recovery screen says what to do about it.
 */
export type RegistrationOptions = {
  challenge: string;
  rp: { id: string; name: 'BrainDog' };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: readonly [{ type: 'public-key'; alg: -7 }, { type: 'public-key'; alg: -257 }];
  timeout: 300000;
  attestation: 'none';
  authenticatorSelection: { residentKey: 'required'; userVerification: 'required' };
  excludeCredentials: { type: 'public-key'; id: string }[];
};

/** `PublicKeyCredentialRequestOptions`. An empty `allowCredentials` is what makes a discoverable passkey and autofill work. */
export type AssertionOptions = {
  challenge: string;
  rpId: string;
  timeout: 300000;
  userVerification: 'required';
  allowCredentials: readonly [];
};

/**
 * Something for the host to deliver. The host builds every URL; the Directory never knows the origin a link is read on.
 *
 * THE FIRST TWO ARE LINKS AND CARRY NO `kind`, as they always have: a sign-in link and a claim link. The arms with a
 * `kind` name the letter (`MailKind` in `apps/worker/src/mail.ts`). `invite.prove` carries the raw proof in `link`,
 * which the host puts in the URL it mails; the two passkey notices carry nothing that opens anything, and tell the
 * person that their way in changed, so a change they did not make is one they hear about.
 */
export type Mail =
  /* `appCode` IS THE SIX DIGITS A BRAINDOG APP TAKES INSTEAD OF THE LINK, there only when the app asked for the link
     (`magic.start` with `app`). It is printed in the letter and nowhere else, and it opens nothing without the verifier
     that stayed in the app. */
  | { to: string; linkToken: string; appCode?: string }
  | { to: string; claimToken: string }
  | { kind: 'invite.prove'; to: string; link: string }
  /* AN INVITATION EMAILED BY WHOEVER MADE IT (collab pass, 2 Nov): the link to join, with the proof inside it for a new
     address, so opening the mail is the proof and there is no second mail to wait for. */
  | { kind: 'invite.sent'; to: string; link: string }
  /* A SIGN-UP'S TWO LETTERS BOTH CARRY A LINK: the proof for a new address, and a sign-in link for a known one, so the
     person who already has an account is let in rather than told so on the page. */
  | { kind: 'signup.verify' | 'signup.known'; to: string; link: string }
  | { kind: 'passkey.added' | 'passkey.removed'; to: string };

/**
 * One live session, as its person sees it in Settings.
 *
 * `ref` IS THE FIRST TWELVE HEX OF THE SESSION'S MAC, enough to tell two apart and useless for opening either: a
 * MAC cannot be presented as a cookie, and twelve characters of one cannot be looked up as it. It changes when the
 * session rotates. `activeAt` is when it last rotated, which a session does on its first use after a day, so it is
 * the last day it was used; `authedAt` is its last proof. `record` is the record it opens on, `null` for none.
 *
 * `device` IS AN APP SESSION'S LABEL ("iPhone, BrainDog app"), absent for a browser's. An app session is renewed by the
 * app once a day (`app.refresh`), so its `activeAt` is still the last day it was used.
 */
export type SessionInfo = { ref: string; current: boolean; authedAt: number; activeAt: number; record: string | null; device?: string };

/** What `invite.proved` answers: the proved address, the invitation the proof was minted for, and the name typed then. */
export type InviteProved = { email: string; invite: string; name: string | null; operator?: true };

/**
 * The answer.
 *
 * `session` ON EVERY ARM, because a rotation must reach the cookie whatever else happened in the call. A session
 * that rotated during a registration that then failed still has a new id, and the old one dies sixty seconds
 * later. `'clear'` tells the host to expire the cookie.
 *
 * EVERY SIGN-IN FAILURE IS THE SAME 401: `UNAUTHORIZED`, "That did not sign you in." The reason goes to the
 * Directory's log callback and never into this value.
 *
 * `reason: 'stale'` IS THE ONE 401 THAT IS NOT A SIGN-IN FAILURE. The session is good and its last proof is more
 * than fifteen minutes old, so changing a passkey asks for a fresh one. It says so, because the person is who they
 * say they are and needs to know to sign in again rather than that something failed; its refusal is
 * `NEEDS_BROWSER_SESSION`, the keychain's code for the same fact, and the cookie is kept.
 */
export type AuthResult<B = unknown> =
  | { status: 200; body: B; session?: { sid: string } | 'clear'; mail?: Mail }
  | { status: 401; refusal: Refusal; reason?: 'stale'; session?: { sid: string } | 'clear' }
  | { status: 403 | 404 | 422; refusal: Refusal; session?: { sid: string } | 'clear' }
  | { status: 429; retryAfter: number; session?: { sid: string } | 'clear' }
  | { status: 503; session?: { sid: string } | 'clear' };

/** The body each flow answers with on a 200. */
export type AuthBodies = {
  methods: Methods;
  /** `lapsed` is there only when the session's record has lapsed billing (contracts §2.6), so a banner can say so. */
  session: Who & { lapsed?: true };
  'key.exchange': Who;
  'passkey.register.options': RegistrationOptions;
  'passkey.register': PasskeyInfo;
  'passkey.assert.options': AssertionOptions;
  'passkey.assert': Who;
  'magic.start': Record<string, never>;
  'magic.redeem': Who;
  /** The address of the account the link signs in to, for the screen to say before anybody presses. */
  'magic.whose': { email: string };
  passkeys: PasskeyInfo[];
  'passkey.remove': Record<string, never>;
  'passkey.rename': PasskeyInfo;
  logout: Record<string, never>;
  switch: Who;
  'claim.mint': { expires: number };
  sessions: { sessions: SessionInfo[] };
  /** How many sessions were ended: the others, or with `keep: 'none'` this one too. */
  'logout.all': { ended: number };
  /** The keychain is locked in this browser: `locked` is always true, and the session is otherwise as it was. */
  'keychain.lock': { locked: true };
  /** How many sessions ended: one, or none when the `ref` named none of this person's (the answer is then a 422). */
  'session.end': { ended: number };
  /** The new id rides in the cookie, never in the body. */
  'app.refresh': Record<string, never>;
  /** Signed in: the cookie is the answer, as `/auth/app` sets it. */
  'app.code': Record<string, never>;
  'invite.prove': Record<string, never>;
  'invite.proved': InviteProved;
  'signup.start': Record<string, never>;
  'signup.verify': SignupVerified;
  'signup.name': SignupName;
  suspend: Suspended;
  'account.close': AccountClosed;
};

/** `auth(call)`, typed so the body matches the flow that was asked. */
export type Auth = <C extends AuthCall>(call: C) => Promise<AuthResult<AuthBodies[C['flow']]>>;
