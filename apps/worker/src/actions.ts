/**
 * The Worker's executor for scheduled actions: `pull`, `call` and `poll` (`loop/DIRECTION.md` §0b), run from the
 * record's alarm.
 *
 * THE SAME RULES AS THE SELF-HOST'S `apps/selfhost/src/actions.ts`, over `fetch`:
 *
 *   · https only, and only to an origin an installed, active declaration names, read fresh on every run;
 *   · a host written as a literal private, loopback or link-local address, `localhost` or `.internal` is refused
 *     by `postable()` before anything is sent;
 *   · a redirect only to the same origin, three at most, and never to another host;
 *   · ten seconds for the whole run, the body included;
 *   · two megabytes of answer, counted as it streams, so a lying `Content-Length` is still a cap;
 *   · the key opened from this Worker's key store only when `KEK` is bound, for one request, and sent as a bearer.
 *
 * NO NAME IS RESOLVED HERE. A Worker's `fetch` cannot reach a private address: Cloudflare's network does not route
 * one, so the check the self-host makes after resolving is the platform's on this host (`51 §8` rule 5).
 *
 * UNBOUND, A KEY IS NEVER SENT. An action that names a key answers `WRONG_KEY` with one sentence saying the host
 * holds no key store, and nothing leaves. An action that names no key is sent as it would be anywhere.
 *
 * ITS OWN FILE, free of `cloudflare:`, so it is tested in Node. Nothing here logs.
 */

import type { ActionAnswer, ActionRequest, ActionsRun, Execute } from '@braindog/kernel';
import type { RecordApi } from '@braindog/record';

/** One run a pass metered, as the kernel hands it over. */
type Metered = ActionsRun['usage'][number];

import { postable } from './deliver.ts';
import { isBound, keyStoreOf, type KekBinding } from './keys.ts';
import { openSealed } from './vault.ts';

/** Opens the key a request names, by reference, or answers `null` when it does not open. */
export type OpenKey = (grant: { id: string; label: string }) => Promise<string | null>;

/** `fetch`, or a stand-in for it. */
export type Send = (input: URL, init: RequestInit) => Promise<Response>;

/** Same-origin redirects followed before the run is refused. */
export const REDIRECT_HOPS = 3;

/**
 * Runs one alarm sends, at most. `research-scheduled-actions` §2.3's ceilings are 800 subrequests and ten minutes
 * per invocation; five runs of at most four requests each (one and three redirects) is twenty subrequests, and five
 * runs of ten seconds is fifty seconds.
 */
export const ALARM_RUNS = 5;

/** Why a run waits: until when, and the one sentence its event says. `null` is run. */
export type Hold = { until: number; say: string } | null;

/** The Directory's half of a pass, over RPC: whether a record's action may run, and counting what one did. */
export type Ledger = {
  mayRun: (record: string, action: string) => Hold | Promise<Hold>;
  meter: (record: string, run: Metered) => unknown;
};

/**
 * An executor that asks the ledger before each run.
 *
 * ASKED BEFORE ANYTHING IS OPENED OR SENT. A held run answers `{ held }` with every count at zero, and the kernel
 * writes its event and moves the action to the day it may run again.
 */
export function holding(execute: Execute, record: string, mayRun: Ledger['mayRun']): Execute {
  return async (request) => {
    const hold = await mayRun(record, request.ingest);
    if (hold) return { status: 0, body: '', bytes: 0, ms: 0, requests: 0, held: hold };
    return execute(request);
  };
}

/** Every run a pass metered, into the Directory's ledger, in order. A run it already holds adds nothing there. */
export async function meterPass(meter: Ledger['meter'], record: string, usage: readonly Metered[]): Promise<void> {
  for (const run of usage) await meter(record, run);
}

/** The sentence an action that names a key gets on a Worker with no `KEK` bound. */
export const NO_KEY_STORE = 'This host holds no key store yet, so the key';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/**
 * The key a scheduled action sends, opened under `env.KEK`, or `null` when `KEK` is not bound.
 *
 * THE SAME BYTES AS THE READ DOOR'S, through `vault.ts`: the record's key unwrapped under the root key, HKDF over it
 * with the grant id, AES-256-GCM with the AAD the record names. `openGrant` writes the `grant.read` event, so a run
 * that read a key is on the record. A bound value that is not a key, a record made before the store was bound, or
 * bytes that do not open, are all `null`, and the run sends nothing.
 */
export function keyOpener(api: Pick<RecordApi, 'kernel'>, bound: KekBinding | undefined): OpenKey | null {
  if (!isBound(bound)) return null;
  return async (grant) => {
    let store: Awaited<ReturnType<typeof keyStoreOf>>;
    try {
      store = await keyStoreOf(bound);
    } catch {
      return null;
    }
    if (!store) return null;
    const record = api.kernel.identity()?.id;
    if (!record) return null;
    const { kekId } = await store.current();
    const sealed = api.kernel.openGrant({ id: grant.id, kek_id: kekId }, 'system');
    if (!sealed.ok) return null;
    return openSealed(store, record, sealed.value);
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
 * The executor the alarm hands `runActions`.
 *
 * `openKey` IS `null` WHEN `KEK` IS NOT BOUND, and that is the whole of how an unbound Worker keeps a key from
 * leaving: the branch below answers before `send` is reachable.
 */
export function actionExecutor(origins: () => readonly string[], options: { openKey: OpenKey | null; send?: Send | undefined }): Execute {
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
    const allowed = new Set(origins());
    if (url.protocol !== 'https:' || url.origin !== request.origin || !allowed.has(url.origin))
      return refuse('PULL_ORIGIN_REFUSED', `${url.host} is not an origin an installed declaration names, so nothing was sent.`);
    if (postable(url.href) === null)
      return refuse('PULL_ORIGIN_REFUSED', `${url.host} is a private or local address, so nothing was sent.`);

    const headers = new Headers(request.headers);
    if (request.grant) {
      if (!options.openKey)
        return refuse('WRONG_KEY', `${NO_KEY_STORE} "${request.grant.label}" was not opened and nothing was sent.`);
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
          /* NEVER TO ANOTHER HOST. The origin is what the owner approved in the install diff. */
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
      const late = signal.aborted || (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));
      return refuse(
        'PULL_PROVIDER_UNAVAILABLE',
        late ? `${url.host} did not answer within ${Math.round(request.timeoutMs / 1000)} seconds.` : `${url.host} could not be reached.`,
      );
    }
  };
}
