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
 *   · a redirect only to the same origin, three at most, and never to another host;
 *   · ten seconds for the whole run, the body included;
 *   · two megabytes of answer, counted as it streams, so a lying `Content-Length` is still a cap.
 *
 * THE KEY IS OPENED FOR ONE REQUEST AND SENT AS A BEARER TO THE ORIGIN THAT NAMED IT. `openGrant` counts the
 * opening under a `grant.read` event, so a run that read a key is a run that is on the record; the value is
 * never logged, never thrown and never returned.
 */

import type { webcrypto } from 'node:crypto';

import type { ActionAnswer, ActionRequest, Execute } from '@braindog/kernel';
import type { RecordApi } from '@braindog/record';

import { unwrap, type KeyStore } from './keys.ts';

/** Opens the key a request names, by reference, or answers `null` when this host cannot. */
export type OpenKey = (grant: { id: string; label: string }) => Promise<string | null>;

/** `fetch`, or a stand-in for it. */
export type Send = (input: URL, init: RequestInit) => Promise<Response>;

/** Same-origin redirects followed before the run is refused. */
export const REDIRECT_HOPS = 3;

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

/**
 * The executor `runActions` is handed on this host.
 *
 * THE ALLOWED ORIGINS ARE READ ON EVERY RUN, from the record's active declarations, so a pack turned off or
 * uninstalled a moment ago is an origin nothing here will call, whatever the job in hand says.
 */
export function actionExecutor(api: Pick<RecordApi, 'kernel'>, options: { openKey: OpenKey; send?: Send | undefined }): Execute {
  const send: Send = options.send ?? ((input, init) => fetch(input, init));

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

    const headers = new Headers(request.headers);
    if (request.grant) {
      const opened = await options.openKey(request.grant);
      if (opened === null)
        return refuse('WRONG_KEY', `The key "${request.grant.label}" could not be opened on this host, so nothing was sent.`);
      headers.set('authorization', `Bearer ${opened}`);
    }

    let method: string = request.method;
    let body = request.body;
    const signal = AbortSignal.timeout(request.timeoutMs);
    try {
      for (let hop = 0; ; hop++) {
        requests++;
        bytes += body === undefined ? 0 : utf8(body).length;
        const response = await send(url, { method, headers, redirect: 'manual', signal, ...(body === undefined ? {} : { body }) });

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
      const late = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      requests = Math.max(requests, 1);
      return refuse(
        'PULL_PROVIDER_UNAVAILABLE',
        late ? `${url.host} did not answer within ${Math.round(request.timeoutMs / 1000)} seconds.` : `${url.host} could not be reached.`,
      );
    }
  };
}
