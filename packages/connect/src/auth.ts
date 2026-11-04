/**
 * The eight ways a run proves who it is, and the two functions that open a sealed grant.
 *
 * ONE PLACE SETS `Authorization`, AND IT IS HERE. Everything else in the package refuses to: a
 * declaration naming that header is refused at install and again in `resolveRequest`, so there is
 * exactly one line in the tree where a credential meets a request. That is what makes "no secret in
 * a file, no secret in a log" a thing a reader can check rather than a thing somebody remembers.
 *
 * THE PLAINTEXT LIVES FOR ONE RUN AND LEAVES IN NOTHING. `Grant.fields` is opened at the top of a
 * run and is never a property of a `PullResult`, an `applyPull` argument or a log line. A rotated
 * refresh token is the one value that goes back to the record, and it goes as `Sealed` ciphertext.
 *
 * THE KEY HIERARCHY IS THREE STEPS AND `12 §6` MADE BYTE-EXACT (`47 §4.6`): the root KEK unwraps the
 * record's `connector` DEK; HKDF over the DEK with the grant's id as `info` gives that grant its own
 * key; AES-GCM with the record, grant and version in the AAD opens the grant. Each step binds the
 * ciphertext to where it came from, so a grant blob moved to another grant id, another record or
 * another version does not decrypt — it throws, rather than opening as somebody else's credential.
 *
 * WHAT IS NOT DEFENDED, SAID OUT LOUD: a compromised Worker holds the KEK and can open every
 * connector grant. `12 §6.1` records the same trade for the vault, and `12 §7` carries the row a
 * person reads — *your connector credentials: we can read them, passphrase on or off*.
 *
 * `crypto.subtle` AND NOTHING FROM `node:`. AES-GCM, HKDF, HMAC, SHA-256 and RSASSA-PKCS1-v1_5 are
 * the whole surface (`31 §1`).
 */

import type { Clock, Http, Key, KeyStore } from '@braindog/ports';

import {
  isReservedHeader, PullError,
  type AuthDecl, type FetchDecl, type Grant, type ResolvedRequest,
} from './index.ts';

/* ── Bytes ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * `TextEncoder`, DECLARED TO RETURN `Bytes`.
 *
 * Node's lib types `encode` as `Uint8Array<ArrayBuffer>` and `@cloudflare/workers-types` types it
 * as `Uint8Array<ArrayBufferLike>`, so this package typechecked under one runtime and not the
 * other for as long as only one of them imported it. The assertion is safe where widening `Bytes`
 * would not be: a `TextEncoder` allocates its own buffer and can never hand back a view onto a
 * `SharedArrayBuffer`, which is the one case `crypto.subtle` refuses.
 */
const utf8 = new TextEncoder() as { encode(input?: string): Bytes };

/**
 * A byte array WebCrypto will take.
 *
 * `Uint8Array` ALONE IS `Uint8Array<ArrayBufferLike>`, which includes a `SharedArrayBuffer` and which
 * `crypto.subtle` will not accept — so an unannotated chain of HMACs typechecks until the first
 * `let`, and then fails somewhere that has nothing to do with the cause.
 */
type Bytes = Uint8Array<ArrayBuffer>;

const bin = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

/** Standard base64, which is what `Authorization: Basic` is defined in terms of. */
export const b64 = (bytes: Uint8Array): string => btoa(bin(bytes));

/** base64url without padding — how `12 §6` writes every sealed value on the wire. */
export const b64url = (bytes: Uint8Array): string => b64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

const unb64 = (text: string): Bytes => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The other way, accepting either alphabet and either padding, because a store may hold either. */
export const unb64url = (text: string): Bytes => {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  return unb64(padded + '='.repeat((4 - (padded.length % 4)) % 4));
};

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256 = async (bytes: Bytes): Promise<Bytes> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const hmac = async (key: Bytes, message: Bytes): Promise<Bytes> => {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, message));
};

/* ── The sealed grant ────────────────────────────────────────────────────────────────────────── */

/** A connector grant at rest. `ciphertext` and `nonce` are base64url; the rest is an index. */
export type Sealed = { ciphertext: string; nonce: string; kek_id: string; grant_id: string; version: number };

