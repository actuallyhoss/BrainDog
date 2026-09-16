/**
 * The one send loop for scheduled actions (`pull`, `call` and `poll`, `loop/DIRECTION.md` §0b), shared by both hosts.
 *
 * THE RECORD BUILDS THE REQUEST AND THIS FILE SENDS IT. The kernel's `runActions` hands over a method, an address,
 * the origin the declaration names and the key it wants by reference. This file decides whether the request may
 * leave at all, opens the key through the host, and answers with a status, a body and what the run cost.
 *
 * WHAT IT ALLOWS OUT, and nothing else:
 *
 *   · https only, and only to an origin an installed, active declaration names, read fresh on every run;
 *   · never to a host written as a literal private or local address, `localhost` or `.internal`;
 *   · a redirect only to the same origin, three at most, each hop checked again;
 *   · ten seconds for the whole run, the body included;
 *   · two megabytes of answer, counted as it streams, so a lying `Content-Length` is still a cap.
 *
 * WHAT EACH HOST PASSES IN is only what differs. The self-host passes `pin`, which resolves a name, refuses it when
 * any address is private, and hands `send` the address it checked so the socket connects to nothing else. The Worker
 * passes no `pin`: Cloudflare does not route a Worker's `fetch` to a private address. Each passes its own `send`
 * and its own key opener, or `null` for a host with no key store.
 *
 * THE KEY IS OPENED FOR ONE REQUEST, only once every check has passed, and sent as a bearer to the origin that named
 * it. Its value is scrubbed from everything this file returns, the provider's answer included, so a provider that
 * echoes the header back does not put the key in the record.
 *
 * NO RUNTIME HERE. No `node:` import and no bare `fetch`, so both hosts import it and the stack gate holds.
 */

import type { RecordApi } from '@braindog/record';

type Kernel = RecordApi['kernel'];

/** The executor `runActions` is handed. */
export type Execute = Parameters<Kernel['runActions']>[0];
/** One request, as the record builds it: no key in it, only the name of one. */
export type ActionRequest = Parameters<Execute>[0];
/** What an executor answers: a status and a body, or why nothing was sent. */
export type ActionAnswer = Awaited<ReturnType<Execute>>;
/** One run a pass metered, as the kernel hands it over. */
export type Metered = Awaited<ReturnType<Kernel['runActions']>>['usage'][number];

type RefusedCode = Extract<ActionAnswer, { refused: unknown }>['refused']['code'];

/** Opens the key a request names, by reference, or answers `null` when this host cannot. */
export type OpenKey = (grant: { id: string; label: string }) => Promise<string | null>;

/**
 * Checks where one hop goes, and answers what `send` connects to, or the sentence a refusal carries. A throw is the
 * network: a name that resolved to nothing is tried again later, not refused.
 */
export type Pin<P> = (at: URL, signal: AbortSignal) => Promise<P | string>;

/** Sends one request. `pinned` is what `pin` answered, or `undefined` on a host that passes no `pin`. */
export type Send<P> = (input: URL, init: RequestInit, pinned: P) => Promise<Response>;

/** Same-origin redirects followed before the run is refused. */
export const REDIRECT_HOPS = 3;

/** What stands in a returned text where a key's value was. The record's own word for a withheld value. */
export const REDACTED = '--redacted--';

/** The sentence an action that names a key gets on a host with no key store. */
export const NO_KEY_STORE = 'This host holds no key store yet, so the key';

/* ── the ledger ─────────────────────────────────────────────────────────── */

/** Why a run waits: until when, and the one sentence its event says. `null` is run. */
export type Hold = { until: number; say: string } | null;

/** The Directory's half of a pass: whether a record's action may run, and counting what one did. */
export type Ledger = {
  mayRun: (record: string, action: string) => Hold | Promise<Hold>;
  meter: (record: string, run: Metered) => unknown;
};

/**
 * An executor that asks the ledger before each run.
 *
 * ASKED BEFORE ANYTHING IS RESOLVED, OPENED OR SENT. A held run answers `{ held }` with every count at zero, and the
 * kernel writes its event and moves the action to the day it may run again.
 */
export function holding(execute: Execute, record: string, mayRun: Ledger['mayRun']): Execute {
  return async (request) => {
    const hold = await mayRun(record, request.ingest);
    if (hold) return { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: hold };
    return execute(request);
  };
}

/** Every run a pass metered, into the ledger, in order. A run the ledger already holds adds nothing there. */
export async function meterPass(meter: Ledger['meter'], record: string, usage: readonly Metered[]): Promise<void> {
  for (const run of usage) await meter(record, run);
}

