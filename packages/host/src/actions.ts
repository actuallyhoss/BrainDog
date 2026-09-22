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
 * it. Its value is scrubbed from everything this file returns, the provider's answer included, in every spelling
 * `spellingsOf` names, so a provider that echoes the header back does not put the key in the record.
 *
 * NO RUNTIME HERE. No `node:` import and no bare `fetch`, so both hosts import it and the stack gate holds.
 */

import { reserveFor, type Budget, type PagedRun } from '@braindog/kernel';
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

/** A derived spelling shorter than this is not scrubbed: see `spellingsOf`. */
const SHORTEST_SPELLING = 8;

/**
 * Every spelling of an opened key that `sendAction` takes out of what it returns, longest first.
 *
 * THE EXACT BYTES WERE THE ONLY SPELLING, AND A PROVIDER THAT ECHOES THE HEADER NEED NOT ECHO THOSE. Measured by the
 * audit of wave thirty-five in workerd, through the real gateway, with a key holding a `/`: a provider that answered the
 * authorization header JSON-escaped the PHP way (`\/`), base64-encoded whole, or URL-encoded put all three into the
 * sandbox intact, and from there `ctx.log(await r.text())` carried the key onto the run's event.
 *
 * THE SPELLINGS, and no others:
 *
 *   · the bytes as sent;
 *   · JSON-escaped, both as `JSON.stringify` writes a string (a `"`, a `\` or a control character escaped) and with every
 *     `/` escaped as well, which is PHP's `json_encode` default;
 *   · URL-encoded as `encodeURIComponent` writes it, and the same with lower-case hex (`%2f`), which other encoders write;
 *   · base64, standard and URL-safe, at each of the three byte offsets the key can start at inside a longer encoded
 *     run, so `btoa('Bearer ' + key)` is caught as well as `btoa(key)`. Only the characters every bit of which is the
 *     key's are replaced; the one or two at either end also carry the bytes beside the key, which differ echo to echo.
 *
 * NOT CAUGHT, AND SAID SO: a key re-encoded any other way (hex, `\u` escapes of ordinary characters, a hash of it), and
 * any derived spelling shorter than eight characters, which only a key of five bytes or fewer has and which would
 * otherwise be struck out of ordinary text by chance. The bytes as sent are always scrubbed, however short.
 */
export function spellingsOf(secret: string): string[] {
  const json = JSON.stringify(secret).slice(1, -1);
  const url = encodeURIComponent(secret);
  const derived = new Set<string>([json, json.replaceAll('/', '\\/'), url, url.replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase())]);
  const bytes = new TextEncoder().encode(secret);
  for (const lead of [0, 1, 2]) {
    const padded = new Uint8Array(lead + bytes.length);
    padded.set(bytes, lead);
    let binary = '';
    for (const byte of padded) binary += String.fromCharCode(byte);
    /* A CHARACTER IS SIX BITS, so the first `ceil(8 * lead / 6)` hold some of the lead's and everything from
       `floor(8 * (lead + n) / 6)` on holds some of whatever follows the key. What lies between is the key's alone. */
    const core = btoa(binary).slice(Math.ceil((8 * lead) / 6), Math.floor((8 * (lead + bytes.length)) / 6));
    derived.add(core);
    derived.add(core.replaceAll('+', '-').replaceAll('/', '_'));
  }
  const out = [secret, ...[...derived].filter((s) => s !== secret && s.length >= SHORTEST_SPELLING)];
  return out.sort((a, b) => b.length - a.length);
}

/* ── the ledger ─────────────────────────────────────────────────────────── */

/** Why a run waits: until when, and the one sentence its event says. `null` is run. */
export type Hold = { until: number; say: string } | null;

/** The Directory's half of a pass: whether a record's action may run, and counting what one did. */
export type Ledger = {
  /** `pending` is how many runs this pass has already let through, which the ledger has not been told of yet. */
  mayRun: (record: string, action: string, pending?: number) => Hold | Promise<Hold>;
  meter: (record: string, run: Metered) => unknown;
};

/**
 * An executor that asks the ledger before each run.
 *
 * ASKED BEFORE ANYTHING IS RESOLVED, OPENED OR SENT. A held run answers `{ held }` with every count at zero, and the
 * kernel writes its event and moves the action to the day it may run again.
 */
export function holding(execute: Execute, record: string, mayRun: Ledger['mayRun'], admissions: Admissions = pass()): Execute {
  return async (request) => {
    const hold = await admissions.ask(record, request.ingest, mayRun);
    if (hold) return { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: hold };
    return execute(request);
  };
}

