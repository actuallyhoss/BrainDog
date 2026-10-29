/**
 * What every part of the canary shares: which record it is on, how it reaches it, and the two things the owner's sitting
 * makes.
 *
 * TWO PLACES, ONE SWITCH. Until the owner's sitting there is no canary on brain.dog, so every step stands up a fresh self-host
 * in its own process (the gates' record, `tools/gates/record.mjs`) and says "self-host only" on its first line. The
 * switch is `SMOKE_SLUG`, the variable the owner's sitting sets: unset, self-host only; set, the canary on `CANARY_ORIGIN`
 * (brain.dog unless told otherwise), and from then a missing secret or a missing session is red, never a skip.
 *
 * THE SESSION IS A FILE, NAMED BY `CANARY_SESSION`: the browser state `signin-live` keeps once it has signed in to the
 * canary (Playwright's `storageState`). The look and the weekly reset read the cookie for the canary's own origin out
 * of it and send it nowhere else. No line any part of the canary prints holds it.
 *
 * THE PASSKEY IS `CANARY_PASSKEY`: the credential Chrome's virtual authenticator made in the owner's sitting, exactly as
 * `WebAuthn.getCredentials` hands it back and `WebAuthn.addCredential` takes it, as base64url JSON. `packCredential` and
 * `unpackCredential` are the one place its shape is written, so `enrol.mjs` and `signin-live` cannot disagree.
 */

import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

import { forward, forwards, IDENTITY, serverKeyFor, startRecord } from '../gates/record.mjs';

/** The words every step says first while there is no canary on brain.dog. */
export const SELF_HOST_ONLY = 'self-host only';

/** The live canary's host when `CANARY_ORIGIN` does not name another. */
export const LIVE_ORIGIN = 'https://app.brain.dog';

/** A record's name as the Directory hands one out. */
export const SLUG = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;

/** Where the canary is: `{ live: false }` until `SMOKE_SLUG` is set, then `{ live: true, origin, slug }`. */
export function where(env = process.env) {
  const slug = String(env.SMOKE_SLUG ?? '').trim();
  if (slug === '') return { live: false };
  if (!SLUG.test(slug)) throw new Error(`SMOKE_SLUG ${JSON.stringify(slug)} is not a record's name, so the canary cannot be found.`);
  const origin = new URL(String(env.CANARY_ORIGIN ?? '').trim() || LIVE_ORIGIN).origin;
  if (!origin.startsWith('https://')) throw new Error(`${origin} is not https, so the canary's session will not be sent to it.`);
  return { live: true, origin, slug };
}

/**
 * A fresh self-host: the gates' record in memory, its owner's server key, and its own name. Its origin is
 * `http://localhost:<port>`, the one the record checks a sign-in's `Origin` against (an RP ID is never an address).
 */
export async function selfHost() {
  const record = await startRecord(0);
  const port = new URL(record.base).port;
  return { base: record.base, origin: `http://localhost:${port}`, slug: IDENTITY.slug, key: serverKeyFor(record.base), forward, close: () => record.close() };
}

