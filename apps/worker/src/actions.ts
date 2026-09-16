/**
 * The Worker's wiring for scheduled actions: `pull`, `call` and `poll` (`loop/DIRECTION.md` §0b), run from the
 * record's alarm.
 *
 * THE SEND LOOP IS `@braindog/host/actions`, the same one the self-host runs. It holds https to a declared origin, a
 * host written as a literal private address, `localhost` or `.internal` refused, same-origin redirects three at most,
 * ten seconds, two megabytes, the ledger asked first and the key's value scrubbed from what comes back. This file
 * passes in `fetch` and the key opener, and nothing else.
 *
 * NO NAME IS RESOLVED HERE. A Worker's `fetch` cannot reach a private address: Cloudflare's network does not route
 * one, so the check the self-host makes after resolving is the platform's on this host (`51 §8` rule 5).
 *
 * UNBOUND, A KEY IS NEVER SENT. `keyOpener` answers `null` when `KEK` is not bound, and an action that names a key
 * then answers `WRONG_KEY` with one sentence saying the host holds no key store, and nothing leaves.
 *
 * ITS OWN FILE, free of `cloudflare:`, so it is tested in Node. Nothing here logs.
 */

import { sendAction, type Execute, type OpenKey } from '@braindog/host/actions';
import type { RecordApi } from '@braindog/record';

import { isBound, keyStoreOf, type KekBinding } from './keys.ts';
import { openSealed } from './vault.ts';

export { NO_KEY_STORE, REDIRECT_HOPS, holding, meterPass, type Hold, type Ledger, type OpenKey } from '@braindog/host/actions';

/** `fetch`, or a stand-in for it. */
export type Send = (input: URL, init: RequestInit) => Promise<Response>;

/**
 * Runs one alarm sends, at most. `research-scheduled-actions` §2.3's ceilings are 800 subrequests and ten minutes
 * per invocation; five runs of at most four requests each (one and three redirects) is twenty subrequests, and five
 * runs of ten seconds is fifty seconds.
 */
export const ALARM_RUNS = 5;

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

/* ── a retry that is not a second call ──────────────────────────────────── */

/**
 * The header a `call` carries so that a retry of it is not a second call.
 *
 * WORD FOR WORD THE SELF-HOST'S. This wrapper is duplicated in `apps/selfhost/src/actions.ts` and the two must not
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
 * write: a rung of the retry ladder re-leases the same row, and so does a lease abandoned by an alarm that stopped
 * mid-run. Both come back with the same `job`, so the provider sees one key for one intended call, however many
 * times it is sent. A new interval is a new row and a new key, which is a new call and should be.
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
 * The executor the alarm hands `runActions`.
 *
 * `openKey` IS `null` WHEN `KEK` IS NOT BOUND, and that is the whole of how an unbound Worker keeps a key from
 * leaving: the shared loop answers before `send` is reachable.
 */
export function actionExecutor(origins: () => readonly string[], options: { openKey: OpenKey | null; send?: Send | undefined }): Execute {
  const send: Send = options.send ?? ((input, init) => fetch(input, init));
  return idempotentCalls(sendAction({ origins, openKey: options.openKey, send: (input, init) => send(input, init) }));
}