/** The record's `connector` DEK, wrapped by the root KEK. `vault_key` holds one per record. */
export type WrappedDek = { wrapped: string; nonce: string; kek_id: string };

/** The unit separator, which is what keeps `a‖bc` and `ab‖c` different AADs. */
const US = '\u001f';

const aadFor = (parts: readonly string[]): Bytes => utf8.encode(parts.join(US));

/**
 * The record's `connector` DEK, unwrapped.
 *
 * A NULL KEY IS `WRONG_KEY` AND NOT A CRASH. The root key rotating is an operational event with a
 * repair a person can carry out — re-wrap and retry — so it gets a code and a sentence rather than
 * a stack trace in a queue consumer.
 */
const openDek = async (dek: WrappedDek, recordId: string, keys: KeyStore): Promise<Key> => {
  const kek = await keys.byId(dek.kek_id);
  if (kek === null) throw new PullError('WRONG_KEY', 'grant.dek', { found: dek.kek_id, wanted: 'a key this host holds' });

  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64url(dek.nonce), additionalData: aadFor([recordId, 'connector']) },
    kek,
    unb64url(dek.wrapped),
  );
  /* HKDF OVER THE DEK, WITH THE GRANT'S ID AS `info`. One DEK per record and one key per grant: a
     ciphertext copied from one grant row to another is encrypted under a key that no longer exists
     for it, so the move fails rather than opening. */
  return crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
};

const grantKey = async (dekKey: Key, grantId: string, use: ('encrypt' | 'decrypt')[]): Promise<Key> =>
  crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8.encode(grantId) },
    dekKey,
    { name: 'AES-GCM', length: 256 },
    false,
    use,
  );

/**
 * A sealed grant, opened, as the bytes it was sealed from.
 *
 * THE AAD IS THE RECORD, THE GRANT AND THE VERSION, so the three ways a blob could be moved are the
 * three ways it fails to open: to another record, to another grant id, to another version of the
 * same grant. None of them is a check somebody has to remember to write — the decryption simply
 * does not succeed, which is the only kind of check that cannot be forgotten.
 */
export async function openSealed(sealed: Sealed, dek: WrappedDek, recordId: string, keys: KeyStore): Promise<Bytes> {
  const key = await grantKey(await openDek(dek, recordId, keys), sealed.grant_id, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: unb64url(sealed.nonce),
      additionalData: aadFor([recordId, sealed.grant_id, String(sealed.version)]),
    },
    key,
    unb64url(sealed.ciphertext),
  );
  return new Uint8Array(plain);
}

/**
 * The mirror of `openSealed`, for the one value that travels back: a rotated refresh token.
 *
 * `version` IS THE VERSION THIS IS SEALED AT, not the one before it. `47 §4.6` describes the
 * rotation — *the mirror, with `version + 1` in the AAD* — and the increment belongs to the caller
 * that knows a rotation happened, because a `seal` that incremented silently could not be tested
 * against `openSealed` as the exact inverse it has to be.
 */
export async function seal(
  plain: Bytes,
  grantId: string,
  version: number,
  dek: WrappedDek,
  recordId: string,
  keys: KeyStore,
): Promise<Sealed> {
  const key = await grantKey(await openDek(dek, recordId, keys), grantId, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aadFor([recordId, grantId, String(version)]) },
    key,
    plain,
  );
  return {
    ciphertext: b64url(new Uint8Array(cipher)),
    nonce: b64url(nonce),
    kek_id: dek.kek_id,
    grant_id: grantId,
    version,
  };
}

/** The grant's plaintext, as `47 §4.6` defines it: a UTF-8 JSON object of string fields. */
export function grantFields(plain: Bytes): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new PullError('PULL_AUTH_REJECTED', 'grant', { wanted: 'a JSON object of string fields' });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new PullError('PULL_AUTH_REJECTED', 'grant', { wanted: 'a JSON object of string fields' });
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
  return out;
}

/* ── The eight kinds ─────────────────────────────────────────────────────────────────────────── */