/* ── which addresses are refused ────────────────────────────────────────── */

/* NODE'S OWN GRAMMAR FOR `net.isIP`, written out because this package may not import `node:net`. */
const V4_SEG = '(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])';
const V4_STR = `(?:${V4_SEG}\\.){3}${V4_SEG}`;
const V4 = new RegExp(`^${V4_STR}$`);
const V6_SEG = '(?:[0-9a-fA-F]{1,4})';
const V6 = new RegExp(
  '^(?:' +
    `(?:${V6_SEG}:){7}(?:${V6_SEG}|:)|` +
    `(?:${V6_SEG}:){6}(?:${V4_STR}|:${V6_SEG}|:)|` +
    `(?:${V6_SEG}:){5}(?::${V4_STR}|(?::${V6_SEG}){1,2}|:)|` +
    `(?:${V6_SEG}:){4}(?:(?::${V6_SEG}){0,1}:${V4_STR}|(?::${V6_SEG}){1,3}|:)|` +
    `(?:${V6_SEG}:){3}(?:(?::${V6_SEG}){0,2}:${V4_STR}|(?::${V6_SEG}){1,4}|:)|` +
    `(?:${V6_SEG}:){2}(?:(?::${V6_SEG}){0,3}:${V4_STR}|(?::${V6_SEG}){1,5}|:)|` +
    `(?:${V6_SEG}:){1}(?:(?::${V6_SEG}){0,4}:${V4_STR}|(?::${V6_SEG}){1,6}|:)|` +
    `(?::(?:(?::${V6_SEG}){0,5}:${V4_STR}|(?::${V6_SEG}){1,7}|:))` +
    ')(?:%[0-9a-zA-Z-.:]{1,})?$',
);

/** `4` for a dotted IPv4 address, `6` for an IPv6 one (a zone allowed), `0` for anything else. `net.isIP`'s answer. */
export function ipFamily(text: string): 0 | 4 | 6 {
  if (V4.test(text)) return 4;
  if (V6.test(text)) return 6;
  return 0;
}

/** Four octets, or `null` when the text is not a dotted IPv4 address. */
function octets(text: string): number[] | null {
  if (ipFamily(text) !== 4) return null;
  return text.split('.').map(Number);
}

/** Sixteen bytes, or `null` when the text is not an IPv6 address. A zone (`%eth0`) is dropped first. */
function bytes16(text: string): number[] | null {
  const bare = text.split('%')[0] ?? '';
  if (ipFamily(bare) !== 6) return null;
  let head = bare;
  let tail: number[] = [];
  if (bare.includes('.')) {
    const cut = bare.lastIndexOf(':');
    tail = octets(bare.slice(cut + 1)) ?? [];
    head = `${bare.slice(0, cut + 1)}0:0`;
  }
  const [left = '', right] = head.split('::');
  const l = left === '' ? [] : left.split(':');
  const r = right === undefined ? null : right === '' ? [] : right.split(':');
  const groups = r === null ? l : [...l, ...Array<string>(8 - l.length - r.length).fill('0'), ...r];
  const out = groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 255];
  });
  if (tail.length === 4) out.splice(12, 4, ...tail);
  return out;
}

function refusedV4([a = 0, b = 0]: number[]): string | null {
  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT';
  if (a >= 224 && a <= 239) return 'multicast';
  if (a >= 240) return 'reserved';
  return null;
}

/**
 * Why an address may not be called, in a word or two, or `null` when it is public.
 *
 * REFUSED: unspecified (`0/8`, `::`), loopback (`127/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`),
 * link-local (`169.254/16`, `fe80::/10`), unique-local (`fc00::/7`), carrier-grade NAT (`100.64/10`), multicast
 * (`224/4`, `ff00::/8`) and the reserved `240/4`, which holds the broadcast address. An IPv6 address that carries
 * an IPv4 one (mapped `::ffff:0:0/96`, compatible `::/96`, NAT64 `64:ff9b::/96`) is judged by the IPv4 inside it,
 * so `::ffff:127.0.0.1` is loopback. Text that is not an address at all is refused as unreadable.
 */
