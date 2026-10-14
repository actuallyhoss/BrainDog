/**
 * The publisher keys a person has seen, kept on their record, so every device and the command line read the same trust.
 *
 * KEPT AS THE PREF `packs.known_keys`: a map of what a signature covers (`trustSubject`, an entry's kind and id) to the
 * key ids seen for it, first seen first. Public key ids only: nothing here makes, holds or prints a signing key.
 *
 * AN OLDER RECORD, OR ONE OUT OF REACH, FALLS BACK TO THIS BROWSER: `setPref` refuses a key its `PREF_KEYS` does not
 * hold, and then the keys stay in `localStorage` under `KNOWN_KEYS` as they did before. The first read that reaches a
 * record carries what this browser kept over to it once, and clears the browser's copy only when the record kept it.
 *
 * PURE, AND THEREFORE TESTABLE: the record's call and the storage are handed in.
 */

import type { KnownKeys } from '@braindog/declare/catalogue';

/** The record's pref the keys are kept under (`PREF_KEYS` in `@braindog/record`). */
export const KNOWN_PREF = 'packs.known_keys';

/** Where a browser kept the key ids before the record did, and still does on a record that refuses the pref. */
export const KNOWN_KEYS = 'braindog.catalogue.keys';

/** What the record takes: at most this many entries, each with at most this many keys, newest kept. */
export const KNOWN_MOST = 200;
export const KEYS_MOST = 8;

/** The part of `Storage` read here, so a test hands in a map and a page hands in `localStorage`. */
export type KeyStore = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void };

/** This browser's storage, or `null` when it cannot be reached (a private window, blocked site data, the server). */
export function browserStore(): KeyStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export type Call = (name: string, args: Record<string, unknown>) => Promise<{ ok: true; value: unknown } | { ok: false; refusal?: { fix: string; code?: string } }>;

/** Where known keys are read and kept: the record, with this browser behind it, or this browser alone. */
export type KeySource = { read(): Promise<KnownKeys>; keep(known: KnownKeys): Promise<boolean> };

/** The keys a browser kept, or none when storage is out of reach or holds something else. */
export async function readLocal(store: KeyStore | null): Promise<KnownKeys> {
  const { readKnownKeys } = await import('@braindog/declare/catalogue');
  try {
    const raw = store?.getItem(KNOWN_KEYS) ?? null;
    return raw === null ? {} : readKnownKeys(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** The keys written to a browser, answering whether they were. */
export function keepLocal(store: KeyStore | null, known: KnownKeys): boolean {
  if (!store) return false;
  try {
    store.setItem(KNOWN_KEYS, JSON.stringify(known));
    return true;
  } catch {
    return false;
  }
}

/** A browser's copy taken away once the record holds it. */
function clearLocal(store: KeyStore | null): void {
  try {
    if (store?.removeItem) store.removeItem(KNOWN_KEYS);
    else store?.setItem(KNOWN_KEYS, '{}');
  } catch {
    /* A copy that cannot be cleared is only carried over again, and adds nothing the record does not hold. */
  }
}

/** Two maps as one, each entry's keys first seen first and each once, then held to what the record takes. */
export function mergeKnown(a: KnownKeys, b: KnownKeys): KnownKeys {
  const out: KnownKeys = {};
  for (const map of [a, b]) for (const [subject, ids] of Object.entries(map)) out[subject] = [...new Set([...(out[subject] ?? []), ...ids])];
  return capKnown(out);
}

/**
 * The newest `KNOWN_MOST` entries, each with its newest `KEYS_MOST` keys, so a full map is never refused whole. An entry
 * named outside 1 to 300 characters is left out for the same reason: one the record refuses would hold the rest back.
 */
export function capKnown(known: KnownKeys): KnownKeys {
  return Object.fromEntries(
    Object.entries(known)
      .filter(([subject]) => subject.length > 0 && subject.length <= 300)
      .slice(-KNOWN_MOST)
      .map(([subject, ids]) => [subject, ids.slice(-KEYS_MOST)]),
  );
}

/** What `boot` answers on `me.prefs` for the pref, or `undefined` when the record was not reached or refused. */
async function bootKeys(call: Call): Promise<{ held: unknown } | undefined> {
  try {
    const out = await call('boot', {});
    if (!out.ok) return undefined;
    const prefs = (out.value as { me?: { prefs?: Record<string, unknown> } } | null)?.me?.prefs;
    return { held: prefs?.[KNOWN_PREF] };
  } catch {
    return undefined;
  }
}

/** The keys kept on the record through `setPref`, answering whether the record kept them. */
async function setKeys(call: Call, known: KnownKeys): Promise<boolean> {
  try {
    return (await call('setPref', { key: KNOWN_PREF, value: capKnown(known) })).ok;
  } catch {
    return false;
  }
}

/**
 * The keys this person has seen: the record's, with anything this browser still holds carried over once. A record out of
 * reach answers this browser's keys, as before.
 */
export async function readKnown(call: Call, store: KeyStore | null = browserStore()): Promise<KnownKeys> {
  return (await readFrom(call, store)).known;
}

/** `readKnown`, saying too whether the record answered, so a keep after a read the record missed never writes it whole. */
async function readFrom(call: Call, store: KeyStore | null): Promise<{ known: KnownKeys; reached: boolean }> {
  const local = await readLocal(store);
  const got = await bootKeys(call);
  if (!got) return { known: local, reached: false };
  const { readKnownKeys } = await import('@braindog/declare/catalogue');
  const held = readKnownKeys(got.held);
  if (Object.keys(local).length === 0) return { known: held, reached: true };
  const merged = mergeKnown(held, local);
  /* CLEARED ONLY WHEN KEPT: an older record refuses the pref, and the browser's copy is then still the only one. */
  if (await setKeys(call, merged)) clearLocal(store);
  return { known: merged, reached: true };
}

/** The keys kept on the record, or in this browser when the record refuses the pref or is out of reach. */
export async function keepKnown(call: Call, known: KnownKeys, store: KeyStore | null = browserStore()): Promise<boolean> {
  return (await setKeys(call, known)) || keepLocal(store, capKnown(known));
}

/**
 * The record as a key source, with this browser behind it.
 *
 * A KEEP AFTER A READ THE RECORD MISSED GOES TO THIS BROWSER: `setPref` replaces the whole map, so a map read while the
 * record was out of reach would write over every publisher the record holds. Kept here instead, it is carried over by
 * the next read that reaches the record.
 */
export function recordKeys(call: Call, store: KeyStore | null = browserStore()): KeySource {
  let reached = false;
  return {
    read: async () => {
      const got = await readFrom(call, store);
      reached = got.reached;
      return got.known;
    },
    keep: (known) => (reached ? keepKnown(call, known, store) : Promise.resolve(keepLocal(store, capKnown(known)))),
  };
}

/** A browser alone as a key source, for a screen with no record to read. */
export const localKeys = (store: KeyStore | null): KeySource => ({
  read: () => readLocal(store),
  keep: async (known) => keepLocal(store, capKnown(known)),
});
