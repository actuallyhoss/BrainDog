/**
 * Tell for the native apps: the web's own reader, `tellRead`, and the one pure step it needs before it can read, which
 * the apps run in JavaScriptCore with no web view (`apps/apple/tools/tell-core.mjs` bundles this file into
 * `tell-core.js`; `TellCore.swift` calls it; plan 3.9).
 *
 * THE SAME READER, NOT A PORT. A line typed in the iPhone's Tell sheet becomes exactly the entries it becomes on Today,
 * because it is read by this file's import of `read.ts` and nothing else. Swift hands two answers through without
 * reading them, `boot` and the lists' declarations (`schema`, keyed by list id), plus the day, and gets `Told` back as
 * JSON.
 *
 * `tellOptions` IS TODAY'S OWN ASSEMBLY (`Home.svelte`'s `tellOptions`, with `tellLists` from `first-today.ts`) written
 * without the tab's learnt state: what the tab knows by having read the record (each list's entries by name), native
 * passes as `known`, and leaves out where it has not asked.
 */

import { tellRead, type Known, type TellList, type TellOptions, type Told } from './read.ts';

/** What of `boot` the reader needs: the lists this person holds, with their counts and add-ons, the money, who they are. */
export type NativeBoot = {
  registers: readonly { id: string; count?: number; pack?: string }[];
  index?: { currency?: string | null } | null;
  me?: { name?: string | null } | null;
};

/** What the app has learnt of the record beside `boot`: entries by name, by list id, and the reader's own name. */
export type NativeKnown = {
  titled?: Readonly<Record<string, readonly Known[]>>;
  people?: readonly Known[];
  accounts?: readonly Known[];
  orgs?: readonly Known[];
  /** Every currency the record's money is in. */
  held?: readonly string[];
  me?: string | null;
};

/**
 * The options a line is read against: each list `boot` says this person holds, as the record declared it, with its count
 * and add-on; the day; the record's currency; and whatever the app has learnt. A list with no declaration is left out,
 * never guessed, as `tellLists` leaves it.
 */
export function tellOptions(boot: NativeBoot, schemas: Readonly<Record<string, TellList | undefined>>, today: string, known: NativeKnown = {}): TellOptions {
  const lists: TellList[] = [];
  for (const r of boot.registers) {
    const raw = schemas[r.id];
    if (!raw) continue;
    const d = declared(raw, r.id);
    const owned: TellList = typeof r.pack === 'string' ? { ...d, pack: r.pack } : d;
    lists.push(typeof r.count === 'number' && Number.isFinite(r.count) ? { ...owned, count: r.count } : owned);
  }
  const currency = boot.index?.currency ?? null;
  return {
    lists,
    today,
    currency,
    home: currency,
    held: known.held ?? (currency ? [currency] : []),
    ...(known.people ? { people: known.people } : {}),
    ...(known.accounts ? { accounts: known.accounts } : {}),
    ...(known.orgs ? { orgs: known.orgs } : {}),
    ...(known.titled ? { titled: known.titled } : {}),
    me: known.me ?? boot.me?.name ?? null,
  };
}

/**
 * A declaration as the tab keeps one (`declOf` in `record/remote.ts`): its id, a name, and one of it, which the record
 * does not require and the reader says ("an order from Nadia"). The same fallbacks, written here because `remote.ts`
 * carries the tab's whole client with it, and a bundle for JavaScriptCore carries the reader alone.
 */
function declared(raw: TellList, id: string): TellList {
  const name = typeof raw.name === 'string' && raw.name !== '' ? raw.name : id;
  const one = typeof raw.one === 'string' && raw.one !== '' ? raw.one : name.toLowerCase().replace(/ies$/, 'y').replace(/([^s])s$/, '$1');
  return { ...raw, id, name, one, fields: Array.isArray(raw.fields) ? raw.fields : [] };
}

/** One line read: JSON in, `Told` out, for a caller that speaks only strings (JavaScriptCore from Swift). */
export function readJSON(sentence: string, optionsJSON: string): string {
  const told: Told = tellRead(sentence, JSON.parse(optionsJSON) as TellOptions);
  return JSON.stringify(told);
}

/** `tellOptions` over JSON, the same way. */
export function optionsJSON(bootJSON: string, schemasJSON: string, today: string, knownJSON = '{}'): string {
  return JSON.stringify(tellOptions(JSON.parse(bootJSON) as NativeBoot, JSON.parse(schemasJSON) as Record<string, TellList>, today, JSON.parse(knownJSON) as NativeKnown));
}

export { tellRead };