export function refusedAddress(address: string): string | null {
  const v4 = octets(address);
  if (v4) return refusedV4(v4);
  const b = bytes16(address);
  if (!b) return 'unreadable';
  const zeros = (n: number) => b.slice(0, n).every((x) => x === 0);
  if (zeros(16)) return 'unspecified';
  if (zeros(15) && b[15] === 1) return 'loopback';
  const inner = b.slice(12);
  if (zeros(10) && b[10] === 0xff && b[11] === 0xff) return refusedV4(inner);
  if (zeros(12)) return refusedV4(inner);
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return refusedV4(inner);
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0x80) return 'link-local';
  if (((b[0] ?? 0) & 0xfe) === 0xfc) return 'unique-local';
  if (b[0] === 0xff) return 'multicast';
  return null;
}

/**
 * Why a host, as the address writes it, may not be called, or `null` when nothing about how it is written says so.
 *
 * `localhost`, a name under it and a name under `.internal` are local by name, with or without the trailing dot. An
 * address written literally is judged by `refusedAddress`. A name that only RESOLVES to a private address is not
 * caught here and cannot be: that is the self-host's `pin`, and the platform's routing on the Worker.
 */
export function refusedHost(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return 'local';
  const bare = host.replace(/^\[|\]$/g, '');
  return ipFamily(bare) === 0 ? null : refusedAddress(bare);
}

/* ── the loop ───────────────────────────────────────────────────────────── */

/** A promise that gives up when the run's signal does. */
function within<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(signal.reason);
    signal.addEventListener('abort', stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

/** An answer's bytes, read until the cap and no further. `null` when it ran over. */
async function readCapped(response: Response, max: number): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** What a host hands the loop. */
export type SendOptions<P> = {
  /** The origins the record's active declarations name, asked on every run. */
  origins: () => Iterable<string>;
  /** `null` on a host with no key store: an action that names a key sends nothing and says why. */
  openKey: OpenKey | null;
  send: Send<P>;
  /** Absent on a host whose network does not route to a private address. */
  pin?: Pin<P> | undefined;
};

/**
 * The executor `runActions` is handed, on either host.
 *
 * IN THIS ORDER, so nothing is opened for a request that will not leave: the origin, the host as written, `pin`, the
 * key, and then the request. A refused address ends the run as `PULL_ORIGIN_REFUSED` with one sentence, which the
 * kernel writes on the run's event as a failure that pauses nothing and is not retried.
 */
export function sendAction<P extends object | undefined = undefined>(options: SendOptions<P>): Execute {
  const pinOf = async (at: URL, signal: AbortSignal): Promise<P | string> =>
    options.pin ? within(options.pin(at, signal), signal) : (undefined as P);

  return async (request: ActionRequest): Promise<ActionAnswer> => {
    const started = Date.now();
    let requests = 0;
    let bytes = 0;
    let secret: string | null = null;
    const scrub = (text: string): string => (secret ? text.split(secret).join(REDACTED) : text);
    const refuse = (code: RefusedCode, fix: string): ActionAnswer => ({
      refused: { code, fix: scrub(fix) },
      bytes,
      ms: Date.now() - started,
      requests,
    });

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return refuse('PULL_ORIGIN_REFUSED', 'The address this action names is not one this host can read, so nothing was sent.');
    }
    const allowed = new Set(options.origins());
    if (url.protocol !== 'https:' || url.origin !== request.origin || !allowed.has(url.origin))
      return refuse('PULL_ORIGIN_REFUSED', `${url.host} is not an origin an installed declaration names, so nothing was sent.`);
    if (refusedHost(url) !== null) return refuse('PULL_ORIGIN_REFUSED', `${url.host} is a private or local address, so nothing was sent.`);

    const signal = AbortSignal.timeout(request.timeoutMs);
    let method: string = request.method;
    let body = request.body;
    try {
      let pinned = await pinOf(url, signal);
      if (typeof pinned === 'string') return refuse('PULL_ORIGIN_REFUSED', pinned);

      const headers = new Headers(request.headers);
      if (request.grant) {
        if (!options.openKey) return refuse('WRONG_KEY', `${NO_KEY_STORE} "${request.grant.label}" was not opened and nothing was sent.`);
        const opened = await options.openKey(request.grant);
        if (opened === null) return refuse('WRONG_KEY', `The key "${request.grant.label}" could not be opened on this host, so nothing was sent.`);
        if (opened !== '') secret = opened;
        headers.set('authorization', `Bearer ${opened}`);
      }

      for (let hop = 0; ; hop++) {
        requests++;
        bytes += body === undefined ? 0 : utf8(body).length;
        const response = await options.send(url, { method, headers, redirect: 'manual', signal, ...(body === undefined ? {} : { body }) }, pinned);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await response.body?.cancel().catch(() => undefined);
          let next: URL | null = null;
          try {
            next = location === null ? null : new URL(location, url);
          } catch {
            next = null;
          }
          /* NEVER TO ANOTHER HOST. The origin is what the owner approved in the install diff, and a redirect is the
             provider naming a different one after the fact. */
          if (next === null || next.origin !== request.origin)
            return refuse('PULL_ORIGIN_REFUSED', `${url.host} redirected to ${next?.host ?? 'nowhere'}, and a scheduled action does not follow a redirect to another host.`);
          if (hop >= REDIRECT_HOPS) return refuse('PULL_REQUEST_REFUSED', `${url.host} redirected more than ${REDIRECT_HOPS} times.`);
          /* EVERY HOP IS CHECKED AGAIN, and pinned to its own answer. The origin is the same, and the address behind
             it need not be. */
          const again = await pinOf(next, signal);
          if (typeof again === 'string') return refuse('PULL_ORIGIN_REFUSED', again);
          pinned = again;
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
            method = 'GET';
            body = undefined;
            headers.delete('content-type');
          }
          url = next;
          continue;
        }

        const declared = Number(response.headers.get('content-length') ?? Number.NaN);
        if (Number.isFinite(declared) && declared > request.maxBytes) {
          await response.body?.cancel().catch(() => undefined);
          return refuse('PULL_REQUEST_REFUSED', `${url.host} answered with more than ${request.maxBytes} bytes, which is this action's cap.`);
        }
        const read = await readCapped(response, request.maxBytes);
        if (read === null) {
          bytes += request.maxBytes;
          return refuse('PULL_REQUEST_REFUSED', `${url.host} answered with more than ${request.maxBytes} bytes, which is this action's cap.`);
        }
        bytes += read.length;
        return { status: response.status, body: scrub(new TextDecoder().decode(read)), bytes, ms: Date.now() - started, requests };
      }
    } catch (e) {
      const late = signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));
      return refuse(
        'PULL_PROVIDER_UNAVAILABLE',
        late ? `${url.host} did not answer within ${Math.round(request.timeoutMs / 1000)} seconds.` : `${url.host} could not be reached.`,
      );
    }
  };
}

