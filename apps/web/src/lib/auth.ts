/**
 * Signing in, from the browser's side: the `/auth/*` calls and the WebAuthn half under them.
 *
 * ONLY `/signin` AND SETTINGS IMPORT THIS. The shell never does, so none of it reaches the entry chunk
 * every screen waits for, which is what the bundle gate measures. The frame's Sign out (`lib/shell/AppFrame.svelte`) is the
 * one reach from the shell, and it is an `import()` made on the press, so this file is still a chunk of its own.
 *
 * NOTHING HERE THROWS AND NOTHING LOGS. Every outcome is a value the screen can tell apart from the
 * others, and a credential goes into one request body and nowhere else: not a console, not a URL, not
 * a returned sentence.
 *
 * THE TYPES ARE RESTATED from `@braindog/ports`' `auth.ts`, which the web app may not import (`50 §1`,
 * and `graph` counts a type import as an edge). Only the fields this file reads are here.
 */

import { forgetSignedOut } from './record/signed-out.ts';
import { forgetPicturesOf } from './page/drawn-pictures.ts';
import { askProof, canAsk, purposeOf } from './reauth/ask.ts';

/** Who a live session belongs to. */
export type Who = { person: string; email: string; record: string | null; provedAt: number };

/** `GET /auth/methods`: what the Directory offers, plus what only the host knows. */
export type Methods = {
  passkey: boolean;
  /**
   * Whether an emailed link signs in here. `'down'` is a host that offers links whose mail is not going out now (no
   * sender, or its last sends failed): the page offers no link then and says so.
   */
  magic: boolean | 'down';
  /** The self-host's server key is accepted here. */
  key: boolean;
  /** The host lets anyone in without a session: a self-host started without a key. */
  open: boolean;
  /* NO `demo`. The host said whether it pinned a public record for anonymous reads, and there is no such record to open
     any more, so the field is read past like any other this screen has no use for. */
  /** Why nothing is offered: no key to check sessions with, or an origin no cookie can be set on. */
  why?: 'not-configured' | 'insecure' | undefined;
  me: Who | null;
  /** No passkey exists yet, so the screen leads with the way that needs none. */
  firstRun?: boolean | undefined;
  /** The host signs people in with Google. Absent is no, so a host older than the button draws none. */
  google?: true | undefined;
  /** The Turnstile site key, only where the host checks sign-in link requests (secret and key both set). Absent is no check. */
  turnstile?: string | undefined;
  /**
   * The host serves sign-up (`/auth/signup/*`), which only the hosted app does. Absent is no, and who may sign up is then
   * never asked: a self-host answers that door 404, which the browser printed as an error on every sign-in.
   */
  signup?: true | undefined;
};

/** A passkey as Settings lists it. */
export type PasskeyInfo = { id: string; label: string | null; backedUp: boolean; createdAt: number; lastUsed: number | null };

/** A link read off the address: `#magic=` from an email, `#claim=` from whoever set the record up. */
export type Link = { kind: 'magic' | 'claim'; token: string };

/**
 * Everything that can happen instead of the answer, and each one is told to the reader differently.
 *
 * `cancelled` IS NOT A FAILURE ON THE SCREEN. It is the passkey sheet being closed, which people do on
 * purpose, and reporting it as "sign-in failed" is the commonest way a passkey flow feels broken.
 */
export type Failure =
  /** The host said no. `fix` is its sentence when it sent one. */
  | { kind: 'refused'; fix: string | null }
  /** Too many tries: `retryAfter` is in seconds. */
  | { kind: 'locked'; retryAfter: number }
  /** 503: the host could not check, so it let nobody in. */
  | { kind: 'closed' }
  | { kind: 'absent' }
  /** Something answered that does not speak the envelope: a static host serving only the app. */
  | { kind: 'no-host' }
  | { kind: 'unreachable' }
  | { kind: 'cancelled' }
  /** This authenticator already holds a passkey for this record. */
  | { kind: 'exists' }
  | { kind: 'unsupported' }
  /**
   * Signed in, and the last proof is more than fifteen minutes old, for a change that asks for a recent one. Not a
   * failed sign-in: `fix` is the host's sentence, and signing in again is the whole of the answer.
   */
  | { kind: 'stale'; fix: string | null };

export type Said<T> = { ok: true; value: T } | ({ ok: false } & Failure);

/** What the functions reach the world through, so a test needs no socket and no browser. */
export type Io = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** `navigator.credentials`, absent where WebAuthn is. */
  credentials?: Pick<CredentialsContainer, 'create' | 'get'> | undefined;
};

