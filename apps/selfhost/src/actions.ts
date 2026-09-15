/**
 * The self-host's executor for scheduled actions: `pull`, `call` and `poll` (`loop/DIRECTION.md` §0b).
 *
 * THE RECORD BUILDS THE REQUEST AND THIS FILE SENDS IT. The kernel's `runActions` hands over a method, an
 * address, the origin the declaration names and the key it wants by reference; this file decides whether
 * the request may leave at all, opens the key outside the record, and answers with a status, a body and
 * what the run cost. Nothing it opens goes back.
 *
 * WHAT IT ALLOWS OUT, and nothing else:
 *
 *   · https only, and only to an origin an installed, active declaration names, read fresh on every run;
 *   · only to a public address: the host is resolved first, and every address it resolves to is checked;
 *   · a connection to the address that was checked and to no other, so a second lookup cannot swap it;
 *   · a redirect only to the same origin, three at most, each hop resolved and checked again;
 *   · ten seconds for the whole run, the body included;
 *   · two megabytes of answer, counted as it streams, so a lying `Content-Length` is still a cap.
 *
 * WHY THE ADDRESS IS PINNED. A name can answer a public address to the check and `127.0.0.1` to the connection
 * a moment later. The check and the connection therefore share one lookup: `pinnedSend` hands the socket a
 * `lookup` that answers only the checked address, so nothing is asked twice.
 *
 * THE KEY IS OPENED FOR ONE REQUEST AND SENT AS A BEARER TO THE ORIGIN THAT NAMED IT, and only once the address
 * has passed. `openGrant` counts the opening under a `grant.read` event, so a run that read a key is a run that
 * is on the record; the value is never logged, never thrown and never returned.
 */

import type { webcrypto } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import type { ActionAnswer, ActionRequest, ActionsRun, Execute } from '@braindog/kernel';
import type { RecordApi } from '@braindog/record';

/** One run a pass metered, as the kernel hands it over. */
type Metered = ActionsRun['usage'][number];

import { unwrap, type KeyStore } from './keys.ts';

/** Opens the key a request names, by reference, or answers `null` when this host cannot. */
export type OpenKey = (grant: { id: string; label: string }) => Promise<string | null>;

/** One address a name resolved to, and the one a request connects to. */
export type Pinned = { address: string; family: 4 | 6 };

/** A name's addresses, every one of them. `dns.lookup` with `all`, or a stand-in for it. */
export type Resolve = (host: string) => Promise<Pinned[]>;

/** Sends one request to the address that was checked, and to no other. */
export type Send = (input: URL, init: RequestInit, pinned: Pinned) => Promise<Response>;

/** Same-origin redirects followed before the run is refused. */
export const REDIRECT_HOPS = 3;

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

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * The key a scheduled action sends, opened under this host's key store.
 *
 * THE SAME BYTES AS THE VAULT DOOR'S (`47 §4.6`): the record's key unwrapped under the KEK, HKDF-SHA-256 over
 * it with the grant id as info, and AES-256-GCM with the AAD the record names. No key store, a record key
 * this store does not open, or bytes that do not open, are all `null`, and the run sends nothing.
 */
export function keyOpener(api: RecordApi, store: KeyStore | undefined): OpenKey {
  return async (grant) => {
    if (!store) return null;
    const record = api.kernel.identity()?.id;
    if (!record) return null;
    const { kekId } = await store.current();
    const sealed = api.kernel.openGrant({ id: grant.id, kek_id: kekId }, 'system');
    if (!sealed.ok) return null;
    const held = sealed.value;
    if (held.key.kek_id === null) return null;
    const recordKey = await unwrap(store, record, 'record', {
      wrapped: held.key.wrapped,
      nonce: held.key.nonce,
      kek_id: held.key.kek_id,
      wrapped_by: 'kek',
    });
    if (!recordKey) return null;
    let derived: webcrypto.CryptoKey;
    try {
      const base = await crypto.subtle.importKey('raw', recordKey, 'HKDF', false, ['deriveKey']);
      derived = await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(held.id) },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
      );
    } finally {
      recordKey.fill(0);
    }
    try {
      const opened = new Uint8Array(
        await crypto.subtle.decrypt({ name: 'AES-GCM', iv: held.nonce, additionalData: utf8(held.aad) }, derived, held.ciphertext),
      );
      const said = new TextDecoder().decode(opened);
      opened.fill(0);
      return said;
    } catch {
      return null;
    }
  };
}

/* ── which addresses are refused ────────────────────────────────────────── */

/** Four octets, or `null` when the text is not a dotted IPv4 address. */
function octets(text: string): number[] | null {
  if (isIP(text) !== 4) return null;
  return text.split('.').map(Number);
}

/** Sixteen bytes, or `null` when the text is not an IPv6 address. A zone (`%eth0`) is dropped first. */
function bytes16(text: string): number[] | null {
  const bare = text.split('%')[0] ?? '';
  if (isIP(bare) !== 6) return null;
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

/** `dns.lookup` with every address, in the order the system answers them. */
export const systemResolve: Resolve = async (host) =>
  (await dnsLookup(host, { all: true, verbatim: true })).map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));

/**
 * The `lookup` a socket is handed: the checked address, whatever it is asked. Both of Node's forms, one
 * address and `all`, get the same one.
 */
export function lookupFor(pinned: Pinned) {
  return (
    _host: string,
    options: LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ): void => {
    if (options.all) callback(null, [{ address: pinned.address, family: pinned.family }]);
    else callback(null, pinned.address, pinned.family);
  };
}