/** A field the auth step needs. Missing is a refusal and never an empty string in a header. */
const field = (grant: Grant, name: string, kind: string): string => {
  const value = Object.hasOwn(grant.fields, name) ? grant.fields[name] : undefined;
  if (value === undefined || value === '')
    throw new PullError('PULL_AUTH_REJECTED', `fetch.auth.${kind}`, { wanted: `a grant holding ${name}` });
  return value;
};

/**
 * What the token step hands the run: the access token every page of it will present, and a refresh
 * token the provider replaced along the way.
 *
 * ONCE PER RUN AND NOT ONCE PER PAGE. `47 §5.1` makes this step 4 and the page loop step 6 for a
 * reason a reader can check against a bill: a forty-page run that refreshed per page is forty token
 * requests, forty chances to be rate-limited on the auth endpoint, and — for a provider that rotates
 * — thirty-nine refresh tokens minted and thrown away, the last of which is the only one that still
 * works. It was written that way first.
 *
 * THE ROTATED TOKEN IS NOT SEALED HERE, because sealing needs the DEK and the record id, which are
 * the run's and not the auth step's. A function that quietly reached for a key would be a second
 * place credentials are handled.
 */
export type TokenStep = { token: string | null; rotatedRefreshToken: string | null };

/** `47 §4.1`: a token endpoint is a literal `https://` URL, checked again here for the same reason. */
const tokenUrl = (raw: string, at: string): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: raw, wanted: 'an https URL' });
  }
  if (url.protocol !== 'https:')
    throw new PullError('PULL_REQUEST_REFUSED', at, { found: url.protocol, wanted: 'https' });
  return url;
};

/**
 * One POST to a token endpoint, form-encoded, and the JSON it answers.
 *
 * 401 AND 403 ARE THE CREDENTIAL AND EVERYTHING ELSE IS THE PROVIDER. The two are different repairs
 * — reconnect the credential, versus wait for the next attempt — and folding them together is how a
 * connector stays paused through an outage or retries a dead token on a ladder forever.
 */
const postToken = async (
  url: URL,
  form: Record<string, string>,
  at: string,
  deps: { http: Http; clock: Clock },
): Promise<Record<string, unknown>> => {
  const body = Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const res = await deps.http.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    timeoutMs: 6000,
  });

  if (res.status === 401 || res.status === 403)
    throw new PullError('PULL_AUTH_REJECTED', at, { found: res.status, wanted: 'a token' });
  if (!res.ok) throw new PullError('PULL_PROVIDER_UNAVAILABLE', at, { found: res.status, wanted: 'a token' });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PullError('PULL_SHAPE_MISMATCH', at, { wanted: 'a JSON token response' });
  }
  if (parsed === null || typeof parsed !== 'object')
    throw new PullError('PULL_SHAPE_MISMATCH', at, { wanted: 'a JSON token response' });
  return parsed as Record<string, unknown>;
};

const accessToken = (body: Record<string, unknown>, at: string): string => {
  const token = body.access_token;
  if (typeof token !== 'string' || token === '')
    throw new PullError('PULL_SHAPE_MISMATCH', at, { wanted: 'an access_token' });
  return token;
};

/* ── RS256 ───────────────────────────────────────────────────────────────────────────────────── */

const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----/u;

const jwtPart = (value: unknown): string => b64url(utf8.encode(JSON.stringify(value)));

/**
 * One RS256 assertion, signed with the grant's PKCS#8 key.
 *
 * RS256 AND NO JWKS — `47 §10`'s ceiling. `iss` and `kid` come off the grant, so there is no key
 * discovery, no network call before the network call, and nothing to cache or to get stale.
 */