type RegistrationOptions = {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: readonly { type: 'public-key'; alg: number }[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: readonly { type: 'public-key'; id: string }[];
};

type AssertionOptions = {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: readonly { type: 'public-key'; id: string }[];
};

type RegistrationJSON = { id: string; response: { clientDataJSON: string; attestationObject: string } };

type AssertionJSON = {
  id: string;
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string | null };
};

/** Fifteen minutes, the lockout's own length, for a 429 that does not say how long. */
const LOCK_SECONDS = 900;

function live(): Io {
  const nav = (globalThis as { navigator?: { credentials?: CredentialsContainer } }).navigator;
  return {
    fetch: (url, init) => globalThis.fetch(url, init),
    credentials: typeof globalThis.PublicKeyCredential === 'function' ? nav?.credentials : undefined,
  };
}

/** Whether a passkey can work on this page: WebAuthn is present and the page is a secure context. */
export function support(g: unknown = globalThis): { webauthn: boolean; secure: boolean } {
  const it = g as { isSecureContext?: unknown; PublicKeyCredential?: unknown; navigator?: { credentials?: unknown } };
  return {
    secure: it.isSecureContext === true,
    webauthn: typeof it.PublicKeyCredential === 'function' && it.navigator?.credentials !== undefined,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

/** One call. A body makes it a POST, and every POST is JSON because the host refuses anything else. */
async function call(io: Io, path: string, body?: Record<string, unknown>): Promise<Said<unknown>> {
  try {
    let res: Response;
    try {
      res = await io.fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      return { ok: false, kind: 'unreachable' };
    }
    const said: unknown = await res.json().catch(() => undefined);
    const env = isObj(said) ? said : null;
    if (res.status === 429) return { ok: false, kind: 'locked', retryAfter: secondsOf(env?.retryAfter, res.headers.get('retry-after')) };
    if (res.status === 503) return { ok: false, kind: 'closed' };
    /* A proxy in front of a host that is down, which is the host being unreachable and not absent. */
    if (res.status === 502 || res.status === 504) return { ok: false, kind: 'unreachable' };
    if (res.status === 404) return { ok: false, kind: 'absent' };
    /* THE ONE 401 THAT IS NOT A FAILURE: the host marks it `reason: 'stale'` beside its refusal. */
    if (res.status === 401 && env?.reason === 'stale') return { ok: false, kind: 'stale', fix: fixOf(env.refusal) };
    if (res.ok && env?.ok === true) return { ok: true, value: env.value };
    if (env?.ok === false || res.status === 401 || res.status === 403 || res.status === 422)
      return { ok: false, kind: 'refused', fix: fixOf(env?.refusal) };
    return { ok: false, kind: 'no-host' };
  } catch {
    return { ok: false, kind: 'unreachable' };
  }
}

function secondsOf(body: unknown, header: string | null): number {
  const n = typeof body === 'number' ? body : Number(header ?? Number.NaN);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : LOCK_SECONDS;
}

function fixOf(refusal: unknown): string | null {
  return isObj(refusal) && typeof refusal.fix === 'string' && refusal.fix ? refusal.fix : null;
}

function whoOf(v: unknown): Who | null {
  if (!isObj(v) || typeof v.person !== 'string' || typeof v.email !== 'string') return null;
  return {
    person: v.person,
    email: v.email,
    record: typeof v.record === 'string' ? v.record : null,
    provedAt: typeof v.provedAt === 'number' ? v.provedAt : 0,
  };
}

function methodsOf(v: unknown): Methods | null {
  if (!isObj(v) || typeof v.passkey !== 'boolean' || (typeof v.magic !== 'boolean' && v.magic !== 'down') || typeof v.key !== 'boolean') return null;
  return {
    passkey: v.passkey,
    magic: v.magic,
    key: v.key,
    open: v.open === true,
    me: whoOf(v.me),
    ...(v.why === 'not-configured' || v.why === 'insecure' ? { why: v.why } : {}),
    ...(typeof v.firstRun === 'boolean' ? { firstRun: v.firstRun } : {}),
    ...(v.google === true ? { google: true as const } : {}),
    ...(typeof v.turnstile === 'string' && v.turnstile !== '' ? { turnstile: v.turnstile } : {}),
    ...(v.signup === true ? { signup: true as const } : {}),
  };
}

function passkeyOf(v: unknown): PasskeyInfo | null {
  if (!isObj(v) || typeof v.id !== 'string') return null;
  return {
    id: v.id,
    label: typeof v.label === 'string' && v.label ? v.label : null,
    backedUp: v.backedUp === true,
    createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
    lastUsed: typeof v.lastUsed === 'number' ? v.lastUsed : null,
  };
}

/** A sign-in's answer, which is a `Who`. Anything else after a 200 is not one the screen can use. */
async function signedIn(asked: Promise<Said<unknown>>): Promise<Said<Who>> {
  const out = await asked;
  if (!out.ok) return out;
  const who = whoOf(out.value);
  return who ? { ok: true, value: who } : { ok: false, kind: 'refused', fix: null };
}

const done = async (asked: Promise<Said<unknown>>): Promise<Said<null>> => {
  const out = await asked;
  return out.ok ? { ok: true, value: null } : out;
};

/** How this host lets people in. A host that does not know `/auth` is `no-host`, not a refusal. */
export async function methods(io: Io = live()): Promise<Said<Methods>> {
  const out = await call(io, '/auth/methods');
  if (!out.ok) return out.kind === 'absent' ? { ok: false, kind: 'no-host' } : out;
  const m = methodsOf(out.value);
  return m ? { ok: true, value: m } : { ok: false, kind: 'no-host' };
}

/**
 * WHAT A LAPSED SESSION LEFT ON THIS DEVICE GOES once the account says nobody is signed in (RE7 of the review of 30 Oct,
 * e). Sign-in drew inside the app's frame until the split, and its 401 dropped the last shell and the local copy; the
 * light frame reads nothing, so a session that ran out with no sign-out left both until somebody signed in again.
 * Never on a host that lets everybody in (`open`), and never when the account could not be asked: offline is when the
 * copies earn their keep. The local copy's module is fetched only where a shell copy or its reader's mark is kept
 * (`braindog.boot-copy`, `braindog.last-reader`, written out so this file loads neither module), so a stranger's first
 * visit fetches nothing more.
 */
export async function forgetLapsed(said: Said<Methods>): Promise<void> {
  if (!said.ok || said.value.open || said.value.me !== null) return;
  let kept = false;
  try {
    kept = globalThis.localStorage?.getItem('braindog.boot-copy') != null || globalThis.localStorage?.getItem('braindog.last-reader') != null;
  } catch {
    kept = false;
  }
  /* The last shell is among what a sign-out drops (`signed-out.ts`); the local copy is not, so it is wiped here. */
  forgetSignedOut();
  if (kept) await import('./data/local-tab.ts').then((c) => c.wipeLocal(), () => undefined);
}

/** Sign in with a passkey this device or a nearby phone holds. */
export async function passkeySignIn(io: Io = live()): Promise<Said<Who>> {
  const asked = await call(io, '/auth/passkey/assert/options', {});
  if (!asked.ok) return asked;
  const credential = await assertion(io, asked.value as AssertionOptions);
  if (!credential.ok) return credential;
  return signedIn(call(io, '/auth/passkey/assert', { credential: credential.value }));
}

/**
 * "Confirm it's you", inside the Share sheet (default 1): a passkey asked for where the person is,
 * which replaces the session with one proved now, as `afresh` does. NEVER A SIGN-IN PAGE: where no passkey can be asked
 * for here this answers false and the sheet says so, because the record asks for a proof only of somebody who has a
 * passkey to give.
 */
export async function confirmInline(io: Io = live(), g: unknown = globalThis): Promise<boolean> {
  const here = support(g);
  if (!here.webauthn || !here.secure || !io.credentials) return false;
  return (await passkeySignIn(io)).ok;
}

/**
 * Whether this browser offers a site's passkeys in a field's autofill: conditional mediation, as WebAuthn calls it.
 * Anything that is not a plain yes, a missing function or one that throws included, is no.
 */
export async function canAutofill(g: unknown = globalThis): Promise<boolean> {
  const pkc = (g as { PublicKeyCredential?: { isConditionalMediationAvailable?: unknown } }).PublicKeyCredential;
  if (typeof pkc?.isConditionalMediationAvailable !== 'function') return false;
  try {
    return (await (pkc.isConditionalMediationAvailable as () => Promise<unknown>).call(pkc)) === true;
  } catch {
    return false;
  }
}

/** A passkey offered in the email field's autofill: `done` is what came of it, `stop` takes the offer away. */
export type Autofill = {
  /** A session when somebody picked a passkey from the field, `cancelled` once `stop` ran, or the failure. */
  done: Promise<Said<Who>>;
  /** Abort the offer, and answer once the browser has let go of it, with what `done` came to. */
  stop: () => Promise<Said<Who>>;
  /**
   * Whether somebody picked a passkey from the field. A failure before a pick (the challenge would not come, the
   * browser said no) is nobody's press, so the page keeps it to itself; a failure after one is the host's answer.
   */
  readonly picked: boolean;
};

/** The clock an offer waits on, `setTimeout` outside a test. */
const timers = {
  wait: (ms: number, then: () => void): (() => void) => {
    const t = setTimeout(then, ms);
    return () => clearTimeout(t);
  },
};

/** How long before its challenge runs out a waiting offer is asked again, so a pick never meets a spent challenge. */
const AUTOFILL_EARLY = 15_000;
/** The challenge's life when the host does not say, the host's own `timeout`. */
const CHALLENGE_LIFE = 300_000;

/**
 * Offer this site's passkeys in the email field's autofill (`autocomplete="username webauthn"`), so a returning phone
 * signs in with one touch and nothing typed.
 *
 * ONE CHALLENGE AT A TIME. The offer holds the browser's one pending request and one challenge from
 * `/auth/passkey/assert/options`. A button pressed on the page calls `stop` and waits for it before asking for its own,
 * because a second request while the first is pending is refused by the browser, which read as "Sign in with a passkey"
 * failing on the first press and working on the second. An aborted offer is not a strike: its challenge is never
 * presented, and the host strikes only an assertion. Minting a challenge is a rate (thirty a minute an address).
 *
 * A PAGE LEFT OPEN STAYS ABLE TO SIGN IN. A waiting offer is asked again a little before its challenge runs out, which
 * is one more mint every five minutes, far under the host's rate.
 */
export function passkeyAutofill(io: Io = live(), clock: { wait: (ms: number, then: () => void) => () => void } = timers): Autofill {
  const stopped = new AbortController();
  let picked = false;
  const round = async (): Promise<Said<Who>> => {
    for (;;) {
      if (stopped.signal.aborted) return { ok: false, kind: 'cancelled' };
      const asked = await call(io, '/auth/passkey/assert/options', {});
      if (!asked.ok) return asked;
      const o = asked.value as AssertionOptions;
      /* THIS ROUND'S OWN ABORT: `stop` ends it, and so does the challenge running out, which starts the next round. */
      if (stopped.signal.aborted) return { ok: false, kind: 'cancelled' };
      const now = new AbortController();
      const end = () => now.abort();
      stopped.signal.addEventListener('abort', end, { once: true });
      let expired = false;
      const cancel = clock.wait(Math.max(1_000, (o.timeout ?? CHALLENGE_LIFE) - AUTOFILL_EARLY), () => {
        expired = true;
        now.abort();
      });
      const credential = await assertion(io, o, { mediation: 'conditional', signal: now.signal });
      cancel();
      stopped.signal.removeEventListener('abort', end);
      if (credential.ok) {
        picked = true;
        return signedIn(call(io, '/auth/passkey/assert', { credential: credential.value }));
      }
      if (!(expired && credential.kind === 'cancelled')) return stopped.signal.aborted ? { ok: false, kind: 'cancelled' } : credential;
    }
  };
  const done = round().catch((): Said<Who> => ({ ok: false, kind: 'refused', fix: null }));
  return {
    done,
    stop: () => {
      stopped.abort();
      return done;
    },
    get picked() {
      return picked;
    },
  };
}

/**
 * Run a change to a way in, and when the host answers `stale`, sign in again with a passkey and run it once more.
 *
 * THE EXISTING WAY BACK, AND NOT A NEW ONE. A passkey sign-in on a page already signed in replaces the session with
 * one proved now, which is how the actions panel signs in again without leaving (`lib/page/panels/Actions.svelte`).
 * Where no passkey can be asked for, or the person closes the sheet, the `stale` answer goes back as it came, with
 * the host's sentence, and the screen says it.
 */
async function afresh<T>(io: Io, run: () => Promise<Said<T>>): Promise<Said<T>> {
  const first = await run();
  if (first.ok || first.kind !== 'stale') return first;
  /* INSIDE THE APP'S FRAME, THE ONE "CONFIRM IT'S YOU" (`lib/reauth`), which offers a mailed link where no passkey is. */
  if (canAsk()) return (await askProof(purposeOf({ fix: first.fix ?? undefined }))) ? run() : first;
  if (!io.credentials) return first;
  const proved = await passkeySignIn(io);
  return proved.ok ? run() : first;
}

/**
 * The name a new passkey is given, from the device that made it.
 *
 * A LIST OF KEYS THAT ALL SAY "Unnamed" CANNOT BE PRUNED. Recovery asks a person to keep more than one passkey, and
 * then to remove the one on the phone they lost, which they can only do if the rows say which is which. The host has
 * always taken a `label` (`packages/record/src/identity.ts`, `passkey.register`). What the browser says about its
 * platform is all there is to go on, so the name is the device's own word (iPhone, iPad, Mac, Android, Chromebook) or
 * the platform's word for its authenticator (Windows Hello), and "Passkey" everywhere else, never a guess at a model.
 * Settings, Identity renames it to anything the person likes (`renamePasskey`).
 *
 * AN IPAD SAYS IT IS A MAC. iPadOS asks for desktop pages with the Mac's user agent, and the one thing that tells the
 * two apart is a touch screen, which no Mac has.
 */
export function platformLabel(g: unknown = globalThis): string {
  const nav = (g as { navigator?: { userAgent?: unknown; userAgentData?: { platform?: unknown }; maxTouchPoints?: unknown } }).navigator;
  const hint = typeof nav?.userAgentData?.platform === 'string' ? nav.userAgentData.platform : '';
  const ua = `${hint} ${typeof nav?.userAgent === 'string' ? nav.userAgent : ''}`;
  const touch = typeof nav?.maxTouchPoints === 'number' && nav.maxTouchPoints > 1;
  if (/iPhone/u.test(ua)) return 'iPhone';
  if (/iPad/u.test(ua) || (/Macintosh/u.test(ua) && touch)) return 'iPad';
  if (/Android/u.test(ua)) return 'Android';
  if (/Windows/u.test(ua)) return 'Windows Hello';
  if (/CrOS|Chrome OS/u.test(ua)) return 'Chromebook';
  if (/Macintosh|macOS|Mac OS X/u.test(ua)) return 'Mac';
  return 'Passkey';
}

/** Add a passkey for the person signed in, on this device, named for its platform (`platformLabel`). */
export async function passkeyRegister(io: Io = live(), label: string = platformLabel()): Promise<Said<PasskeyInfo>> {
  return afresh(io, async (): Promise<Said<PasskeyInfo>> => {
    const asked = await call(io, '/auth/passkey/register/options', {});
    if (!asked.ok) return asked;
    const credential = await creation(io, asked.value as RegistrationOptions);
    if (!credential.ok) return credential;
    const out = await call(io, '/auth/passkey/register', { credential: credential.value, label });
    if (!out.ok) return out;
    const info = passkeyOf(out.value);
    return info ? { ok: true, value: info } : { ok: false, kind: 'refused', fix: null };
  });
}

/** Trade the self-host's server key for a session. The key goes in this one body and is not kept. */
export async function exchangeKey(serverKey: string, io: Io = live()): Promise<Said<Who>> {
  const key = serverKey.trim();
  if (!key) return { ok: false, kind: 'refused', fix: null };
  return signedIn(call(io, '/auth/token', { serverKey: key }));
}

/**
 * Ask for a sign-in link. The host answers alike whether or not it knows the address.
 *
 * `next` IS THE PAGE HE WAS SENT FROM, so the link in the mail brings him back to it. The host holds it to a path
 * under the app and drops anything else (`packages/host/src/auth.ts`), so this sends it as it is.
 */
export async function requestLink(
  email: string,
  next: string | null = null,
  io: Io = live(),
  turnstile: string | null = null,
  /** The Mac app's PKCE challenge: the link then carries it, and its page hands the link back to the app. */
  app: string | null = null,
): Promise<Said<null>> {
  return done(call(io, '/auth/magic/start', { email: email.trim(), ...(next ? { next } : {}), ...(turnstile ? { turnstile } : {}), ...(app ? { app } : {}) }));
}

/**
 * Whose account a link that arrived in the address opens: its address, or `null` when the host does not say (an older
 * host, a link that is spent, a network that failed). Spends nothing.
 *
 * SAID BEFORE THE PRESS, because a link is a way into whoever it was minted for: a stranger's own link, sent to somebody
 * signed out, put them in the stranger's record with one press, and what they typed next landed there.
 */
export async function linkFor(link: Link, io: Io = live()): Promise<string | null> {
  const out = await call(io, '/auth/magic/whose', link.kind === 'magic' ? { linkToken: link.token } : { claimToken: link.token });
  if (!out.ok) return null;
  const email = (out.value as { email?: unknown } | null)?.email;
  return typeof email === 'string' && email.trim() !== '' ? email : null;
}

/** Spend a link that arrived in the address. */
export async function redeemLink(link: Link, io: Io = live()): Promise<Said<Who>> {
  return signedIn(call(io, '/auth/magic/redeem', link.kind === 'magic' ? { linkToken: link.token } : { claimToken: link.token }));
}

/** Who this browser's session belongs to, asked just before an explicit sign-out ends it, or `null` when it cannot say. */
async function whoNow(io: Io): Promise<string | null> {
  const out = await call(io, '/auth/session');
  return out.ok && isObj(out.value) && typeof out.value.person === 'string' && out.value.person !== '' ? out.value.person : null;
}

/**
 * WHAT ONLY AN EXPLICIT SIGN-OUT DROPS (his call of 23 Oct): the person's own drawn widget pictures (`drawn-pictures.ts`,
 * RE11). A session that only lapsed keeps them, so the same person's next sign-in draws at once. Exported for the
 * account close. THE PUBLISHER KEY STAYS: it is kept per person, and the store takes an update only with the key that
 * signed the add-on, so dropping it on sign-out would leave every add-on he published unable to take an update.
 */
export async function forgetOwn(person: string | null): Promise<void> {
  forgetPicturesOf(person);
}

/**
 * End this session. WHAT THIS BROWSER KEPT OF WHAT THEY READ GOES WITH IT (`signed-out.ts`), from the frame's menu and from
 * Settings alike, so the next person to sign in here is never drawn the last one's week, threads or places. AND WHAT IS
 * THEIR OWN (`forgetOwn`), since this is the press that says they are leaving: who they are is asked before the session
 * ends, while the cookie can still say.
 */
export async function signOut(io: Io = live()): Promise<Said<null>> {
  const person = await whoNow(io);
  const out = await done(call(io, '/auth/logout', {}));
  if (out.ok) {
    forgetSignedOut();
    await forgetOwn(person);
  }
  return out;
}

export async function passkeys(io: Io = live()): Promise<Said<PasskeyInfo[]>> {
  const out = await call(io, '/auth/passkeys');
  if (!out.ok) return out;
  const rows = Array.isArray(out.value) ? out.value : isObj(out.value) && Array.isArray(out.value.passkeys) ? out.value.passkeys : null;
  if (!rows) return { ok: false, kind: 'refused', fix: null };
  return { ok: true, value: rows.map(passkeyOf).filter((k): k is PasskeyInfo => k !== null) };
}

export async function removePasskey(id: string, io: Io = live()): Promise<Said<null>> {
  return afresh(io, () => done(call(io, '/auth/passkey/remove', { id })));
}

/**
 * Give one of the person's own passkeys a name (`POST /auth/passkey/rename`), and answer the passkey as the
 * host now holds it. What a name may be is the host's to say: one line, at most 64 characters, trimmed, and an empty
 * one refused with its sentence, which comes back as `refused` with `fix`. A name changes no way in, so no fresh proof.
 */
export async function renamePasskey(id: string, label: string, io: Io = live()): Promise<Said<PasskeyInfo>> {
  const out = await call(io, '/auth/passkey/rename', { id, label });
  if (!out.ok) return out;
  const info = passkeyOf(out.value);
  return info ? { ok: true, value: info } : { ok: false, kind: 'refused', fix: null };
}

/**
 * Sign out from the frame's account menu, then load the sign-in screen in full.
 *
 * A FULL LOAD AND NOT A MOVE, for the reason the sign-in page's onward buttons are full loads: everything this tab
 * holds was read under the session that just ended, and a client-side move would draw it again. `go` is
 * `location.assign` outside a test. A press that did not end the session leaves the page where it is and answers why.
 */
export async function signOutAndLeave(to: string, go: (href: string) => void = (href) => globalThis.location.assign(href), io: Io = live()): Promise<Said<null>> {
  const out = await signOut(io);
  if (out.ok) {
    /* The kept shell belongs to the person who just left: gone before the full load can draw it. */
    await import('./record/boot-copy.ts').then((c) => c.dropCopy(), () => undefined);
    /* And the local copy of the rows they could read, before the full load. */
    await import('./data/local-tab.ts').then((c) => c.wipeLocal(), () => undefined);
    go(to);
  }
  return out;
}

/** One live session, as Settings lists it. `ref` tells two apart and opens neither; `record` is `null` for none. */
export type SessionInfo = { ref: string; current: boolean; authedAt: number; activeAt: number; record: string | null };

function sessionOf(v: unknown): SessionInfo | null {
  if (!isObj(v) || typeof v.ref !== 'string') return null;
  return {
    ref: v.ref,
    current: v.current === true,
    authedAt: typeof v.authedAt === 'number' ? v.authedAt : 0,
    activeAt: typeof v.activeAt === 'number' ? v.activeAt : 0,
    record: typeof v.record === 'string' ? v.record : null,
  };
}

/** Every live session the person signed in has, this one marked `current`. */
export async function sessions(io: Io = live()): Promise<Said<SessionInfo[]>> {
  const out = await call(io, '/auth/sessions');
  if (!out.ok) return out;
  const rows = isObj(out.value) && Array.isArray(out.value.sessions) ? out.value.sessions : null;
  if (!rows) return { ok: false, kind: 'refused', fix: null };
  return { ok: true, value: rows.map(sessionOf).filter((s): s is SessionInfo => s !== null) };
}

/**
 * Sign out everywhere else, or everywhere, and answer how many sessions ended.
 *
 * `this` BY DEFAULT, because the press is made in a browser somebody is using: ending that one too is a choice the
 * screen has to ask for by name, and the host reads anything but `none` the same way.
 */
export async function signOutEverywhere(keep: 'this' | 'none' = 'this', io: Io = live()): Promise<Said<number>> {
  const person = keep === 'none' ? await whoNow(io) : null;
  const out = await call(io, '/auth/logout/all', { keep });
  if (!out.ok) return out;
  const ended = isObj(out.value) && typeof out.value.ended === 'number' ? out.value.ended : null;
  if (ended !== null && keep === 'none') {
    forgetSignedOut();
    await forgetOwn(person);
  }
  return ended === null ? { ok: false, kind: 'refused', fix: null } : { ok: true, value: ended };
}

/**
 * Read `#magic=` or `#claim=` off the address, once.
 *
 * `clear` RUNS BEFORE ANYTHING ELSE CAN, so the token is out of the address bar, history and any
 * screenshot before a request is made. A fragment never reaches a server or a log, and this keeps it
 * from staying on the screen either. The link is spent by a POST after a press, never on arrival.
 */
export function takeLink(hash: string, clear: () => void): Link | null {
  const m = /^#(magic|claim)=(.*)$/s.exec(hash);
  if (!m) return null;
  clear();
  const token = (m[2] ?? '').trim();
  return token ? { kind: m[1] === 'claim' ? 'claim' : 'magic', token } : null;
}

/** An invitation link as the page reads it: the invitation, and the proof beside it when the link came from a mail. */
export type InviteLink = { token: string; proof: string | null };

/** What separates the invitation from its proof in a mailed link. Neither is base64url's alphabet, so it cannot be inside either. */
const PROOF = '&proof=';

/**
 * Read an invitation off `/invite#<token>`, or off `/invite#<token>&proof=<proof>` when the link came from the mail
 * that proves a new address, once, clearing the address first for the reason `takeLink` gives.
 */
export function takeInvite(hash: string, clear: () => void): InviteLink | null {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return null;
  clear();
  const at = raw.indexOf(PROOF);
  const token = (at < 0 ? raw : raw.slice(0, at)).trim();
  const proof = at < 0 ? '' : raw.slice(at + PROOF.length).trim();
  return token ? { token, proof: proof || null } : null;
}

/** The record's ladder, restated for the reason the types at the top of this file are: an invitation names one of these. */
export type InviteLevel = 'owner' | 'decide' | 'write' | 'append' | 'read';

const INVITE_LEVELS: ReadonlySet<string> = new Set(['owner', 'decide', 'write', 'append', 'read']);

const levelOf = (said: unknown): InviteLevel | null => (typeof said === 'string' && INVITE_LEVELS.has(said) ? (said as InviteLevel) : null);

/**
 * What an invitation says before anybody accepts it: the address it is for, when it runs out, who is signed in, and
 * what it opens.
 *
 * WHAT IT OPENS IS SAID BEFORE ACCEPT: the record's name, the level it gives on the
 * whole record, and each list by name at its own level. `lists` is empty and the other two `null` when a host older
 * than those fields sent none, and the page then says only the address, as it did.
 */
export type InviteSeen = {
  email: string;
  expiresAt: string;
  signedInAs: string | null;
  record: string | null;
  level: InviteLevel | null;
  lists: { id: string; name: string; level: InviteLevel }[];
  /** What is shared with the address, in the host's own sentences ("Ada shared Pottery with you. ..."), or `null`. */
  shared: string | null;
};

/** The lists an invitation names, keeping only a row with an id, a name and a level this build knows. */
const inviteListsOf = (said: unknown): InviteSeen['lists'] =>
  Array.isArray(said)
    ? said.flatMap((l: unknown) => {
        if (!isObj(l) || typeof l.id !== 'string' || typeof l.name !== 'string') return [];
        const level = levelOf(l.level);
        return level ? [{ id: l.id, name: l.name, level }] : [];
      })
    : [];

/** Look at an invitation. Nothing is spent. */
export async function lookInvite(token: string, io: Io = live()): Promise<Said<InviteSeen>> {
  const out = await call(io, '/auth/invite', { inviteToken: token });
  if (!out.ok) return out;
  const v = out.value;
  if (!isObj(v) || typeof v.email !== 'string') return { ok: false, kind: 'refused', fix: null };
  return {
    ok: true,
    value: {
      email: v.email,
      expiresAt: typeof v.expires_at === 'string' ? v.expires_at : '',
      signedInAs: typeof v.signedInAs === 'string' ? v.signedInAs : null,
      record: typeof v.record === 'string' && v.record ? v.record : null,
      level: levelOf(v.level),
      lists: inviteListsOf(v.lists),
      shared: typeof v.shared === 'string' && v.shared.trim() !== '' ? v.shared : null,
    },
  };
}

/**
 * What accepting answered: on the record and signed in, or a new address that must prove its mailbox first, with
 * the address the link was sent to.
 */
export type Accepted = { kind: 'joined'; who: Who } | { kind: 'proving'; to: string };

async function acceptedOf(asked: Promise<Said<unknown>>): Promise<Said<Accepted>> {
  const out = await asked;
  if (!out.ok) return out;
  const v = out.value;
  if (isObj(v) && v.proving === true && typeof v.to === 'string') return { ok: true, value: { kind: 'proving', to: v.to } };
  const who = whoOf(v);
  return who ? { ok: true, value: { kind: 'joined', who } } : { ok: false, kind: 'refused', fix: null };
}

/**
 * Accept it: the person signed in is put on the record, or a new address is sent a link that proves it.
 *
 * `name` IS WHAT THEY TYPED FOR THEMSELVES, and a blank box sends no field. This posted the token alone, so the name
 * the host, the Directory and the record's mirror were all ready to take was never sent by anything. What a name may
 * be is the host's to decide (`packages/host/src/invite.ts`, `personName`), and its refusal comes back as a sentence.
 * For a new address the host keeps the name with the proof, and makes the person with it when the proof comes back.
 */
export async function acceptInvite(token: string, name?: string, io: Io = live()): Promise<Said<Accepted>> {
  return acceptedOf(call(io, '/auth/invite', { inviteToken: token, accept: true, ...(name?.trim() ? { name } : {}) }));
}

/** Accept with the proof the mail carried: the new person is made, put on the record and signed in. */
export async function acceptProved(token: string, proof: string, io: Io = live()): Promise<Said<Accepted>> {
  return acceptedOf(call(io, '/auth/invite', { inviteToken: token, accept: true, proof }));
}

/* ── the browser half of WebAuthn ────────────────────────────────────────────────────────────────
   The host speaks base64url and the browser wants bytes. `parseCreationOptionsFromJSON` and
   `toJSON()` would do this, and older Safari has neither, so it is done by hand. */

function bytes(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(buf: ArrayBuffer | ArrayBufferView): string {
  const b = ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The DOM's error names, as the four things a screen says about them. */
function failed(e: unknown): Failure {
  const name = isObj(e) ? e.name : undefined;
  if (name === 'NotAllowedError' || name === 'AbortError') return { kind: 'cancelled' };
  if (name === 'InvalidStateError') return { kind: 'exists' };
  if (name === 'NotSupportedError' || name === 'SecurityError') return { kind: 'unsupported' };
  return { kind: 'refused', fix: null };
}

async function creation(io: Io, o: RegistrationOptions): Promise<Said<RegistrationJSON>> {
  if (!io.credentials) return { ok: false, kind: 'unsupported' };
  try {
    const cred = (await io.credentials.create({
      publicKey: {
        ...o,
        challenge: bytes(o.challenge),
        user: { ...o.user, id: bytes(o.user.id) },
        pubKeyCredParams: o.pubKeyCredParams.map((p) => ({ type: 'public-key' as const, alg: p.alg })),
        excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({ type: 'public-key' as const, id: bytes(c.id) })),
      },
    })) as PublicKeyCredential | null;
    /* One browser resolves `null` rather than throwing when the sheet closes at the wrong moment. */
    if (!cred) return { ok: false, kind: 'cancelled' };
    const r = cred.response as AuthenticatorAttestationResponse;
    return {
      ok: true,
      value: { id: cred.id, response: { clientDataJSON: b64url(r.clientDataJSON), attestationObject: b64url(r.attestationObject) } },
    };
  } catch (e) {
    return { ok: false, ...failed(e) };
  }
}

/** `mediation` and `signal` are the autofill's (`passkeyAutofill`): a pressed button asks with neither. */
async function assertion(
  io: Io,
  o: AssertionOptions,
  how: { mediation?: CredentialMediationRequirement; signal?: AbortSignal } = {},
): Promise<Said<AssertionJSON>> {
  if (!io.credentials) return { ok: false, kind: 'unsupported' };
  try {
    const cred = (await io.credentials.get({
      ...how,
      publicKey: {
        ...o,
        challenge: bytes(o.challenge),
        allowCredentials: (o.allowCredentials ?? []).map((c) => ({ type: 'public-key' as const, id: bytes(c.id) })),
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, kind: 'cancelled' };
    const r = cred.response as AuthenticatorAssertionResponse;
    return {
      ok: true,
      value: {
        id: cred.id,
        response: {
          clientDataJSON: b64url(r.clientDataJSON),
          authenticatorData: b64url(r.authenticatorData),
          signature: b64url(r.signature),
          userHandle: r.userHandle ? b64url(r.userHandle) : null,
        },
      },
    };
  } catch (e) {
    return { ok: false, ...failed(e) };
  }
}
