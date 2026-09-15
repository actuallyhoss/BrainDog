/**
 * The Worker's vault step: `/api/vault/deposit` and `/api/vault/open`. `loop/research-agent-path.md` §5.7.
 *
 * NO KEY STORE IS BOUND ON THE WORKER YET, so both doors check the vault grant and then answer
 * `NOT_IN_THIS_BUILD`. The grant is still checked first, with the record's `vaultGrant` and never `verifyToken`,
 * so a login token is refused here exactly as it is on the self-host, and the gap says so only to a grant holder.
 *
 * ITS OWN FILE, free of `cloudflare:`, so the routing is tested in Node. It is one of the two files the
 * `Plaintext` brand may live in, and until a key store is bound it names none.
 *
 * (The third is the CLI's `keys.ts`, where an agent's key is read in and written out.)
 */

import { serveVault, servesVault, type VaultGrantSeen } from '@braindog/host';
import type { Result } from '@braindog/ports';

import { recordOf } from './route.ts';

export { servesVault };

/** What the Worker needs to check a grant: whether the Directory holds the record, and the record's answer. */
export type GrantDeps = {
  knows(record: string): Promise<boolean>;
  vaultGrant(record: string, bearer: string): Promise<Result<VaultGrantSeen>>;
};

/* The sentence `vaultGrant` gives for every bearer it does not know, so a record this Worker does not hold reads
   the same as a bearer that record does not know. */
const UNKNOWN: Result<VaultGrantSeen> = {
  ok: false,
  refusal: { code: 'FORBIDDEN', fix: 'That vault grant is not one this record knows.', at: 'vault' },
};

/**
 * Answer a key door. The bearer names its record in front of the dot, as every bearer here does; the Directory is
 * asked before the record is addressed, because naming an object that does not exist creates it.
 */
export function serveWorkerVault(request: Request, deps: GrantDeps): Promise<Response> {
  return serveVault(request, {
    grant: async (bearer) => {
      const record = recordOf(`Bearer ${bearer}`);
      if (record === null || !(await deps.knows(record))) return UNKNOWN;
      return deps.vaultGrant(record, bearer);
    },
  });
}