/** Statuses that carry no body, which `Response` refuses to be given one for. */
const EMPTY = new Set([204, 205, 304]);

/**
 * The default transport: `node:https` connecting to the checked address, with the name kept for SNI, the
 * certificate and the `Host` header. `fetch` has no way to be told which address to use, so it is not used here.
 */
export const pinnedSend: Send = (url, init, pinned) =>
  new Promise<Response>((resolve, reject) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = value;
    });
    const literal = isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0;
    const req = httpsRequest(
      url,
      {
        method: init.method ?? 'GET',
        headers,
        lookup: lookupFor(pinned),
        ...(literal ? {} : { servername: url.hostname }),
        ...(init.signal ? { signal: init.signal } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const answered = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          for (const one of Array.isArray(value) ? value : [value]) answered.append(name, one);
        }
        try {
          if (EMPTY.has(status)) {
            res.resume();
            resolve(new Response(null, { status, headers: answered }));
          } else resolve(new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, { status, headers: answered }));
        } catch (e) {
          res.destroy();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      },
    );
    req.on('error', reject);
    req.end(typeof init.body === 'string' ? init.body : undefined);
  });

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

/** A name that resolved to nothing usable. Distinct from a refusal: it is the network, and the ladder retries it. */
class Unresolved extends Error {}

/**
 * The executor `runActions` is handed on this host.
 *
 * THE ALLOWED ORIGINS ARE READ ON EVERY RUN, from the record's active declarations, so a pack turned off or
 * uninstalled a moment ago is an origin nothing here will call, whatever the job in hand says.
 *
 * A REFUSED ADDRESS ENDS THE RUN. It is answered as `PULL_ORIGIN_REFUSED` with one sentence, which the kernel
 * writes on the run's event as a failure that pauses nothing and is not retried; no other address the name
 * gave is tried instead.
 */
export function actionExecutor(
  api: Pick<RecordApi, 'kernel'>,
  options: { openKey: OpenKey; send?: Send | undefined; resolve?: Resolve | undefined },
): Execute {
  const send: Send = options.send ?? pinnedSend;
  const resolve: Resolve = options.resolve ?? systemResolve;

  return async (request: ActionRequest): Promise<ActionAnswer> => {
    const started = Date.now();
    let requests = 0;
    let bytes = 0;
    const refuse = (code: 'PULL_ORIGIN_REFUSED' | 'PULL_PROVIDER_UNAVAILABLE' | 'PULL_REQUEST_REFUSED' | 'WRONG_KEY', fix: string): ActionAnswer => ({
      refused: { code, fix },
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
    const allowed = new Set(api.kernel.actionOrigins());
    if (url.protocol !== 'https:' || url.origin !== request.origin || !allowed.has(url.origin))
      return refuse('PULL_ORIGIN_REFUSED', `${url.host} is not an origin an installed declaration names, so nothing was sent.`);

    const signal = AbortSignal.timeout(request.timeoutMs);

    /** Every address the host resolves to, checked; the first, pinned. A refusal is a sentence. */
    const pin = async (at: URL): Promise<Pinned | string> => {
      const host = at.hostname.replace(/^\[|\]$/g, '');
      const family = isIP(host);
      const found = family !== 0 ? [{ address: host, family: family === 6 ? 6 : 4 } as Pinned] : await within(resolve(host), signal);
      if (found.length === 0) throw new Unresolved(`${host} resolved to no address.`);
      for (const one of found) {
        const why = refusedAddress(one.address);
        if (why !== null)
          return `${at.host} resolves to ${one.address}, which is a ${why} address, so nothing was sent to it.`;
      }
      return found[0]!;
    };

    let method: string = request.method;
    let body = request.body;
    try {
      let pinned = await pin(url);
      if (typeof pinned === 'string') return refuse('PULL_ORIGIN_REFUSED', pinned);

      const headers = new Headers(request.headers);
      if (request.grant) {
        const opened = await options.openKey(request.grant);
        if (opened === null)
          return refuse('WRONG_KEY', `The key "${request.grant.label}" could not be opened on this host, so nothing was sent.`);
        headers.set('authorization', `Bearer ${opened}`);
      }

      for (let hop = 0; ; hop++) {
        requests++;
        bytes += body === undefined ? 0 : utf8(body).length;
        const response = await send(url, { method, headers, redirect: 'manual', signal, ...(body === undefined ? {} : { body }) }, pinned);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          await response.body?.cancel().catch(() => undefined);
          let next: URL | null = null;
          try {
            next = location === null ? null : new URL(location, url);
          } catch {
            next = null;
          }
          /* NEVER TO ANOTHER HOST. The origin is what the owner approved in the install diff, and a redirect is
             the provider naming a different one after the fact. */
          if (next === null || next.origin !== request.origin)
            return refuse('PULL_ORIGIN_REFUSED', `${url.host} redirected to ${next?.host ?? 'nowhere'}, and a scheduled action does not follow a redirect to another host.`);
          if (hop >= REDIRECT_HOPS) return refuse('PULL_REQUEST_REFUSED', `${url.host} redirected more than ${REDIRECT_HOPS} times.`);
          /* EVERY HOP IS RESOLVED AND CHECKED AGAIN, and pinned to its own answer. The origin is the same, and
             the address behind it need not be. */
          const again = await pin(next);
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
        return { status: response.status, body: new TextDecoder().decode(read), bytes, ms: Date.now() - started, requests };
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
