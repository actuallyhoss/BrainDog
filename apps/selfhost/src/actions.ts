/**
 * The self-host's wiring for scheduled actions: `pull`, `call` and `poll` (`loop/DIRECTION.md` §0b).
 *
 * THE SEND LOOP IS `@braindog/host/actions`, the same one the Worker runs. It holds https to a declared origin, a
 * literal private address refused, same-origin redirects three at most, ten seconds, two megabytes, the ledger asked
 * first and the key's value scrubbed from what comes back. This file passes in what only a Node host has:
 *
 *   · `pin`, which resolves the host and checks every address it gives, so a name that points somewhere private is
 *     refused before the key is opened;
 *   · `pinnedSend`, which connects to the address that was checked and to no other, so a second lookup cannot swap it;
 *   · `keyOpener`, which opens the key under this host's key store.
 *
 * WHY THE ADDRESS IS PINNED. A name can answer a public address to the check and `127.0.0.1` to the connection a
 * moment later. The check and the connection therefore share one lookup: `pinnedSend` hands the socket a `lookup`
 * that answers only the checked address, so nothing is asked twice.
 *
 * `openGrant` counts the opening under a `grant.read` event, so a run that read a key is a run that is on the record;
 * the value is never logged, never thrown and never returned.
 */

import type { webcrypto } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import { idempotentCalls, readPublic, refusedAddress, sendAction, type Execute, type OpenKey, type Pin, type PublicRead, type Send as SendVia } from '@braindog/host/actions';
import type { RecordApi } from '@braindog/record';

import { unwrap, type KeyStore } from './keys.ts';

export {
  IDEMPOTENCY_KEY,
  MAY_HAVE_LANDED,
  REDIRECT_HOPS,
  holding,
  idempotentCalls,
  meterPass,
  refusedAddress,
  type Hold,
  type Ledger,
  type OpenKey,
} from '@braindog/host/actions';

/** One address a name resolved to, and the one a request connects to. */
export type Pinned = { address: string; family: 4 | 6 };

/** A name's addresses, every one of them. `dns.lookup` with `all`, or a stand-in for it. */
export type Resolve = (host: string) => Promise<Pinned[]>;

/** Sends one request to the address that was checked, and to no other. */
export type Send = SendVia<Pinned>;

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
export const pinnedSend: Send = (url, init, pinned) => sendPinned(url, init, pinned);

/* The socket itself. `ca` is only ever the rehearsal's throwaway certificate, below. */
const sendPinned = (url: URL, init: RequestInit, pinned: Pinned, ca?: string): Promise<Response> =>
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
        ...(ca === undefined ? {} : { ca }),
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

/**
 * Every address the host resolves to, checked; the first, pinned. A refusal is a sentence.
 *
 * A NAME THAT RESOLVES TO NOTHING THROWS. That is the network, not a refusal, and the ladder tries it again later.
 */
export function pinFor(resolve: Resolve): Pin<Pinned> {
  return async (at) => {
    const host = at.hostname.replace(/^\[|\]$/g, '');
    const family = isIP(host);
    const found: Pinned[] = family !== 0 ? [{ address: host, family: family === 6 ? 6 : 4 }] : await resolve(host);
    if (found.length === 0) throw new Error(`${host} resolved to no address.`);
    for (const one of found) {
      const why = refusedAddress(one.address);
      if (why !== null) return `${at.host} resolves to ${one.address}, which is a ${why} address, so nothing was sent to it.`;
    }
    return found[0]!;
  };
}

/**
 * What reads a shared use-case file from an address a person pasted (`fetchUseCase`): the shared `readPublic`, with this
 * host's name service and pinned socket, so a name that resolves to a private address is refused before anything is sent.
 * `send` and `resolve` are for tests.
 */
export function sharedReader(options: { send?: Send | undefined; resolve?: Resolve | undefined } = {}): (address: string) => Promise<PublicRead> {
  return readPublic<Pinned>({ send: options.send ?? pinnedSend, pin: pinFor(options.resolve ?? systemResolve) });
}

/* ── a retry that is not a second call ──────────────────────────────────── */

/* `IDEMPOTENCY_KEY`, `MAY_HAVE_LANDED` and `idempotentCalls` now live in `@braindog/host/actions`, beside the loop
   they wrap, and are re-exported above. They were written out here and again in `apps/worker/src/actions.ts`, each
   copy carrying a note that the two must not drift; one copy cannot. */

/**
 * A REHEARSAL ON THIS MACHINE, for a test or a scratch run and never for a deployment: the names listed resolve to
 * `127.0.0.1`, and their certificate is checked against `ca`, a throwaway one made for the rehearsal.
 *
 * OFF UNLESS PASSED IN CODE. No environment variable or command line turns it on, and `main.ts` never passes it. Every
 * name must end in `.test`, which RFC 2606 reserves so that it never exists on the internet, so it cannot open a way to
 * a real host's name. Every other name, and every refusal of a local address written in an action, is unchanged.
 */
export type RehearseOnThisMachine = { names: readonly string[]; ca: string };

const REHEARSAL_NAME = /^(?:[a-z0-9-]+\.)+test$/;

function rehearsing(rehearsal: RehearseOnThisMachine, pin: Pin<Pinned>, send: Send): { pin: Pin<Pinned>; send: Send } {
  const names = new Set(rehearsal.names.map((n) => n.toLowerCase()));
  if (names.size === 0 || [...names].some((n) => !REHEARSAL_NAME.test(n)))
    throw new Error('A rehearsal on this machine names hosts ending in .test, and nothing else.');
  const here = (url: URL) => names.has(url.hostname.toLowerCase());
  return {
    pin: async (at, signal) => (here(at) ? { address: '127.0.0.1', family: 4 } : pin(at, signal)),
    send: (url, init, pinned) => (here(url) ? sendPinned(url, init, pinned, rehearsal.ca) : send(url, init, pinned)),
  };
}

/**
 * The executor `runActions` is handed on this host: the shared loop, with this host's name service, socket and keys.
 *
 * THE ALLOWED ORIGINS ARE READ ON EVERY RUN, from the record's active declarations, so a pack turned off or
 * uninstalled a moment ago is an origin nothing here will call.
 */
export function actionExecutor(
  api: Pick<RecordApi, 'kernel'>,
  options: { openKey: OpenKey; send?: Send | undefined; resolve?: Resolve | undefined; rehearseOnThisMachine?: RehearseOnThisMachine | undefined },
): Execute {
  const plain = { send: options.send ?? pinnedSend, pin: pinFor(options.resolve ?? systemResolve) };
  const { send, pin } = options.rehearseOnThisMachine ? rehearsing(options.rehearseOnThisMachine, plain.pin, plain.send) : plain;
  return idempotentCalls(
    sendAction<Pinned>({
      origins: () => api.kernel.actionOrigins(),
      openKey: options.openKey,
      send,
      pin,
    }),
  );
}
