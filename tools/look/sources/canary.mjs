/**
 * `canary`: the canary record, read through the session its sign-in left, and nothing pressed (PRF-A09 job 4).
 *
 *   node tools/look/run.mjs --source canary --set all              the canary SMOKE_SLUG names, on CANARY_ORIGIN
 *   node tools/look/run.mjs --source canary:self-host --set all    a fresh self-host, signed in by its own key
 *
 * WHAT THE LIVE LOOK CANNOT DRAW, THIS DRAWS. `live.mjs` hands on a token, and a token never opens `/account/*` or the
 * ADMIN group, so Usage, Billing and Settings' agents and devices are screens it says it cannot draw. A session can, so
 * the canary is where those screens are seen on a Cloud record after every deploy. Its data is invented, so its
 * pictures never count as seen (DIRECTION 40) and its sheet is kept as the run's artefact.
 *
 * A SESSION, NEVER A KEY. `signin-live` signs in to the canary with the passkey from his sitting and keeps the browser's
 * state in the file `CANARY_SESSION` names; this reads the cookie for the canary's own origin out of it and sends it
 * there and nowhere else, with the `Origin` the record checks. No answer brings a cookie back. With no session it
 * refuses to start, in one sentence. On a self-host, before his sitting, the session is the self-host's own key spent
 * at its sign-in door, and the record's reads go with that key, since the gates' record's one person is on no record.
 *
 * IT CANNOT PRESS. A read goes on: a route the host's table marks `writes: false`, any GET under `/account`, and the
 * four reads under `/auth` the shell asks. Every other request is refused here and counted, as the live look counts
 * them, so a screen that writes while it only draws shows "writes blocked" above 0. Signing out is a write and is never
 * sent, so a look can never end the session the rest of the lane reads with.
 *
 * `all` AT 390 AND 1512, the phone and the laptop (`widths`), which the lane asks for with `--set all`.
 */

import { ROUTES } from '../../../packages/host/src/index.ts';
import { cookieFor, LIVE_ORIGIN, selfHost, selfHostSession, sessionFrom, SLUG } from '../../canary/lib.mjs';

/** The widths of a canary look: the phone and the laptop. */
export const WIDTHS = [390, 1512];

/** The set the lane draws. */
export const SET = 'all';

/** The reads under `/auth` a screen asks: who is signed in, how, and with what. */
export const AUTH_READS = new Set(['/auth/methods', '/auth/session', '/auth/passkeys', '/auth/sessions']);

/** The sentence a look with no session stops on. */
export const NO_SESSION =
  'The canary look draws only with the session from the canary’s sign-in, and CANARY_SESSION names none, so run signin-live first or draw canary:self-host.';

const refusal = (fix) => ({ ok: false, refusal: { code: 'FORBIDDEN', fix } });

/**
 * Open the forwarder. `env` stands in for `process.env`; `send` is `fetch` unless a test hands in another; `read` reads
 * the session file. `arg` is `self-host`, a record's name, or nothing for `SMOKE_SLUG`.
 */
export async function open(arg, { env = process.env, send = fetch, read, routes = ROUTES } = {}) {
  let host = null;
  let target;
  if (arg === 'self-host') {
    host = await selfHost();
    try {
      /* THE GATES' RECORD LETS ITS OWNER READ BY ITS KEY ALONE: its Directory's one person is on no record, so a session
         opens `/auth` and `/account` there and `/api` answers "does not reach this record". The key goes on `/api` and
         nowhere else, as every other gate's record is read, and the session on the rest. */
      target = { base: host.base, origin: host.origin, slug: host.slug, api: '', cookie: await selfHostSession(host, send), bearer: host.key };
    } catch (e) {
      await host.close();
      throw e;
    }
  } else {
    const slug = String(arg || env.SMOKE_SLUG || '').trim();
    if (!SLUG.test(slug)) throw new Error('Name the canary to draw: --source canary:<record>, or set SMOKE_SLUG.');
    const origin = new URL(String(env.CANARY_ORIGIN ?? '').trim() || LIVE_ORIGIN).origin;
    const kept = await sessionFrom(env, ...(read ? [read] : []));
    const cookie = kept.state ? cookieFor(kept.state, origin) : null;
    if (cookie === null) throw new Error(NO_SESSION);
    target = { base: origin, origin, slug, api: `/app/${slug}`, cookie };
  }

  const byName = new Map(routes.map((r) => [r.name, r]));
  const tally = { forwarded: 0, refused: 0, writes: 0, outside: 0, blocked: {} };
  const refuse = (res, kind, what, fix) => {
    tally.refused += 1;
    tally[kind] += 1;
    tally.blocked[what] = (tally.blocked[what] ?? 0) + 1;
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(refusal(fix)));
  };

  /** Where a request goes, or why it does not: `{ url }` or `{ kind, what, fix }`. */
  function routeOf(method, at) {
    const name = /^\/api\/([A-Za-z][A-Za-z0-9]*)$/u.exec(at.pathname)?.[1];
    if (name !== undefined) {
      const route = byName.get(name);
      if (route === undefined) return { kind: 'outside', what: name, fix: `The record has no read called ${name}.` };
      if (route.writes || !['GET', 'HEAD', 'POST'].includes(method))
        return { kind: 'writes', what: name, fix: `The canary look reads and never writes, so ${name} was not sent.` };
      return { url: `${target.base}${target.api}/api/${name}${at.search}` };
    }
    const reading = method === 'GET' || method === 'HEAD';
    if (reading && (at.pathname.startsWith('/account/') || AUTH_READS.has(at.pathname))) return { url: `${target.base}${at.pathname}${at.search}` };
    if (at.pathname.startsWith('/account/') || at.pathname.startsWith('/auth/'))
      return { kind: 'writes', what: at.pathname, fix: `The canary look reads and never writes, so ${at.pathname} was not sent.` };
    return { kind: 'outside', what: at.pathname, fix: `The canary look hands on the record's reads and nothing else, so ${at.pathname} was not sent.` };
  }

  async function handle(req, res, at) {
    const method = req.method ?? 'GET';
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const to = routeOf(method, at);
    if (to.url === undefined) return refuse(res, to.kind, to.what, to.fix);
    const keyed = target.bearer !== undefined && to.url.startsWith(`${target.base}${target.api}/api/`);
    const headers = { accept: 'application/json', origin: target.origin, ...(keyed ? { authorization: `Bearer ${target.bearer}` } : { cookie: target.cookie }) };
    if (method === 'POST') headers['content-type'] = 'application/json';
    tally.forwarded += 1;
    try {
      const out = await send(to.url, { method, headers, redirect: 'error', ...(method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
      const body = Buffer.from(await out.arrayBuffer());
      res.writeHead(out.status, { 'content-type': out.headers.get('content-type') ?? 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      /* The error's own text is not repeated: it can quote the request, and the request carried the session. */
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: `The canary did not answer ${at.pathname}.` } }));
    }
  }

  return {
    name: 'canary',
    record: host === null ? `the canary, ${target.slug}` : 'the canary on a fresh self-host',
    seen: false,
    pressable: false,
    prefix: host === null ? `/${target.slug}` : '',
    cannot: [],
    widths: WIDTHS,
    set: SET,
    handle,
    counts: () => structuredClone(tally),
    close: async () => {
      await host?.close();
    },
  };
}
