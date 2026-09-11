/**
 * Signing in, from the browser's side: the `/auth/*` calls and the WebAuthn half under them.
 *
 * ONLY `/signin` AND SETTINGS IMPORT THIS. The shell never does, so none of it reaches the entry chunk
 * every screen waits for, which is what the bundle gate measures.
 *
 * NOTHING HERE THROWS AND NOTHING LOGS. Every outcome is a value the screen can tell apart from the
 * others, and a credential goes into one request body and nowhere else: not a console, not a URL, not
 * a returned sentence.
 *
 * THE TYPES ARE RESTATED from `@braindog/ports`' `auth.ts`, which the web app may not import (`50 §1`,
 * and `graph` counts a type import as an edge). Only the fields this file reads are here.
 */

/** Who a live session belongs to. */
export type Who = { person: string; email: string; record: string | null; provedAt: number };

/** `GET /auth/methods`: what the Directory offers, plus what only the host knows. */
export type Methods = {
  passkey: boolean;
  magic: boolean;
  /** The self-host's server key is accepted here. */
  key: boolean;
  /** The host lets anyone in without a session: a self-host started without a key. */
  open: boolean;
  demo: boolean;
  /** Why nothing is offered: no key to check sessions with, or an origin no cookie can be set on. */
  why?: 'not-configured' | 'insecure' | undefined;
  me: Who | null;
  /** No passkey exists yet, so the screen leads with the way that needs none. */
  firstRun?: boolean | undefined;
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
  | { kind: 'unsupported' };

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
  if (!isObj(v) || typeof v.passkey !== 'boolean' || typeof v.magic !== 'boolean' || typeof v.key !== 'boolean') return null;
  return {
    passkey: v.passkey,
    magic: v.magic,
    key: v.key,
    open: v.open === true,
    demo: v.demo === true,
    me: whoOf(v.me),
    ...(v.why === 'not-configured' || v.why === 'insecure' ? { why: v.why } : {}),
    ...(typeof v.firstRun === 'boolean' ? { firstRun: v.firstRun } : {}),
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

/** Sign in with a passkey this device or a nearby phone holds. */
export async function passkeySignIn(io: Io = live()): Promise<Said<Who>> {
  const asked = await call(io, '/auth/passkey/assert/options', {});
  if (!asked.ok) return asked;
  const credential = await assertion(io, asked.value as AssertionOptions);
  if (!credential.ok) return credential;
  return signedIn(call(io, '/auth/passkey/assert', { credential: credential.value }));
}

/** Add a passkey for the person signed in, on this device. */
export async function passkeyRegister(io: Io = live()): Promise<Said<PasskeyInfo>> {
  const asked = await call(io, '/auth/passkey/register/options', {});
  if (!asked.ok) return asked;
  const credential = await creation(io, asked.value as RegistrationOptions);
  if (!credential.ok) return credential;
  const out = await call(io, '/auth/passkey/register', { credential: credential.value });
  if (!out.ok) return out;
  const info = passkeyOf(out.value);
  return info ? { ok: true, value: info } : { ok: false, kind: 'refused', fix: null };
}

/** Trade the self-host's server key for a session. The key goes in this one body and is not kept. */
export async function exchangeKey(serverKey: string, io: Io = live()): Promise<Said<Who>> {
  const key = serverKey.trim();
  if (!key) return { ok: false, kind: 'refused', fix: null };
  return signedIn(call(io, '/auth/token', { serverKey: key }));
}

/** Ask for a sign-in link. The host answers alike whether or not it knows the address. */
export async function requestLink(email: string, io: Io = live()): Promise<Said<null>> {
  return done(call(io, '/auth/magic/start', { email: email.trim() }));
}

/** Spend a link that arrived in the address. */
export async function redeemLink(link: Link, io: Io = live()): Promise<Said<Who>> {
  return signedIn(call(io, '/auth/magic/redeem', link.kind === 'magic' ? { linkToken: link.token } : { claimToken: link.token }));
}

export async function signOut(io: Io = live()): Promise<Said<null>> {
  return done(call(io, '/auth/logout', {}));
}

export async function passkeys(io: Io = live()): Promise<Said<PasskeyInfo[]>> {
  const out = await call(io, '/auth/passkeys');
  if (!out.ok) return out;
  const rows = Array.isArray(out.value) ? out.value : isObj(out.value) && Array.isArray(out.value.passkeys) ? out.value.passkeys : null;
  if (!rows) return { ok: false, kind: 'refused', fix: null };
  return { ok: true, value: rows.map(passkeyOf).filter((k): k is PasskeyInfo => k !== null) };
}

export async function removePasskey(id: string, io: Io = live()): Promise<Said<null>> {
  return done(call(io, '/auth/passkey/remove', { id }));
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

async function assertion(io: Io, o: AssertionOptions): Promise<Said<AssertionJSON>> {
  if (!io.credentials) return { ok: false, kind: 'unsupported' };
  try {
    const cred = (await io.credentials.get({
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
