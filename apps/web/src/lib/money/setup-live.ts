/**
 * What Money's first-open setup reads and writes. A route-only module, loaded when the setup opens, never with a page.
 *
 * READS: the store's catalogue (the add-ons on the money shelf), the add-ons this record holds, and the account list's
 * declaration (the kinds of account, and the day a balance is as of).
 *
 * WRITES, ON THE ONE PRESS: the home currency, into the add-on whose settings keep it, as the first run writes it; the
 * first account, through the record's ordinary `create`; and each add-on chosen, through the store's own plan and
 * install (`routes/addons/[id]/offer.ts`), signed and checked as the add-on's own page checks it. An add-on whose plan
 * asks for something, or whose key is not one this person has seen, is not installed here: it is handed back, to be
 * finished on its own page, where its plan is shown and asked.
 */

import { createClient } from '@braindog/client';
import type { CatalogueIndex } from '@braindog/declare/catalogue';

import { KEEP_RATES_ASK, RATES_PACK } from '../../routes/addons/[id]/rates-switch.ts';
import { install, planFor } from '../../routes/addons/[id]/offer.ts';
import { catalogueText, keepFirstKey, readHostCatalogue, trustForEntry } from '../../routes/addons/catalogue.ts';
import { recordKeys } from '../../routes/addons/known-keys.ts';
import { HOME_CURRENCY } from '../../routes/settings/[area]/words-money.ts';
import { listingHref } from '../market/listing.ts';
import * as pref from '../pref.ts';
import { recordNow } from '../record/boot-live.ts';
import { REGISTERS } from '../record/held.ts';
import { choose, type PackState } from '../record/packs.ts';
import { recordToday } from '../record/zone.ts';
import type { Ledger } from './ledger.ts';
import { installOrder, moneyAddons, words, type Addon } from './setup.ts';

/** One kind of account, by its value and the word a person reads. */
export type Kind = { value: string; label: string };

export type SetupRead = {
  addons: Addon[];
  /** The add-ons this record holds and has on, by id. */
  on: string[];
  /** Whether the rates add-on is on already. */
  rates: boolean;
  /** `null` when the store answered; its sentence otherwise. */
  storeFix: string | null;
  kinds: Kind[];
  index: CatalogueIndex | null;
  states: PackState[];
  /** The currency the money already told is in, the most used one, or `null` where none is told (AM22). Offered beside
      the home currency, never ahead of it (RN8). */
  told: string | null;
};

const cap = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1).replaceAll('_', ' ');

/** The kinds of account the list declares, in its own words where it gives them. */
export function kindsOf(ledger: Ledger): Kind[] {
  const decl = REGISTERS[ledger.account.list];
  const field = decl?.fields.find((f) => f.id === ledger.account.kind);
  return (field?.values ?? []).map((v) => ({ value: v, label: field?.labels?.[v] ?? cap(v) }));
}

/** The money lines a person tells before there is an account: bills and invoices, what repeats, and the Ledger. */
const TOLD_LISTS = ['obligations', 'recurring'] as const;

/** A money value as the record holds one. */
const isMoney = (v: unknown): v is { amount: number; currency: string } =>
  v !== null && typeof v === 'object' && typeof (v as { currency?: unknown }).currency === 'string' && typeof (v as { amount?: unknown }).amount === 'number';

/**
 * A LINE'S MAIN AMOUNT, ONCE (RN8): its `amount` where that is money, else its first money field. Every money field was
 * counted, so a payout with an amount and a paid figure counted twice, and two USD payouts outvoted three EGP bills.
 */
const mainAmount = (fields: Record<string, unknown>): { amount: number; currency: string } | null =>
  isMoney(fields.amount) ? fields.amount : (Object.values(fields).find(isMoney) ?? null);

/**
 * THE CURRENCY HIS MONEY IS ALREADY IN: the main amount of each of the newest lines of the lists money is told into
 * before an account, the most used currency first. `null` when none holds money, or the record would not say. It is a
 * second choice beside the home currency, and leads only where the record has no home currency (`MoneySetup`).
 */