const signJwt = async (
  decl: Extract<AuthDecl, { kind: 'jwt_rs256' }>,
  grant: Grant,
  nowMs: number,
): Promise<string> => {
  const pem = PEM.exec(field(grant, 'private_key', 'jwt_rs256'));
  if (pem === null)
    throw new PullError('PULL_AUTH_REJECTED', 'fetch.auth.jwt_rs256', { wanted: 'a PKCS#8 PEM private key' });

  let key: Key;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      unb64((pem[1] ?? '').replace(/\s+/gu, '')),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw new PullError('PULL_AUTH_REJECTED', 'fetch.auth.jwt_rs256', { wanted: 'a PKCS#8 PEM private key' });
  }

  const iat = Math.floor(nowMs / 1000);
  const kid = grant.fields.kid;
  const head = jwtPart(kid === undefined || kid === '' ? { alg: 'RS256', typ: 'JWT' } : { alg: 'RS256', typ: 'JWT', kid });
  const claims = jwtPart({
    iss: field(grant, 'iss', 'jwt_rs256'),
    ...(decl.scope === undefined ? {} : { scope: decl.scope }),
    aud: decl.aud,
    iat,
    exp: iat + (decl.ttl_s ?? 3600),
  });

  const signed = `${head}.${claims}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8.encode(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
};

/* ── SigV4 ───────────────────────────────────────────────────────────────────────────────────── */

/** RFC 3986 unreserved, which is stricter than `encodeURIComponent` by four characters. */
const rfc3986 = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `YYYYMMDDTHHMMSSZ`, which is the only date format SigV4 has. */
const amzDate = (ms: number): string => new Date(ms).toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');

/**
 * `Authorization: AWS4-HMAC-SHA256 …`, by the four steps of the IAM User Guide (`47 §13` D2).
 *
 * ONLY `host`, `x-amz-date` AND THE SESSION TOKEN ARE SIGNED. `47 §4.5` fixes `SignedHeaders`, and
 * a signature over a header set that varies with the declaration is a signature nobody can
 * reproduce from a failing request.
 *
 * THE BODY IS ALWAYS HASHED. No `UNSIGNED-PAYLOAD` and no chunked signing — a pull reads, and the
 * ceiling is `47 §10`'s.
 */
const sigv4 = async (
  decl: Extract<AuthDecl, { kind: 'aws_sigv4' }>,
  grant: Grant,
  req: ResolvedRequest,
  nowMs: number,
): Promise<Record<string, string>> => {
  const keyId = field(grant, 'access_key_id', 'aws_sigv4');
  const secret = field(grant, 'secret_access_key', 'aws_sigv4');
  const session = grant.fields.session_token;

  const stamp = amzDate(nowMs);
  const day = stamp.slice(0, 8);
  const host = req.url.host;

  const query = [...req.url.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const signedPairs: [string, string][] = [['host', host], ['x-amz-date', stamp]];
  if (session !== undefined && session !== '') signedPairs.push(['x-amz-security-token', session]);
  signedPairs.sort((a, b) => a[0].localeCompare(b[0]));

  const canonical = [
    req.method,
    req.url.pathname,
    query,
    `${signedPairs.map(([k, v]) => `${k}:${v.trim()}`).join('\n')}\n`,
    signedPairs.map(([k]) => k).join(';'),
    hex(await sha256(utf8.encode(req.body ?? ''))),
  ].join('\n');

  const scope = `${day}/${decl.region}/${decl.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hex(await sha256(utf8.encode(canonical)))].join('\n');

  let signing: Bytes = utf8.encode(`AWS4${secret}`);
  for (const step of [day, decl.region, decl.service, 'aws4_request']) signing = await hmac(signing, utf8.encode(step));

  const headers: Record<string, string> = {
    'x-amz-date': stamp,
    authorization:
      `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, ` +
      `SignedHeaders=${signedPairs.map(([k]) => k).join(';')}, ` +
      `Signature=${hex(await hmac(signing, utf8.encode(toSign)))}`,
  };
  if (session !== undefined && session !== '') headers['x-amz-security-token'] = session;
  return headers;
};

/* ── The token step, once ────────────────────────────────────────────────────────────────────── */

/**
 * The one network call the credential itself needs, made once before the first page.
 *
 * SIX OF THE EIGHT KINDS ANSWER `null` AND MAKE NO REQUEST. A bearer, a basic pair, a header, a
 * query parameter, a presented assertion and a SigV4 signature are all built from the grant and the
 * clock, so a run that pages forty times makes forty requests and not eighty.
 */
