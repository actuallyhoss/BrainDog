/**
 * The one sentence Settings > Billing says, chosen by the host that answered and not by the build.
 *
 * ON THE CLOUD IT SAID "This record runs on your own machine." `loop/research-first-sign-in.md`
 * friction 5, read off a record provisioned and claimed on the Worker run the way production runs
 * it. The branch was `DEPLOYMENT.kind`, and `DEPLOYMENT` in `lib/record/data.ts` follows
 * `__BRAINDOG_VARIANT__`, which `vite.config.ts` substitutes as `''` in every shipped bundle: it
 * reads `self-host` on the Cloud build, so every production record was told it was on his laptop.
 * `inbound-door.ts` records the same trap for the mail door.
 *
 * `billingCloud` WAS NOT THE ANSWER EITHER. It says "Payment is up to date", and nothing on the
 * Cloud takes a payment yet, so a record that has never been billed would be told its bill is paid.
 *
 * WHAT THE HOST CAN BE ASKED TODAY IS ONE DOOR. `boot` names the record, the caller and whether
 * anybody signs in (`signIn`), and nothing about which host is serving it; `/auth/methods` says
 * which ways in exist, and a self-host and the Worker can answer it identically. The one answer that
 * only one host gives is `mintsMail`'s: 404 `ROUTE_UNKNOWN` at `/api/inbound/mint`, which the
 * self-host's `serveApi` answers and the Worker, whose mail door is real, never does. So a live
 * record keeps the self-host's sentence exactly where its host said it has no Cloud door, and every
 * other live record is told the thing that is true on both hosts.
 *
 * `host` MAKES IT A READ, AND THE INFERENCE IS NOW THE FALLBACK. `boot` carries the host's own word
 * (`Build.host` in `@braindog/record`), so a self-host is one before its mail door has been asked,
 * and a Cloud host is not taken for one because a read of that door failed. A host older than the
 * field sends none, and is judged by the door as before.
 */

import { copy } from '../../lib/copy.ts';

export const words = {
  /* TRUE ON BOTH HOSTS, which is why it is the default: a self-host is not charged either. */
  notChargedYet: 'BrainDog does not charge for this record yet.',
};

export type Billed = {
  /** The shell's `live`: a record answered `boot`. The sample is the only record `DEPLOYMENT` describes. */
  live: boolean;
  /** The shell's `host`: what `boot` said the host is, absent when it did not say. It wins over `mintsMail`. */
  host?: 'cloud' | 'self-host' | undefined;
  /** `mintsMail`'s answer, `null` until the host has been asked. `false` is the self-host saying so. */
  mintsMail: boolean | null;
  /** `DEPLOYMENT.kind`, which is the variant the sample was built as. */
  sample: 'self-host' | 'cloud';
};

export function billingLine(b: Billed): string {
  if (!b.live) return b.sample === 'self-host' ? copy.billingSelfHost : copy.billingCloud;
  const selfHost = b.host === undefined ? b.mintsMail === false : b.host === 'self-host';
  return selfHost ? copy.billingSelfHost : words.notChargedYet;
}
