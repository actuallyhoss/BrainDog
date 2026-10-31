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

import { forget, readBoot } from '../record/boot-live.ts';
import { REGISTERS } from '../record/held.ts';
import { packDocument, type PackState } from '../record/packs.ts';
import { learn } from '../record/remote.ts';
import type { Told, TellList, TellOptions, tellRead } from './read.ts';

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

/**
 * MONEY ON, THEN THE SAME WORDS READ AGAIN AGAINST THE LISTS IT BROUGHT: the lists Money holds are learnt here (`learn`)
 * and put in the order the record lists them, as Today reads them (`tellLists`), since the first list a line fits is
 * the one it goes into: read against Instalments before Bills and invoices, a payment asked which plan it was part of.
 * The kept `boot` is dropped, so the rail and Today read the record again after.
 */
export async function moneyThenRead(
  base: string,
  words: string,
  options: TellOptions,
  reader: typeof tellRead,
): Promise<{ fix: string } | { told: Told; lists: TellList[] }> {
  const fix = await turnOnMoney(base).catch(() => fixOf(null));
  if (fix !== null) return { fix };
  const client = createClient({ base });
  const packs = (await client.packs().catch(() => null)) as (Wire & { value?: PackState[] }) | null;
  const ids = (packs?.ok ? (packs.value ?? []) : []).find((p) => p.id === MONEY_MODULE)?.registers ?? [];
  const asked = new Map<string, Promise<void>>();
  await Promise.all(ids.map((id) => learn(client.schema, id, asked).catch(() => {})));
  const held = new Set(options.lists.map((l) => l.id));
  const brought = ids.flatMap((id) => (held.has(id) || !REGISTERS[id] ? [] : [{ ...(REGISTERS[id] as unknown as TellList), pack: MONEY_MODULE, count: 0 }]));
  forget();
  const got = await readBoot(base).catch(() => null);
  const order = got?.from === 'live' ? got.boot.registers.map((r) => r.id) : [];
  const at = (id: string): number => order.indexOf(id) + 1 || order.length + 1;
  const lists = [...options.lists, ...brought].sort((a, b) => at(a.id) - at(b.id));
  return { told: reader(words, { ...options, lists }), lists };
}