/** One sign-in on a self-host through its server key, as the sign-in screen's key door does: the `bd_s` cookie. */
export async function selfHostSession(host, send = fetch) {
  const res = await send(`${host.base}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: host.origin },
    body: JSON.stringify({ serverKey: host.key }),
  });
  const cookie = cookiesOf(res.headers).find((c) => c.name === 'bd_s');
  if (res.status !== 200 || cookie === undefined) throw new Error(`The self-host did not sign its own key in (it answered ${res.status}), so there is no session to draw with.`);
  return `${cookie.name}=${cookie.value}`;
}

/** The `name=value` pairs of every `set-cookie` on an answer. */
function cookiesOf(headers) {
  const all = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  return all.map((c) => /^([^=;\s]+)=([^;]*)/u.exec(c)).filter(Boolean).map((m) => ({ name: m[1], value: m[2] }));
}

/**
 * The `Cookie` header for `origin` out of a kept browser state, or `null` when it holds none that is live there. A
 * cookie for another host, a path below `/`, or one that has run out is left behind.
 */
export function cookieFor(state, origin, now = Date.now()) {
  const host = new URL(origin).hostname;
  const cookies = Array.isArray(state?.cookies) ? state.cookies : [];
  const live = cookies.filter((c) => {
    if (typeof c?.name !== 'string' || typeof c?.value !== 'string') return false;
    const domain = String(c.domain ?? '').replace(/^\./u, '');
    if (domain !== host && !host.endsWith(`.${domain}`)) return false;
    if ((c.path ?? '/') !== '/') return false;
    return !(typeof c.expires === 'number' && c.expires > 0 && c.expires * 1000 <= now);
  });
  return live.length === 0 ? null : live.map((c) => `${c.name}=${c.value}`).join('; ');
}

/** The kept browser state `CANARY_SESSION` names, read, or a sentence saying why there is none. */
export async function sessionFrom(env = process.env, read = (p) => import('node:fs/promises').then((fs) => fs.readFile(p, 'utf8'))) {
  const file = String(env.CANARY_SESSION ?? '').trim();
  if (file === '') return { why: 'CANARY_SESSION names no file, so there is no session from the canary’s sign-in.' };
  try {
    return { state: JSON.parse(await read(file)) };
  } catch {
    return { why: 'The file CANARY_SESSION names could not be read as a kept session, so signin-live did not leave one.' };
  }
}

/** The credential as `CANARY_PASSKEY` holds it: the CDP credential, JSON, base64url. Only the fields `addCredential` takes. */
export function packCredential(c) {
  for (const f of ['credentialId', 'rpId', 'privateKey', 'userHandle'])
    if (typeof c?.[f] !== 'string' || c[f] === '') throw new Error(`The passkey the browser made has no ${f}, so it cannot be kept.`);
  const kept = { credentialId: c.credentialId, isResidentCredential: c.isResidentCredential !== false, rpId: c.rpId, privateKey: c.privateKey, userHandle: c.userHandle, signCount: Number(c.signCount) || 0 };
  return Buffer.from(JSON.stringify(kept)).toString('base64url');
}

/** `packCredential` read back, or a throw whose sentence holds nothing of the value. */
export function unpackCredential(text) {
  let c;
  try {
    c = JSON.parse(Buffer.from(String(text ?? '').trim(), 'base64url').toString('utf8'));
  } catch {
    throw new Error('CANARY_PASSKEY is not a kept passkey. Run tools/canary/enrol.mjs again in a sitting.');
  }
  for (const f of ['credentialId', 'rpId', 'privateKey', 'userHandle'])
    if (typeof c?.[f] !== 'string' || c[f] === '') throw new Error('CANARY_PASSKEY is not a kept passkey. Run tools/canary/enrol.mjs again in a sitting.');
  return c;
}

/**
 * One call to a record's method, the way the app makes it: POST `/<slug>/api/<method>` with a JSON body, and with
 * either a bearer or a session cookie and the `Origin` the record checks. The answer as `{ status, said }`; a host that
 * did not answer is status 0 and a sentence, never the error's own text, which could quote the request.
 */
export async function call(at, method, body = {}, { send = fetch } = {}) {
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  if (at.bearer) headers.authorization = `Bearer ${at.bearer}`;
  if (at.cookie) Object.assign(headers, { cookie: at.cookie, origin: at.origin });
  const url = `${at.base ?? at.origin}${at.slug && at.live ? `/${at.slug}` : ''}/api/${method}`;
  try {
    const res = await send(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(600_000) });
    return { status: res.status, said: await res.json().catch(() => null) };
  } catch {
    return { status: 0, said: { ok: false, refusal: { code: 'UNREACHABLE', fix: `${at.origin} did not answer ${method}.` } } };
  }
}

/** A refusal's own sentence, or the status, for a line a person reads. */
export const fixOf = (answer) => answer?.said?.refusal?.fix ?? `it answered ${answer?.status ?? 'nothing'}`;

/**
 * Where the lane keeps the canary's session between its steps: `CANARY_SESSION` when it names a file, else one in the
 * runner's own temporary folder. NEVER UNDER `LANE_OUT`, which is the folder the workflow hangs on the run as the
 * canary's sheet, so a session kept there would be handed to anyone who can read the run.
 */
export function sessionPath(env = process.env) {
  const named = String(env.CANARY_SESSION ?? '').trim();
  if (named !== '') return named;
  const tmp = String(env.RUNNER_TEMP ?? '').trim() || tmpdir();
  return join(tmp, 'braindog-canary', 'session.json');
}

/**
 * The kept session ended through the product's own door (`POST /auth/logout`) and its file removed, so a session made
 * for one look does not outlive it. Says nothing of the cookie; answers whether the host took it.
 */
export async function endSession(origin, cookie, file, send = fetch) {
  let ended = false;
  if (cookie) {
    try {
      const res = await send(`${origin}/auth/logout`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}', redirect: 'error' });
      ended = res.status < 400;
    } catch {
      ended = false;
    }
  }
  if (file) await rm(file, { force: true }).catch(() => {});
  return ended;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/**
 * A fresh self-host a browser can drive: the built app and the gates' record behind it on one ephemeral port, at
 * `localhost` so passkeys work (a secure context with an RP ID that is a name). `/auth` sees the browser's own cookie,
 * so the passkey is the browser's ceremony against the record; `/api` carries the server key unless a request names
 * its own bearer, because the gates' record's one person is on no record and a session alone reaches none of it
 * (a key the sitting made is then asked with that key, never the server's). `{ origin, key, slug, close }`.
 */
export async function appSelfHost(build) {
  let record = null;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (forwards(url.pathname)) return record === null ? res.writeHead(503).end() : forward(req, res, record.base);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/u, '');
    if (rel.split(/[/\\]/u).includes('..')) return res.writeHead(400).end();
    for (const candidate of [rel, `${rel}.html`, join(rel, 'index.html')]) {
      const file = join(build, candidate);
      if (!(await stat(file).catch(() => null))?.isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      return createReadStream(file).pipe(res);
    }
    if (!Object.hasOwn(TYPES, extname(rel))) {
      res.writeHead(200, { 'content-type': TYPES['.html'] });
      return createReadStream(join(build, 'index.html')).pipe(res);
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, r));
  const origin = `http://localhost:${server.address().port}`;
  const close = async () => {
    await new Promise((r) => server.close(() => r()));
    await record?.close().catch(() => {});
  };
  try {
    record = await startRecord(0, { origin });
  } catch (e) {
    await close();
    throw e;
  }
  return { origin, key: serverKeyFor(record.base), slug: IDENTITY.slug, close };
}
