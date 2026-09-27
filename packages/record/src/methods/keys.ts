/**
 * The record's half of rotating the root key: `rewrapKeys`, INTERNAL (`loop/finish/contracts.md` §2.6 and §2.8,
 * `docs/30` §5).
 *
 * NO GUARD, BECAUSE NO CALLER REACHES IT BUT A HOST. It is on no route (`docs/30` §5 lists it among the INTERNAL methods,
 * and the `router-groups` gate refuses a route that names one), and the one caller is the host that holds the root keys:
 * the Worker's re-wrap for its nightly walk (`apps/worker/src/rewrap.ts`) and the self-host as it starts
 * (`apps/selfhost/src/rewrap.ts`).
 * What it takes is bytes the host wrapped, never a key, so the record still holds nothing that opens its own vault.
 *
 * A RECORD THIS BUILD REFUSES IS NOT RE-WRAPPED. Its schema disagrees with the code, so no write reaches it; the host's
 * re-wrap answers it as a straggler, and a later one re-wraps it once it opens again (`53 §5.6` step 6).
 */

import type { Kernel } from '@braindog/kernel';

import type { RecordDeps } from './index.ts';

export function methods(deps: RecordDeps) {
  const { kernel } = deps;

  return {
    /**
     * Swap the record's keys wrapped under `from` for the bytes the host wrapped under `to`, each only while it still
     * names `from`, in one transaction with one `grant.rotate` event (`kernel/src/api/keys.ts`). INTERNAL.
     */
    async rewrapKeys(args: Parameters<Kernel['rewrapKeys']>[0]): Promise<ReturnType<Kernel['rewrapKeys']>> {
      const broken = kernel.refused();
      if (broken) return { ok: false, refusal: broken };
      return kernel.rewrapKeys(args);
    },
  };
}
