/**
 * The Cloud of `cloud-harness.ts`, listening: the Worker's own `fetch` over a real Directory and real records, behind a
 * port on 127.0.0.1, with people made the way an operator makes them.
 *
 * WHY IT LISTENS. The browser gates drew "the Cloud" as the self-host with two answers rewritten by the gate, the host's
 * word in `boot` and a billing answer that was one fixed line, and handed on no account door at all, so `/usage` was never
 * drawn from an answer the Worker gave. A gate serves a static build and forwards the record's paths to a
 * base, so the harness needs a base: this is it, and `tools/gates/record.mjs` starts one for its `cloud` variant.
 *
 * THE WORKER IS ASKED AT ITS OWN NAME. It answers `https://app.example.test` (`HOST`) and refuses a write from any other
 * origin, while a gate's browser is on `http://127.0.0.1:<port>`. So each request is rebuilt at `ORIGIN` and a write
 * says it came from there, which is what the site's own proxy does for `brain.dog`. Nothing else is changed in either
 * direction: the status, the headers and the bytes are the Worker's.
 *
 * ONE CLOCK, AND ONLY FOR THE WORKER. `src/index.ts` reads `Date.now()` in forty places and takes no clock, and a gate
 * pins its record and its page to one instant. Pinning `Date` for the whole process would also stop the
 * gate's own stopwatch and whatever else shares the process, so `Date` is pinned for one async context: inside a call
 * that entered through `at`, `Date.now()` and `new Date()` are `now`, and everywhere else they are the wall's. The
 * instant never moves, which is what a gate's self-host does too (`start({ now })`).
 *
 * NOT WORKERD, as `cloud-harness.ts` says of itself: a fault only workerd shows stays unseen here.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { cloud, HOST, ORIGIN } from './cloud-harness.ts';

/* NOT A SECRET. It guards a Worker that lives in this process until `close()`. */
export const OPERATOR = 'cloud-serve-operator-key-not-a-secret';

/** The instant the running call reads as now, when it entered through a pinned Cloud. */
const pinned = new AsyncLocalStorage<number>();
const Wall = Date;
let pins = 0;

/**
 * `Date`, answering the pinned instant inside a pinned call and the wall's everywhere else.
 *
 * THE SAME PROTOTYPE, so a date made here is a `Date` to every `instanceof`, whoever made it. Put in place while a
 * pinned Cloud is running and taken away when the last one closes.
 */
function Pinned(this: unknown, ...args: unknown[]): unknown {
  const at = pinned.getStore();
  if (new.target === undefined) return at === undefined ? Wall() : new Wall(at).toString();
  return Reflect.construct(Wall, args.length === 0 && at !== undefined ? [at] : args, new.target);
}
Pinned.prototype = Wall.prototype;
Pinned.now = (): number => pinned.getStore() ?? Wall.now();
Pinned.parse = Wall.parse;
Pinned.UTC = Wall.UTC;

const pin = (): void => {
  if (pins++ === 0) globalThis.Date = Pinned as unknown as DateConstructor;
};
const unpin = (): void => {
  if (--pins === 0) globalThis.Date = Wall;
};

/** Headers that describe one hop, and the two that name where the browser thinks it is. */
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'content-length', 'content-encoding', 'origin', 'referer']);
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A person an operator made here, signed in: their record, its name, and the cookie their browser would hold. */
export type Provisioned = { record: string; slug: string; email: string; cookie: string };

export type Usage = { runs: number; requests: number; bytes: number; ms: number; failures: number; held: number };
export type Run = { event: string; at: string; ingest: string; scope: string; usage: Usage };

type Refused = { code: string; fix: string };
type Envelope<T> = { ok: true; value: T } | { ok: false; refusal: Refused };

/**
 * Start one. `base` is `http://127.0.0.1:<port>`, `provision(email)` is a person with a record, signed in, and `close()`
 * hands the port back. `ask` and `meter` are the two things a caller in this process needs beside the port, `letters`
 * is every letter the Worker tried to send, `cloud` is the harness underneath for a test that needs its storage, and
 * `at(f)` runs `f` on this Cloud's clock, for a call made to one of its objects and not through its `fetch`.
 *
 * `now` IS THE WORKER'S CLOCK, as epoch milliseconds; left out, the Worker reads the wall. `env` joins the Worker's
 * bindings, over the operator key this file sets.
 */
