/**
 * TURN MONEY ON, FOR A MONEY LINE TOLD ON A RECORD THAT KEEPS NONE (audit 31 Oct m, AM4): "Paid 1,200 USD for the Figma
 * team plan" on a Team said "This BrainDog keeps no money yet" and offered nothing to press. Tell's card offers "Turn on
 * Money and add it", and this is its first half: Money turned back on where the person once turned it off, or put in as
 * the module it is (`packDocument`), planned and installed with that plan's own hash, as onboarding puts a module in.
 * The card then reads the line again against the lists Money brought and adds it in the same press.
 *
 * A ROUTE-ONLY MODULE, loaded when the button is pressed, never with Today.
 */

import { createClient } from '@braindog/client';

import { packDocument, type PackState } from '../record/packs.ts';

/** The module that keeps money: accounts, the Ledger, bills and what repeats. */
export const MONEY_MODULE = 'money-core';

type Wire = { ok: true; value: unknown } | { ok: false; refusal?: { fix?: string } };
const fixOf = (w: Wire | null): string => (w && !w.ok ? (w.refusal?.fix ?? '') : '') || 'Money could not be turned on. Try again.';

/** Money on, or the sentence that says why not. `null` when it is on. */
export async function turnOnMoney(base: string): Promise<string | null> {
  const client = createClient({ base });
  const read = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  if (!read?.ok) return fixOf(read);
  const held = (read.value ?? []) as PackState[];
  const state = held.find((p) => p.id === MONEY_MODULE);
  if (state) {
    if (state.disabled_at === null) return null;
    const on = (await client.enablePack({ id: MONEY_MODULE }).catch(() => null)) as Wire | null;
    return on?.ok ? null : fixOf(on);
  }
  const doc = await packDocument(MONEY_MODULE, held);
  if (!doc) return fixOf(null);
  const planned = (await client.planPack({ doc, source: { kind: 'local' } }).catch(() => null)) as (Wire & { value?: { diff?: { planHash?: unknown; approve?: unknown } } }) | null;
  if (!planned?.ok) return fixOf(planned);
  const hash = planned.value?.diff?.planHash;
  const lines = planned.value?.diff?.approve;
  /* THE PRESS SAID "TURN ON MONEY", so what Money's plan asks to be approved is approved by it, as a starter's modules
     are when a starter is picked. */
  const approve = Array.isArray(lines) ? lines.filter((a): a is string => typeof a === 'string') : [];
  if (typeof hash !== 'string' || hash === '') return fixOf(null);
  const put = (await client.installPack({ doc, source: { kind: 'local' }, planHash: hash, ...(approve.length === 0 ? {} : { approve }) }).catch(() => null)) as Wire | null;
  return put?.ok ? null : fixOf(put);
}
