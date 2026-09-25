/**
 * The one sentence Settings > Billing says, chosen by the host that answered and not by the build.
 *
 * ON THE CLOUD IT SAID "This record runs on your own machine." `loop/research-first-sign-in.md`
 * friction 5, read off a record provisioned and claimed on the Worker run the way production runs
 * it. The branch was `DEPLOYMENT.kind`, the sample's host (now `lib/record/fixtures/sample.ts`), which followed a
 * build flag that every shipped bundle set to nothing: it read `self-host` on the Cloud build, so every production
 * record was told it was on his laptop.
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
 *
 * AND THERE IS NO THIRD CASE FOR THE SAMPLE ANY MORE (DIRECTION 26). A shell with no record behind it
 * was answered from `DEPLOYMENT.kind`, the variant the sample was built as: "This record runs on your
 * own machine" in every shipped bundle, and on the gates' Cloud build `copy.billingCloud`, "Payment is
 * up to date", over no record and no payment. A refused shell names no host and Billing never asks its
 * door, so it is told the one sentence true on both hosts, as a record that has said nothing is.
 */

import { copy } from '../../lib/copy.ts';

export const words = {
  /* TRUE ON BOTH HOSTS, which is why it is the default: a self-host is not charged either. */
  notChargedYet: 'BrainDog does not charge for this record yet.',
};

export type Billed = {
  /** The shell's `live`: a record answered `boot`. */
  live: boolean;
  /** The shell's `host`: what `boot` said the host is, absent when it did not say. It wins over `mintsMail`. */
  host?: 'cloud' | 'self-host' | undefined;
  /** `mintsMail`'s answer, `null` until the host has been asked. `false` is the self-host saying so. */
  mintsMail: boolean | null;
};

export function billingLine(b: Pick<Billed, 'host' | 'mintsMail'>): string {
  const selfHost = b.host === undefined ? b.mintsMail === false : b.host === 'self-host';
  return selfHost ? copy.billingSelfHost : words.notChargedYet;
}

/**
 * Whether this record's scheduled calls are counted against the hosted allowance, which is what `<CallsOut hosted>` asks.
 *
 * FIVE PROPS ANSWERED IT FROM THE BUILD, AND A SIXTH FROM NOTHING AT ALL. The Packs screen's diff and offer, a shared
 * plan, the Settings plan and the Decide gate passed `DEPLOYMENT.kind !== 'self-host'`, which is `false` in the bundle
 * production serves, and the automation builder passed `false`. So on the Cloud `estimateOf` said "with no monthly limit
 * on this record" while the Worker holds a hosted record's runs at `ALLOWANCE.hosted`, 15,000 a month, and sends nothing past it
 * (`loop/research-batch-forty-eight-audit.md` section 2).
 *
 * A LIVE RECORD WITH NO `host` IS NOT HOSTED. Every Worker at HEAD sends one, so a host that sends none is a self-host
 * older than the field, and telling it about an allowance it does not have would be the same mistake the other way.
 * The mail door `billingLine` falls back to is not asked here either: the only host that sends no `host` is a
 * self-host, and the door could only say so again.
 *
 * AND A SHELL WITH NO RECORD IS NOT HOSTED EITHER. It was answered from the build, `DEPLOYMENT.kind`, so the gates'
 * Cloud variant counted calls against an allowance on a screen with no record to hold one. What was asked of the build
 * is asked of the host now, and a host that did not answer `boot` has said nothing.
 */
export function hostedHere(shell: Pick<Billed, 'live' | 'host'>): boolean {
  return shell.live && shell.host === 'cloud';
}