export async function startCloud({ now, port = 0, env = {} }: { now?: number; port?: number; env?: Record<string, unknown> } = {}) {
  /* A KEY STORE, SO THE RECORDS HOLD KEYS AND SLASH HAS AN ENGINE TO ANSWER FOR. Without `KEK` a record is keyless for
     good (`src/keyless.ts`) and `/api/slash/status` answers 501, which is a host no person is on. NOT A SECRET: 32
     bytes made here, held in this process and gone with it. No model is bound, so nothing can be asked of one. */
  /* AND A SENDER, WHICH SENDS NOWHERE. A Worker with none answers `/auth/methods` with `magic: 'down'`, which is a
     Cloud whose mail has failed, and every sign-in screen would be drawn saying so. Each letter is kept in `letters`. */
  const letters: unknown[] = [];
  const c = await cloud({
    PROVISION_KEY: OPERATOR,
    KEK: randomBytes(32).toString('hex'),
    BRAINDOG_BUILD: '',
    AUTH_MAIL_FROM: `signin@${HOST}`,
    EMAIL: { send: async (letter: unknown) => void letters.push(letter) },
    ...env,
  });
  if (now !== undefined) pin();
  const at = <T>(f: () => T): T => (now === undefined ? f() : pinned.run(now, f));

  /**
   * One request through the Worker's `fetch`, on this Cloud's clock.
   *
   * WHAT THE WORKER LEAVES RUNNING AFTER ITS ANSWER IS LEFT RUNNING, AND A FAILURE THERE IS DROPPED, as the platform
   * drops it. `cloud()`'s own `ask` hands `waitUntil` nothing to hold, so a letter or a count that rejected after the
   * answer would be a rejection nobody handled, and Node ends the process on one: a gate would die between two pages.
   */
  const through = (request: Request): Promise<Response> =>
    at(() => c.bundle.default.fetch(request, c.env, { waitUntil: (later: unknown) => void Promise.resolve(later).catch(() => {}) }));

  /** A request at the Worker's own name, as a browser on its origin sends it: `cloud()`'s `ask`, through `through`. */
  const ask = (path: string, init: RequestInit & { cookie?: string; bearer?: string } = {}): Promise<Response> => {
    const { cookie, bearer, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (cookie !== undefined) headers.set('cookie', cookie);
    if (bearer !== undefined) headers.set('authorization', `Bearer ${bearer}`);
    if (rest.method === 'POST') {
      headers.set('origin', ORIGIN);
      headers.set('content-type', 'application/json');
    }
    return through(new Request(`${ORIGIN}${path}`, { ...rest, headers }));
  };

  const serve = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const method = req.method ?? 'GET';
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    /* A WRITE SAYS IT CAME FROM THE WORKER'S OWN ORIGIN, and so does a read that named one, as the site's proxy has it. */
    if (!SAFE.has(method) || req.headers.origin !== undefined) headers.set('origin', ORIGIN);
    const out = await through(new Request(`${ORIGIN}${req.url ?? '/'}`, { method, headers, ...(chunks.length > 0 && !SAFE.has(method) ? { body: Buffer.concat(chunks) } : {}) }));
    const back: Record<string, string | string[]> = {};
    out.headers.forEach((v, k) => {
      if (!HOP.has(k) && k !== 'set-cookie') back[k] = v;
    });
    const cookies = out.headers.getSetCookie();
    if (cookies.length > 0) back['set-cookie'] = cookies;
    res.writeHead(out.status, back);
    res.end(Buffer.from(await out.arrayBuffer()));
  };

  const server = createServer((req, res) => {
    serve(req, res).catch((e: unknown) => {
      /* THE WORKER ANSWERS ITS OWN FAULTS AS AN ENVELOPE, so what lands here is this file's: said as one, at 500. */
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, refusal: { code: 'INTERNAL', fix: `The Cloud harness could not answer: ${e instanceof Error ? e.message : String(e)}.` } }));
    });
  });
  await new Promise<void>((done, failed) => {
    server.once('error', failed);
    server.listen(port, '127.0.0.1', () => done());
  }).catch((e: unknown) => {
    if (now !== undefined) unpin();
    throw e;
  });
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  /**
   * A person with a record, signed in: `POST /auth/provision` with the operator's key, then the claim link spent, which
   * is how the first person on any record on the Cloud arrives. The slug is the address's own name unless one is given.
   */
  const provision = async (email: string, { slug = email.split('@')[0] ?? 'record', name = slug, tz }: { slug?: string; name?: string; tz?: string } = {}): Promise<Provisioned> => {
    const made = await ask('/auth/provision', { method: 'POST', bearer: OPERATOR, body: JSON.stringify({ slug, email, name, ...(tz === undefined ? {} : { tz }) }) });
    const out = (await made.json()) as Envelope<{ record: string; claim: string }>;
    if (!out.ok) throw new Error(`the Cloud would not make a record for ${email}: ${out.refusal.fix}`);
    const spent = await ask('/auth/magic/redeem', { method: 'POST', body: JSON.stringify({ claimToken: out.value.claim.split('#claim=')[1] }) });
    const set = spent.headers.getSetCookie().find((one) => one.startsWith('__Host-bd_s='));
    if (set === undefined) throw new Error(`the claim link signed nobody in: ${String(spent.status)} ${await spent.text()}`);
    return { record: out.value.record, slug, email, cookie: set.split(';')[0]! };
  };

  /**
   * Count runs for a record in the Directory's ledger, or throw in the Directory's words.
   *
   * THE CALL A RECORD'S ALARM MAKES, AND NOT THE ALARM. A run is counted when an automation fires and reaches out
   * (`Record$`'s `ledger.meter`), and nothing here has anything to reach, so the count is handed to `Directory$.meter`
   * as the alarm hands it. What `/account/usage` then answers is the Worker's own reading of its own ledger.
   *
   * `null` IS ALSO A RUN TOO OLD TO COUNT OR COUNTED BEFORE, which this cannot tell from one counted: a caller that
   * needs the month to hold them reads it back from `/account/usage`, as the gates' record and the tests both do.
   */
  const meter = async (record: string, runs: readonly Run[]): Promise<void> => {
    const ledger = c.directory as unknown as { meter(record: string, run: Run): Refused | null | Promise<Refused | null> };
    for (const run of runs) {
      const refused = await at(() => ledger.meter(record, run));
      if (refused !== null) throw new Error(`the ledger would not count ${run.event}: ${refused.fix}`);
    }
  };

  /**
   * A month with runs in it, and what the Worker then says the month holds: one run of `ingest` on each of the last
   * `days` days, the newest an hour before the clock, counted through `meter`; then the month so far read back from
   * `/account/usage`. `{ counted, runs }`, so a caller holds the second to the first and writes neither number.
   */
  const lived = async (person: Provisioned, ingest: string, days = 3): Promise<{ counted: number; runs: number | null; fix: string | null }> => {
    const clock = now ?? Date.now();
    const HOUR = 3_600_000;
    await meter(
      person.record,
      Array.from({ length: days }, (_, i) => days - 1 - i).map((ago) => ({
        event: `gate_run_${ago}`,
        at: new Date(clock - ago * 24 * HOUR - HOUR).toISOString(),
        ingest,
        scope: 'global',
        usage: { runs: 1, requests: 0, bytes: 0, ms: 40, failures: 0, held: 0 },
      })),
    );
    const day = new Date(clock).toISOString().slice(0, 10);
    const month = (await fetch(`${base}/account/usage?from=${day.slice(0, 8)}01&to=${day}`, { headers: { cookie: person.cookie } })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; value?: { totals?: { runs?: number } }; refusal?: { fix?: string } } | null;
    return { counted: days, runs: month?.ok === true ? (month.value?.totals?.runs ?? null) : null, fix: month?.refusal?.fix ?? null };
  };

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (now !== undefined) unpin();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  };

  return { base, now: now ?? null, origin: ORIGIN, cloud: c, server, letters, at, ask, provision, meter, lived, close };
}

export type RunningCloud = Awaited<ReturnType<typeof startCloud>>;