export async function tokenStep(
  decl: FetchDecl,
  grant: Grant,
  deps: { http: Http; clock: Clock },
): Promise<TokenStep> {
  const auth = decl.auth;
  const at = 'fetch.auth.token_url';

  if (auth.kind === 'oauth2_refresh') {
    const body = await postToken(
      tokenUrl(auth.token_url, at),
      {
        grant_type: 'refresh_token',
        refresh_token: field(grant, 'refresh_token', 'oauth2_refresh'),
        client_id: field(grant, 'client_id', 'oauth2_refresh'),
        client_secret: field(grant, 'client_secret', 'oauth2_refresh'),
        ...(auth.scope === undefined ? {} : { scope: auth.scope }),
      },
      at,
      deps,
    );
    /* A PROVIDER THAT ROTATED THE REFRESH TOKEN HAS INVALIDATED THE OLD ONE. Dropping the new one
       means every later run fails to authenticate and the connector pauses — a failure that arrives
       an hour later and points at the credential rather than at the code that discarded it. */
    const rotated = body.refresh_token;
    return {
      token: accessToken(body, at),
      rotatedRefreshToken:
        typeof rotated === 'string' && rotated !== '' && rotated !== grant.fields.refresh_token ? rotated : null,
    };
  }

  if (auth.kind === 'jwt_rs256' && auth.mode === 'exchange') {
    if (auth.token_url === undefined)
      throw new PullError('PULL_REQUEST_REFUSED', at, { wanted: 'a token_url, which mode: exchange needs' });
    const body = await postToken(
      tokenUrl(auth.token_url, at),
      { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await signJwt(auth, grant, deps.clock.now()) },
      at,
      deps,
    );
    return { token: accessToken(body, at), rotatedRefreshToken: null };
  }

  return { token: null, rotatedRefreshToken: null };
}

/* ── applyAuth, per page ─────────────────────────────────────────────────────────────────────── */

/** The two kinds that present what the token step fetched, and have nothing to present without it. */
const presented = (token: string | null): string => {
  if (token === null)
    throw new PullError('PULL_AUTH_REJECTED', 'fetch.auth', { wanted: 'the token step to have run before this page' });
  return `Bearer ${token}`;
};

/**
 * The credential, onto one already-resolved request.
 *
 * AFTER `resolveRequest` AND NOT INSIDE IT, which is why a `query_param` token is appended rather
 * than substituted: the URL is finished and checked against `base` before a secret is anywhere near
 * it, so there is no path by which a credential can change where a request goes.
 *
 * IT IS `async` AND IT REACHES NO NETWORK. RS256 and SigV4 are `crypto.subtle` calls and those are
 * promises; `deps` is not a parameter here at all, so the compiler is what says this function
 * cannot make a request — which is the claim that lets it run once per page.
 */
export async function applyAuth(
  decl: FetchDecl,
  grant: Grant,
  req: ResolvedRequest,
  token: string | null,
  nowMs: number,
): Promise<ResolvedRequest> {
  return authorised(decl.auth, grant, req, token, nowMs);
}

/* ── A scheduled call's key ──────────────────────────────────────────────────────────────────── */

/**
 * The ways a record's `call` or `poll` sends its one key, as its declaration names them: connect's
 * `bearer`, `header`, `query_param` and `basic`, with `query` for `query_param`, as the shared contract for
 * call and poll `auth.kind` names them. The kernel keeps the same four (`ACTION_AUTH_KINDS`).
 */
export type CallAuth = { kind: 'bearer' | 'basic' } | { kind: 'header' | 'query'; name: string };

/**
 * A call's key as the fields the four kinds read.
 *
 * A CALL'S KEY IS ONE STRING IN THE VAULT, where a connector's grant is an object of fields. So the
 * string is the `token`, and for `basic` it is also the pair it spells, `user:password`, split at
 * the first colon because a password may hold one and a user name may not (RFC 7617). A key that
 * is itself a JSON object of string fields is read as a grant is (`grantFields`), so a key added
 * for a connector sends the same way from a call.
 */
