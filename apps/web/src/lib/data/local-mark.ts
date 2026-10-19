/**
 * The last reader: who a live boot last named on this record, so the local copy can be drawn for them alone before the
 * shell has claimed it, and on a boot nobody answered (`local.ts`, "THE LAST READER, SIGNED").
 *
 * WHY NOT THE SHELL COPY'S PERSON. `boot-copy.ts` drops its copy after every write that calls `forget`, on a record
 * switch and on any refused boot, offline included, so a tab closed at the wrong moment opened the next day with a full
 * local copy and nobody to draw it for.
 *
 * SIGNED, with an HMAC key this browser made and cannot read back out (`extractable: false`), held in the copy's own
 * IndexedDB, so a marker written into storage by hand, or left from a copy that was wiped, names nobody. The copy's
 * wipe clears the key with everything else, which unsigns every marker at once.
 *
 * IT ONLY EVER DRAWS. Nothing a marker names is a reader the record checked today: the shell drawn over it holds no
 * level to write by (`drawnFrom`), and the copy never stores a write.
 *
 * PURE, AND NODE LOADS IT: the storage, the key and the crypto are handed in, so `local-mark.test.ts` runs it.
 */

import { LOCAL_MS } from './local.ts';

export const MARK_KEY = 'braindog.last-reader';
/** Bump when the marker's shape or what it signs changes: another one names nobody. */
export const MARK_VERSION = 1;

type Strings = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type MarkDeps = {
  store: Strings | null;
  /** The signing key, made when `make` and none is held; `null` where there is no key to be had. */
  key: (make: boolean) => Promise<CryptoKey | null>;
  subtle: SubtleCrypto | null;
  now?: () => number;
};

type Mark = { v: number; base: string; person: string; at: number; sig: string };

const signed = (m: Pick<Mark, 'v' | 'base' | 'person' | 'at'>) => new TextEncoder().encode(`${m.v}\n${m.base}\n${m.person}\n${m.at}`);

const toText = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromText = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Name `person` as the last reader of `base`. Called only with a reader a live boot named. */
export async function writeMark(base: string, person: string, deps: MarkDeps): Promise<void> {
  if (!deps.store || !deps.subtle || person === '') return;
  try {
    const key = await deps.key(true);
    if (!key) return;
    const m = { v: MARK_VERSION, base, person, at: (deps.now ?? Date.now)() };
    const sig = toText(await deps.subtle.sign('HMAC', key, signed(m)));
    deps.store.setItem(MARK_KEY, JSON.stringify({ ...m, sig }));
  } catch {
    /* No marker: the copy waits for the shell's claim, as it did before there was one. */
  }
}

/** The last reader of `base`, or `null`: none, another record's, older than the copy may be, or not signed by this browser. */
export async function readMark(base: string, deps: MarkDeps): Promise<string | null> {
  if (!deps.store || !deps.subtle) return null;
  try {
    const raw = deps.store.getItem(MARK_KEY);
    if (raw === null) return null;
    const m = JSON.parse(raw) as Partial<Mark> | null;
    if (!m || m.v !== MARK_VERSION || typeof m.base !== 'string' || typeof m.person !== 'string' || typeof m.at !== 'number' || typeof m.sig !== 'string')
      return null;
    if (m.base !== base || m.person === '') return null;
    const t = (deps.now ?? Date.now)();
    if (t < m.at || t - m.at >= LOCAL_MS) return null;
    const key = await deps.key(false);
    if (!key) return null;
    const ok = await deps.subtle.verify('HMAC', key, fromText(m.sig), signed({ v: m.v, base: m.base, person: m.person, at: m.at }));
    return ok ? m.person : null;
  } catch {
    return null;
  }
}

/** Forget the last reader: a sign-out, a refusal the record gave. */
export function dropMark(store: Strings | null): void {
  try {
    store?.removeItem(MARK_KEY);
  } catch {
    /* nothing to drop */
  }
}

/** A key in memory, for a test and for a browser with no IndexedDB (where it lasts as long as the tab). */
export function memoryKey(subtle: SubtleCrypto): MarkDeps['key'] {
  let held: Promise<CryptoKey> | null = null;
  return async (make) => {
    if (held) return held;
    if (!make) return null;
    held = subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']) as Promise<CryptoKey>;
    return held;
  };
}
