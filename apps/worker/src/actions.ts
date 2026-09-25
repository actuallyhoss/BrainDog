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

import { idempotentCalls, readPublic, sendAction, type Execute, type OpenKey, type PublicRead } from '@braindog/host/actions';
import type { RecordApi } from '@braindog/record';

import { isBound, keyStoreOf, type KekBinding } from './keys.ts';
import { openSealed } from './vault.ts';

export {
  IDEMPOTENCY_KEY,
  IN_FLIGHT,
  MAY_HAVE_LANDED,
  NO_KEY_STORE,
  REDIRECT_HOPS,
  SUBREQUESTS,
  holding,
  holdingPaged,
  idempotentCalls,
  invocation,
  meterPass,
  pass,
  spent,
  type Admissions,
  type Hold,
  type Ledger,
  type OpenKey,
} from '@braindog/host/actions';

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
 *
 * `actor` SIGNS THE `grant.read`, AND `system` IS RIGHT ONLY WHERE NOBODY ASKED. The alarm's actions have no asker, so the
 * default stands. Slash's tier `b` does have one, and with `system` written into this line an owner reading the vault's
 * log could not tell her own asks from a colleague's (`loop/research-batch-thirty-one-audit.md` §1). That path is the one
 * to pass the asker's id here; until `slash.ts`'s `wireOf` does, `slashByokFor` hands this opener a view of the record
 * whose `openGrant` signs as the asker whatever it is told.
 */
export function keyOpener(api: Pick<RecordApi, 'kernel'>, bound: KekBinding | undefined, actor = 'system'): OpenKey | null {
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
    const sealed = api.kernel.openGrant({ id: grant.id, kek_id: kekId }, actor);
    if (!sealed.ok) return null;
    return openSealed(store, record, sealed.value);
  };
}

/* ── a retry that is not a second call ──────────────────────────────────── */

/* `IDEMPOTENCY_KEY`, `MAY_HAVE_LANDED` and `idempotentCalls` now live in `@braindog/host/actions`, beside the loop
   they wrap, and are re-exported above. They were written out here and again in `apps/selfhost/src/actions.ts`,
   each copy carrying a note that the two must not drift; one copy cannot. */

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

/**
 * What reads a shared use-case file from an address a person pasted (`fetchUseCase`): the shared `readPublic` with the
 * platform's `fetch`. No `pin`, for the reason `sendAction` gives: a Worker's `fetch` is not routed to a private address.
 */
export function sharedReader(send?: Send): (address: string) => Promise<PublicRead> {
  const via: Send = send ?? ((input, init) => fetch(input, init));
  return readPublic({ send: (input, init) => via(input, init) });
}