/* ── a retry that is not a second call ──────────────────────────────────── */

/**
 * The header a `call` carries so that a retry of it is not a second call.
 *
 * ONE COPY, HERE, beside the loop it wraps. It was written twice, once in each host, with a note in both saying
 * the two must not drift: a call that is safe to retry on one host and not on the other is the worst of both.
 * Both hosts now import it from here, and `actionExecutor` on either side wraps the same function. Moving it
 * changed no behaviour.
 */
export const IDEMPOTENCY_KEY = 'idempotency-key';

/**
 * The sentence a call adds when nothing came back, so the record says what it does not know.
 *
 * A TIMEOUT OR A DROPPED CONNECTION ON A POST IS THE ONE CASE WHERE THE RECORD CANNOT TELL whether the request
 * landed. The ladder will try it again, which is right, and the run event should not pretend that trying again is
 * free. It says what was done about it instead.
 */
export const MAY_HAVE_LANDED = 'It carried an idempotency key, so a retry is not a second call unless the provider ignores that header.';

/**
 * Every `call` carries the outbox id as its idempotency key, and says so when the answer never came.
 *
 * THE OUTBOX ID IS THE RIGHT VALUE because it is stable across exactly the events that would otherwise double
 * write: a rung of the retry ladder re-leases the same row, and so does a lease abandoned by a process or an alarm
 * that stopped mid-run. Both come back with the same `job`, so the provider sees one key for one intended call,
 * however many times it is sent. A new interval is a new row and a new key, which is a new call and should be.
 *
 * THE HEADER IS A REQUEST AND NOT A GUARANTEE. Delivery is at least once: a provider that ignores the header can
 * be called twice for one intended call, and nothing here can tell that it was. `25-CONNECTORS` §3.3 says so in
 * the same words.
 *
 * ONLY A `call`. A `poll` and a `pull` are GETs with nothing to duplicate, and a header a provider did not expect
 * is a header that can be rejected.
 */
export function idempotentCalls(execute: Execute): Execute {
  return async (request) => {
    if (request.channel !== 'call') return execute(request);
    const answer = await execute({ ...request, headers: { ...request.headers, [IDEMPOTENCY_KEY]: request.job } });
    if ('refused' in answer && answer.refused.code === 'PULL_PROVIDER_UNAVAILABLE')
      return { ...answer, refused: { ...answer.refused, fix: `${answer.refused.fix} ${MAY_HAVE_LANDED}` } };
    return answer;
  };
}