export async function toldCurrency(client: ReturnType<typeof createClient>, ledger: Ledger): Promise<string | null> {
  const lists = [...new Set<string>([...TOLD_LISTS, ledger.list])];
  const read = await Promise.all(lists.map((register) => client.list({ register, limit: 25 }).catch(() => null)));
  const counts = new Map<string, number>();
  for (const out of read) {
    if (!out?.ok) continue;
    for (const row of out.value.rows as { fields?: Record<string, unknown> }[]) {
      const main = mainAmount(row.fields ?? {});
      if (main) counts.set(main.currency, (counts.get(main.currency) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [c, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = c;
  return best;
}

/** Everything the setup draws from, at once. */
export async function readSetup(base: string, ledger: Ledger): Promise<SetupRead> {
  const client = createClient({ base });
  const [store, packs, told] = await Promise.all([readHostCatalogue(fetch), choose(client).catch(() => null), toldCurrency(client, ledger).catch(() => null)]);
  const states = packs?.first.ok ? packs.first.value : [];
  const index = store.ok ? store.index : null;
  const on = states.filter((s) => s.disabled_at === null).map((s) => s.id);
  return {
    addons: moneyAddons(index),
    on,
    rates: on.includes(RATES_PACK),
    storeFix: store.ok ? (index === null ? words.noStore : null) : store.fix,
    kinds: kindsOf(ledger),
    index,
    states,
    told,
  };
}

/** What the person chose, as the last press sends it. */
export type Chosen = {
  /** The currency to keep, or `null` to leave it as it is. */
  currency: string | null;
  /** The first account, or `null` where the record has one already. */
  account: { name: string; kind: string; minor: number; currency: string } | null;
  addons: string[];
  rates: boolean;
};

/** What the press came to: what went wrong, said, and what is left for the person, each with where it is finished. */
export type Finished = { failed: string[]; left: { label: string; href: string }[] };

type Wire = { ok: boolean; refusal?: { fix?: string } };
const fixOf = (w: unknown): string => (w as Wire | null)?.refusal?.fix ?? '';

/** Keep the home currency in the add-on whose settings declare it, as the first run keeps it. */
async function keepCurrency(client: ReturnType<typeof createClient>, states: readonly PackState[], code: string): Promise<string | null> {
  for (const s of states.filter((p) => p.disabled_at === null)) {
    const read = (await client.packConfig({ id: s.id }).catch(() => null)) as (Wire & { value?: { config?: Record<string, unknown> } }) | null;
    if (!read?.ok || !Object.hasOwn(read.value?.config ?? {}, HOME_CURRENCY)) continue;
    const set = (await client.setPackConfig({ id: s.id, values: { [HOME_CURRENCY]: code } }).catch(() => null)) as Wire | null;
    return set?.ok ? null : `${words.currencyNotSet} ${fixOf(set)}`.trim();
  }
  return words.currencyNotSet;
}

/** Add the first account: its name, kind and balance, as of today on every day the list asks for. */
async function addAccount(client: ReturnType<typeof createClient>, ledger: Ledger, a: NonNullable<Chosen['account']>): Promise<string | null> {
  const acc = ledger.account;
  const decl = REGISTERS[acc.list];
  const today = recordToday(recordNow());
  const days = (decl?.fields ?? []).filter((f) => f.type === 'day' && f.required === true && f.retired !== true).map((f) => f.id);
  const fields: Record<string, unknown> = {
    [acc.title]: a.name.trim(),
    ...(acc.kind ? { [acc.kind]: a.kind } : {}),
    ...(acc.money ? { [acc.money]: { amount: a.minor, currency: a.currency } } : {}),
    ...Object.fromEntries(days.map((d) => [d, today])),
  };
  const out = (await client.create({ register: acc.list, fields }).catch(() => null)) as Wire | null;
  return out?.ok ? null : `${words.accountNotMade} ${fixOf(out)}`.trim();
}

/**
 * Put one add-on in through the store's own plan, or say why not. `left` when its plan asks for something or its key
 * is not one this person has seen: that is finished on its own page, where both are shown.
 */
async function addAddon(client: ReturnType<typeof createClient>, index: CatalogueIndex, addon: Addon, states: readonly PackState[]): Promise<'in' | 'left' | string> {
  const entry = index.entries.find((e) => e.kind === 'pack' && e.id === addon.id);
  const version = entry?.versions.find((v) => v.version === addon.version);
  if (!entry || !version) return 'left';
  const got = await catalogueText(fetch, entry, version);
  if (!got.ok) return got.fix;
  const keys = recordKeys((name, args) => client.call(name, args));
  const trust = await trustForEntry(keys, entry, version.version, got.signature, index.keys);
  if (trust.kind === 'revoked' || trust.kind === 'stripped' || trust.kind === 'changed') return 'left';
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(got.text) as Record<string, unknown>;
  } catch {
    return 'left';
  }
  const planned = await planFor(client, { kind: 'pack', id: entry.id, source: 'kennel', title: entry.title }, { doc, text: got.text }, states, words.finishing);
  if (!planned.ok) return 'left';
  const asks = planned.planned.kind === 'pack' ? planned.planned.approve.length > 0 || planned.planned.after !== undefined : true;
  const conflicts = planned.planned.kind === 'pack' ? (planned.planned.diff as { conflicts?: unknown[] } | null)?.conflicts ?? [] : [];
  if (asks || conflicts.length > 0) return 'left';
  const out = await install(client, planned.planned, states, pref.read().nav ?? [], words.finishing);
  if (!out.ok) return 'left';
  if (out.nav) pref.write({ nav: out.nav });
  await keepFirstKey(keys, `${entry.kind}:${entry.id}`, trust).catch(() => false);
  return 'in';
}

/** The one press: the currency, the account, then each add-on in the order it goes in. */
export async function finishSetup(base: string, ledger: Ledger, read: SetupRead, chosen: Chosen): Promise<Finished> {
  const client = createClient({ base });
  const failed: string[] = [];
  const left: Finished['left'] = [];
  if (chosen.currency !== null) {
    const fix = await keepCurrency(client, read.states, chosen.currency);
    if (fix) failed.push(fix);
  }
  if (chosen.account !== null) {
    const fix = await addAccount(client, ledger, chosen.account);
    if (fix) failed.push(fix);
  }
  let states = read.states;
  for (const addon of installOrder(chosen.addons, read.addons, new Set(read.on))) {
    const out = read.index ? await addAddon(client, read.index, addon, states).catch(() => 'left' as const) : 'left';
    if (out === 'in') {
      const again = await choose(client).catch(() => null);
      if (again?.first.ok) states = again.first.value;
    } else left.push({ label: words.openOne(addon.title), href: listingHref({ kind: 'pack', id: addon.id }) });
    if (out !== 'in' && out !== 'left') failed.push(out);
  }
  if (chosen.rates && !read.rates) left.push({ label: words.setRates, href: KEEP_RATES_ASK });
  return { failed, left };
}