/**
 * The same question, asked of a connector.
 *
 * WITHOUT THIS THE ALLOWANCE HAD A HOLE THE SIZE OF THE EXPENSIVE KIND. `holding` wraps the
 * executor, and the connector runner is not the executor — the pass hands a `Paged` straight to it.
 * So a record at its monthly limit was held for `call`, `poll` and a one-request `pull`, and its
 * paging connectors ran on, which are the runs that make the most requests of anybody.
 *
 * A HELD RUN NEVER ACKS, so the pass releases the row. That is the difference from a held
 * single-request action, where the kernel moves the schedule to the day it may run again: here the
 * row goes back and the connector's own interval decides when it is offered next.
 */
export function holdingPaged(page: PagedRun, record: string, mayRun: Ledger['mayRun'], admissions: Admissions = pass()): PagedRun {
  return async (paged) => {
    const hold = await admissions.ask(record, paged.paged.ingest, mayRun);
    if (hold) return { outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0, say: hold.say };
    return page(paged);
  };
}

/**
 * The runs one pass has let through, shared by both wrappers.
 *
 * ONE COUNT AND NOT TWO. The ledger is told of a run only after the pass, so each wrapper has to
 * carry what it has already admitted. Two counts would each start at zero, and a record with one
 * run left would be allowed one request AND one connector — which is the allowance overrun this
 * count exists to prevent, arriving by a different door.
 */
export type Admissions = { ask: (record: string, action: string, mayRun: Ledger['mayRun']) => Promise<Hold> };

/** A fresh admission count. One per pass; passed to both wrappers so they share it. */
export function pass(): Admissions {
  let admitted = 0;
  return {
    /* TAKEN BEFORE THE AWAIT, so two runs asked at once cannot both be told there is room for one. */
    ask: async (record, action, mayRun) => {
      const pending = admitted++;
      const hold = await mayRun(record, action, pending);
      if (hold) admitted--;
      return hold;
    },
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

function refusedV4([a = 0, b = 0, c = 0]: number[]): string | null {
  if (a === 0) return 'unspecified';
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if (a === 169 && b === 254) return 'link-local';
  if (a === 100 && b >= 64 && b <= 127) return 'carrier-grade NAT';
  if (a >= 224 && a <= 239) return 'multicast';
  /* `198.18/15` is for benchmarking a network and `192.0.0/24` for protocol assignments: nothing public answers at either. */
  if ((a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 0)) return 'reserved';
  if (a >= 240) return 'reserved';
  return null;
}

/**
 * Why an address may not be called, in a word or two, or `null` when it is public.
 *
 * REFUSED: unspecified (`0/8`, `::`), loopback (`127/8`, `::1`), private (`10/8`, `172.16/12`, `192.168/16`,
 * NAT64's local-use `64:ff9b:1::/48`), link-local (`169.254/16`, `fe80::/10`), site-local (`fec0::/10`), unique-local (`fc00::/7`), carrier-grade
 * NAT (`100.64/10`), multicast (`224/4`, `ff00::/8`) and reserved (`240/4`, which holds the broadcast address,
 * `198.18/15`, `192.0.0/24` and the discard-only `100::/64`). An IPv6 address that carries an IPv4 one (mapped
 * `::ffff:0:0/96`, translated `::ffff:0:0:0/96`, compatible `::/96`, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`) is judged
 * by the IPv4 inside it, so `::ffff:127.0.0.1` is loopback. Text that is not an address at all is refused as unreadable.
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
  /* SIIT's translated `::ffff:0:0/96` carries one in its last 32 bits as mapped does, and 6to4's `2002::/16` in its next 32. */
  if (zeros(8) && b[8] === 0xff && b[9] === 0xff && b[10] === 0 && b[11] === 0) return refusedV4(inner);
  if (b[0] === 0x20 && b[1] === 0x02) return refusedV4(b.slice(2, 6));
  /* NAT64's local-use `64:ff9b:1::/48` is a network's own, and `100::/64` discards what it is sent. */
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b[4] === 0x00 && b[5] === 0x01) return 'private';
  if (b[0] === 0x01 && b.slice(1, 8).every((x) => x === 0)) return 'reserved';
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) return refusedV4(inner);
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0x80) return 'link-local';
  /* `fec0::/10` was site-local until RFC 3879 retired it; a network that still routes it routes it inside. */
  if (b[0] === 0xfe && ((b[1] ?? 0) & 0xc0) === 0xc0) return 'site-local';
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
    /* EVERY SPELLING OF THE KEY, NOT ONLY ITS BYTES (`spellingsOf` says which). Empty until a key is opened. */
    let secret: string[] = [];
    const scrub = (text: string): string => secret.reduce((out, spelling) => out.split(spelling).join(REDACTED), text);
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
        if (opened !== '') secret = spellingsOf(opened);
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

/* ── reading a shared file from an address ──────────────────────────────── */

