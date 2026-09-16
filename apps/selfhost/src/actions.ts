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

import { refusedAddress, sendAction, type Execute, type OpenKey, type Pin, type Send as SendVia } from '@braindog/host/actions';
import type { RecordApi } from '@braindog/record';

import { unwrap, type KeyStore } from './keys.ts';

export { REDIRECT_HOPS, holding, meterPass, refusedAddress, type Hold, type Ledger, type OpenKey } from '@braindog/host/actions';

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

/* ── a retry that is not a second call ──────────────────────────────────── */

/**
 * The header a `call` carries so that a retry of it is not a second call.
 *
 * WORD FOR WORD THE WORKER'S. This wrapper is duplicated in `apps/worker/src/actions.ts` and the two must not
 * drift: a call that is safe to retry on one host and not on the other is the worst of both. Its real home is
 * `@braindog/host/actions`, beside the loop it wraps, and it is here only because that package belongs to another
 * lane this pass. Moving it there changes no behaviour.
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
 * write: a rung of the retry ladder re-leases the same row, and so does a lease abandoned by a process that
 * stopped mid-run. Both come back with the same `job`, so the provider sees one key for one intended call, however
 * many times it is sent. A new interval is a new row and a new key, which is a new call and should be.
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

/**
 * The executor `runActions` is handed on this host: the shared loop, with this host's name service, socket and keys.
 *
 * THE ALLOWED ORIGINS ARE READ ON EVERY RUN, from the record's active declarations, so a pack turned off or
 * uninstalled a moment ago is an origin nothing here will call.
 */
export function actionExecutor(
  api: Pick<RecordApi, 'kernel'>,
  options: { openKey: OpenKey; send?: Send | undefined; resolve?: Resolve | undefined },
): Execute {
  return idempotentCalls(
    sendAction<Pinned>({
      origins: () => api.kernel.actionOrigins(),
      openKey: options.openKey,
      send: options.send ?? pinnedSend,
      pin: pinFor(options.resolve ?? systemResolve),
    }),
  );
}