function callFields(key: string): Record<string, string> {
  if (key.trimStart().startsWith('{')) {
    try {
      return grantFields(utf8.encode(key));
    } catch {
      /* NOT A GRANT, so it is a token that happens to start with a brace. */
    }
  }
  const colon = key.indexOf(':');
  return colon < 0 ? { token: key } : { token: key, username: key.slice(0, colon), password: key.slice(colon + 1) };
}

/**
 * A scheduled call's key, onto its request: the executor's one way to send it (`packages/host/src/actions.ts`).
 *
 * THROUGH `authorised`, THE SAME LINES A CONNECTOR'S PAGE GOES THROUGH, so a call sets `Authorization`
 * in the one place in the tree that does, and a header the declaration may not set is refused here
 * as it is for a connector. A key that does not hold what its kind reads (a `basic` key with no
 * colon) throws `PULL_AUTH_REJECTED`, which the executor answers as a key that cannot be sent.
 */
export async function authoriseCall(auth: CallAuth, key: string, req: ResolvedRequest, nowMs: number): Promise<ResolvedRequest> {
  const grant: Grant = { id: '', version: 1, fields: callFields(key) };
  const decl: AuthDecl =
    auth.kind === 'header'
      ? { kind: 'header', grant: '', name: auth.name }
      : auth.kind === 'query'
        ? { kind: 'query_param', grant: '', name: auth.name }
        : { kind: auth.kind, grant: '' };
  return authorised(decl, grant, req, null, nowMs);
}

/** `applyAuth`'s work, over the auth block alone, so a call that has no `FetchDecl` goes through the same lines. */
async function authorised(
  auth: AuthDecl,
  grant: Grant,
  req: ResolvedRequest,
  token: string | null,
  nowMs: number,
): Promise<ResolvedRequest> {
  const headers = { ...req.headers };
  const url = new URL(req.url.href);
  const out = (): ResolvedRequest =>
    req.body === undefined ? { url, method: req.method, headers } : { url, method: req.method, headers, body: req.body };

  if (auth.kind === 'none') return out();

  if (auth.kind === 'bearer') {
    const token = field(grant, 'token', 'bearer');
    /* A LINE BREAK IS NEVER A TOKEN, and no header can carry one: a key holding a whole notes file is said to be wrong
       here, as a key that does not hold what its kind sends, and not by a throw further on that reads as the network. */
    if (/[\r\n]/u.test(token.trim())) throw new PullError('PULL_AUTH_REJECTED', 'fetch.auth.bearer', { wanted: 'a grant holding one line' });
    headers.authorization = `Bearer ${token.trim()}`;
    return out();
  }

  if (auth.kind === 'basic') {
    const pair = `${field(grant, 'username', 'basic')}:${field(grant, 'password', 'basic')}`;
    headers.authorization = `Basic ${b64(utf8.encode(pair))}`;
    return out();
  }

  if (auth.kind === 'header') {
    /* THE NAME IS THE DECLARATION'S AND THE RESERVED LIST STILL APPLIES. `header` with
       `name: Authorization` is `bearer` written the long way round, and `name: Cookie` is a
       connector setting a cookie on somebody else's domain. */
    if (isReservedHeader(auth.name))
      throw new PullError('PULL_REQUEST_REFUSED', 'fetch.auth.name', { found: auth.name, wanted: 'a header the declaration may set' });
    headers[auth.name] = field(grant, 'token', 'header');
    return out();
  }

  if (auth.kind === 'query_param') {
    url.searchParams.append(auth.name, field(grant, 'token', 'query_param'));
    return out();
  }

  if (auth.kind === 'oauth2_refresh') {
    headers.authorization = presented(token);
    return out();
  }

  if (auth.kind === 'jwt_rs256') {
    headers.authorization =
      auth.mode === 'present' ? `Bearer ${await signJwt(auth, grant, nowMs)}` : presented(token);
    return out();
  }

  /* SIGV4 SIGNS THE REQUEST AS IT STANDS, so it is last: anything that changed the URL after the
     signature was computed would be a signature over a request nobody sent. */
  for (const [name, value] of Object.entries(await sigv4(auth, grant, { ...req, url }, nowMs))) headers[name] = value;
  return out();
}