/** The most a shared file is read to, a little over what a shared use case may weigh, so `readShared`'s refusal is the one said. */
export const PUBLIC_MOST_BYTES = 300 * 1024;
/** How long reading a shared file may take, the body included. */
export const PUBLIC_TIMEOUT_MS = 10_000;

/** What reading an address answers: the text, or one sentence saying why nothing was read. */
export type PublicRead = { ok: true; text: string; bytes: number } | { ok: false; fix: string };

/**
 * Reads one https address a person pasted to install a use case from, on the host, so a site that sends no CORS
 * header can still be read (`loop/research-spark.md` S14).
 *
 * THE SAME FENCE AS A SCHEDULED ACTION, without the declared origin: https only; never a host written as a private or
 * local address, and on the self-host never a name that resolves to one (`pin`); redirects three at most, each hop
 * checked again, to any public host; ten seconds; 300 KB counted as it streams. NOTHING IS SENT WITH IT: no cookie, no
 * key, no header of the record's. The text goes back to the caller, which reads it through `readShared` like a file.
 */
export function readPublic<P extends object | undefined = undefined>(options: { send: Send<P>; pin?: Pin<P> | undefined }): (address: string) => Promise<PublicRead> {
  return async (address) => {
    let url: URL;
    try {
      url = new URL(address.trim());
    } catch {
      return { ok: false, fix: 'That is not a web address. Paste the whole address, starting https://.' };
    }
    if (url.protocol !== 'https:') return { ok: false, fix: `${url.host || address} is not an https address, and a shared file is only read over https.` };
    const signal = AbortSignal.timeout(PUBLIC_TIMEOUT_MS);
    try {
      for (let hop = 0; ; hop++) {
        if (url.protocol !== 'https:') return { ok: false, fix: `The address redirected to ${url.host} without https, so it was not followed.` };
        if (refusedHost(url) !== null) return { ok: false, fix: `${url.host} is a private or local address, so nothing was read from it.` };
        const pinned = options.pin ? await within(options.pin(url, signal), signal) : (undefined as P);
        if (typeof pinned === 'string') return { ok: false, fix: pinned };
        const response = await options.send(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'manual', signal }, pinned);
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await response.body?.cancel().catch(() => undefined);
          if (hop >= REDIRECT_HOPS || location === null) return { ok: false, fix: `${url.host} redirected more than ${REDIRECT_HOPS} times, so nothing was read.` };
          try {
            url = new URL(location, url);
          } catch {
            return { ok: false, fix: `${url.host} redirected to an address that is not one, so nothing was read.` };
          }
          continue;
        }
        if (response.status < 200 || response.status >= 300) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, fix: `${url.host} answered ${response.status}, so there was no file to read.` };
        }
        const said = Number(response.headers.get('content-length') ?? '0');
        const body = said > PUBLIC_MOST_BYTES ? null : await within(readCapped(response, PUBLIC_MOST_BYTES), signal);
        if (body === null) {
          await response.body?.cancel().catch(() => undefined);
          return { ok: false, fix: `The file at ${url.host} is larger than a shared use case may be, so it was not read.` };
        }
        return { ok: true, text: new TextDecoder().decode(body), bytes: body.length };
      }
    } catch {
      return { ok: false, fix: signal.aborted ? `${url.host} took longer than ten seconds, so nothing was read.` : `${url.host} could not be reached.` };
    }
  };
}


/* ── what one invocation may spend ───────────────────────────────────────── */

/**
 * Requests one Cloudflare invocation may make, from `research-scheduled-actions` §2.3.
 *
 * EIGHT HUNDRED AND NOT A THOUSAND, which is what the Paid plan actually allows. The two hundred is
 * for everything this file cannot see: the object's own reads, a Directory call, a queue send. A
 * ceiling set at the real one is a ceiling the run reaches by surprise.
 *
 * IT LIVES HERE, in the one file both hosts import, because the self-host needs the same arithmetic
 * to behave the same way and not the same limit — a Node process has no such ceiling, so it passes
 * no budget and the kernel skips the check entirely.
 */
export const SUBREQUESTS = 800;

/**
 * A budget for one invocation, to be shared by every record it touches.
 *
 * ONE PER INVOCATION AND NOT ONE PER RECORD. The point of counting is that the platform counts the
 * invocation, so two records that each stay under the limit can still take the invocation down
 * between them. Whoever begins the invocation makes one of these and hands the same object down.
 *
 * `spent` IS FOR REPORTING and nothing reads it to decide: the decision is `left`, and `left` is
 * the kernel's to spend. A caller that adjusted it would be a second opinion on one number.
 */
export function invocation(of = SUBREQUESTS): Budget {
  return { left: of, total: of };
}

/** What an invocation has used so far, for a log line or a test. */
export const spent = (budget: Budget): number => budget.total - budget.left;

/** What `runActions` will reserve for a job of this shape, re-exported so a host can size a budget. */
export { reserveFor };
