/**
 * The command's scratch record reading its three product parts from the seed's root, as it did until 9 October, in a
 * place the gate did not read while it read the web app alone.
 *
 * The worker beside it reads the same names through `@braindog/seed/packs`, and the agent door's test reads the root:
 * neither is a finding, so the import below is the only one this tree holds.
 */

import { FIRST_PARTY, agentsPackDocument, firstPartyDocument } from '@braindog/seed';

export const documents = (): unknown[] => [...FIRST_PARTY.map((id) => firstPartyDocument(id)), agentsPackDocument()];
