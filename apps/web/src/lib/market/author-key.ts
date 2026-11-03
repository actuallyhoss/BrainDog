/**
 * The publisher's signing key, kept in this browser, and the signature it puts on what the app publishes.
 *
 * MADE ONCE, NEVER SEEN AGAIN. The first publish makes an Ed25519 pair with WebCrypto whose private half is
 * NON-EXTRACTABLE: no call in any browser hands its bytes back. The pair is kept in IndexedDB as the `CryptoKey` itself,
 * never in local storage, never sent, never printed or logged. Only the public half leaves, inside each signature, which
 * is how the Kennel and Browse know the key (`signing.ts`: the key id is the publisher).
 *
 * THE SAME BYTES `signVersion` SIGNS: `signedText(kind, id, version, checksum)` from `@braindog/declare`, never a second
 * format, so a signature made here verifies with `verifySignature` wherever a catalogue is read.
 *
 * NOTHING RETURNED HOLDS THE PRIVATE KEY. `authorKey` answers the key's id, its public half and a `sign` function that
 * closes over the private half; a failure answers `null` and no error is passed on, so no message can carry it.
 *
 * ONE KEY PER PERSON, NOT PER BROWSER. The key was kept in one slot and outlived sign-out, so whoever signed in next on
 * the same browser published or took back the last person's plugins as them, and a trusted publisher's version lists
 * without review. Each person's key is kept under their own id now (`publisher:<person>`), read off the session at the
 * press, and a browser with nobody signed in has no key. THE ONE KEY KEPT BEFORE THIS, in the bare `publisher` slot,
 * goes to the first person who asks for a key on this browser: it is the key their add-ons are pinned to, and a fresh
 * one would have the store refuse every update to them.
 *
 * A SIGN-OUT KEEPS THE KEY (`author-key-forget.ts` says why): the store takes an update only with the key that signed the
 * add-on, so a key dropped at sign-out would strand every add-on the person published. It is kept under their id, and
 * nobody else signed in on this browser reaches it.
 *
 * LOADED ONLY WHEN SOMEBODY PUBLISHES: `publish.ts` imports this file with `import()` at the press, so no page pays for
 * the declare package or IndexedDB until then. The store is injectable for tests, and IndexedDB is opened only when called.
 */

import { fileChecksum, keyIdOf, readCatalogueFile, signedText, verifySignature, type EntryKind, type Signature } from '@braindog/declare/catalogue';
import { verifyYank, yankText } from '@braindog/declare/kennel';
import { KEY_DB, KEY_LEGACY_SLOT, KEY_SHELF, keySlotOf } from './author-key-forget.ts';

/** One key as a store keeps it: the private half as the browser's own non-extractable object, and what is public. */
export type KeptKey = { privateKey: CryptoKey; public_key: string; key_id: string; created_at: string };

/**
 * Where the key is kept. `keep` keeps the key it is given only when none is kept yet, and answers the one kept, so two
 * tabs publishing at once end up with one key between them.
 */
export type KeyStore = { read(): Promise<KeptKey | null>; keep(key: KeptKey): Promise<KeptKey> };

/** The key as the app uses it. JSON of this is its id, its public half and when it was made, and nothing else. */
export type AuthorKeyHandle = {
  key_id: string;
  public_key: string;
  created_at: string;
  sign(kind: string, id: string, version: string, checksum: string): Promise<Signature | null>;
  /** The key's signature over taking a version back, with the reason it is read with. */
  signYank(kind: EntryKind, id: string, version: string, reason: string): Promise<Signature | null>;
};

const ALG = { name: 'Ed25519' } as const;
/* WHERE THE KEY IS KEPT is named once, in a small file of its own (`author-key-forget.ts`). */
const DB = KEY_DB;
const SHELF = KEY_SHELF;
/** The one slot every key was kept in before keys were kept per person, read once to hand its key on (`indexedStore`). */
const LEGACY_SLOT = KEY_LEGACY_SLOT;
/** The slot one person's key is kept in. */
export const slotOf = keySlotOf;

const toB64 = (bytes: ArrayBuffer): string => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const subtle = (): SubtleCrypto | null => (typeof globalThis.crypto === 'object' && globalThis.crypto?.subtle ? globalThis.crypto.subtle : null);

const isKept = (v: unknown): v is KeptKey => {
  if (typeof v !== 'object' || v === null) return false;
  const k = v as Record<string, unknown>;
  return typeof k.privateKey === 'object' && k.privateKey !== null && typeof k.public_key === 'string' && typeof k.key_id === 'string' && typeof k.created_at === 'string';
};

/* ── the stores ─────────────────────────────────────────────────────────── */

/** A store in memory, for tests and for a page that keeps nothing. */
export function memoryStore(): KeyStore {
  let held: KeptKey | null = null;
  return {
    read: async () => held,
    keep: async (key) => (held ??= key),
  };
}

const asked = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('indexeddb'));
  });

/**
 * One person's key in the browser's IndexedDB, opened at the first read or keep and not before. `null` when the browser
 * has none.
 *
 * THE KEY KEPT BEFORE KEYS WERE PER PERSON is moved off the shared shelf by the first person signed in whose key is read,
 * in the same transaction that takes it out of the old slot, so it goes to one person and never two: into their slot when
 * theirs is empty, and beside their own key, unread, when they have one, so nobody later on this browser is handed it.
 */
export function indexedStore(person: string): KeyStore | null {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (idb === undefined) return null;
  let db: Promise<IDBDatabase> | null = null;
  /* An open that fails is not kept either, so a later press opens it again. */
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(SHELF);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('indexeddb'));
      req.onblocked = () => reject(new Error('indexeddb'));
    }).catch((e: unknown) => {
      db = null;
      throw e;
    }));
  const slot = slotOf(person);
  return {
    read: async () => {
      const tx = (await open()).transaction(SHELF, 'readwrite');
      const shelf = tx.objectStore(SHELF);
      const got = await asked(shelf.get(slot));
      const old = await asked(shelf.get(LEGACY_SLOT));
      if (!isKept(old)) return isKept(got) ? got : null;
      const landed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(new Error('indexeddb'));
      });
      /* AND OUT OF THE SHARED SLOT EITHER WAY (RM7): a person who has a key of their own still takes the old one off the
         shelf, kept beside theirs and never read, so the next person signed in here is never handed it. */
      shelf.put(old, isKept(got) ? `${slot}:before` : slot);
      shelf.delete(LEGACY_SLOT);
      await landed;
      return isKept(got) ? got : old;
    },
    keep: async (key) => {
      const tx = (await open()).transaction(SHELF, 'readwrite');
      const shelf = tx.objectStore(SHELF);
      const had = await asked(shelf.get(slot));
      if (isKept(had)) return had;
      /* KEPT ONCE THE WRITE HAS LANDED, not when it was asked: a write the browser drops (no room) answers no key, so
         nothing is signed by a key the next visit would not have, which the Kennel would refuse as a changed key. */
      const landed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(new Error('indexeddb'));
      });
      shelf.add(key, slot);
      await landed;
      return key;
    },
  };
}

/**
 * The one person of a self-host in OPEN MODE (no server key, one person on one machine), whose key is kept under this
 * name: such a host holds no sessions, so `/auth/session` answers nobody, and the key was never made (RD13). Every add-on
 * published from it went out unsigned, and an update to one already pinned to a key was refused.
 */
export const OPEN_PERSON = 'open';

/**
 * Who is signed in to this browser now, by the session (`GET /auth/session`), or `null` for nobody or a session that
 * could not be read, which keeps no key. Asked at each press, so a sign-out and another sign-in between two presses
 * reach the second person's key and never the first's.
 *
 * ON AN OPEN SELF-HOST, ITS ONE PERSON (`OPEN_PERSON`), and only where the host itself says it is open
 * (`/auth/methods` answering `open: true`), which the Cloud never does: there, nobody signed in still keeps no key.
 */
export async function signedInNow(fetcher: typeof fetch = globalThis.fetch): Promise<string | null> {
  const asked = (path: string) => fetcher(path, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
  try {
    const res = await asked('/auth/session');
    if (res.ok) {
      const person = ((await res.json()) as { value?: { person?: unknown } } | null)?.value?.person;
      return typeof person === 'string' && person !== '' ? person : null;
    }
    const methods = await asked('/auth/methods');
    if (!methods.ok) return null;
    return ((await methods.json()) as { value?: { open?: unknown } } | null)?.value?.open === true ? OPEN_PERSON : null;
  } catch {
    return null;
  }
}

/**
 * The store of whoever is signed in at each ask: each person's made at their first press and kept, so every press of
 * theirs in a page shares one key in the making, and `null` while nobody is. The two halves are injectable for tests.
 */
export function personStores(who: () => Promise<string | null> = () => signedInNow(), make: (person: string) => KeyStore | null = indexedStore): () => Promise<KeyStore | null> {
  const stores = new Map<string, KeyStore | null>();
  return async () => {
    const person = await who();
    if (person === null) return null;
    if (!stores.has(person)) stores.set(person, make(person));
    return stores.get(person) ?? null;
  };
}

const theStore = personStores();

/* ── the key ────────────────────────────────────────────────────────────── */

/** One key made or loaded per store at a time, so two presses in one page never make two keys. */
const making = new WeakMap<KeyStore, Promise<AuthorKeyHandle | null>>();

async function made(store: KeyStore, now: () => Date): Promise<AuthorKeyHandle | null> {
  const sc = subtle();
  if (sc === null) return null;
  try {
    let kept = await store.read();
    if (kept === null) {
      const pair = (await sc.generateKey(ALG, false, ['sign', 'verify'])) as CryptoKeyPair;
      const public_key = toB64((await sc.exportKey('raw', pair.publicKey)) as ArrayBuffer);
      kept = await store.keep({ privateKey: pair.privateKey, public_key, key_id: await keyIdOf(public_key), created_at: now().toISOString() });
    }
    /* A KEPT KEY WHOSE ID IS NOT ITS PUBLIC HALF'S was changed where it was kept, and signs nothing. */
    if ((await keyIdOf(kept.public_key)) !== kept.key_id) return null;
    const { privateKey, public_key, key_id, created_at } = kept;
    return {
      key_id,
      public_key,
      created_at,
      sign: async (kind, id, version, checksum) => {
        try {
          const sig = toB64(await sc.sign(ALG, privateKey, new TextEncoder().encode(signedText(kind, id, version, checksum))));
          const signature: Signature = { alg: 'ed25519', key_id, public_key, sig, signed_at: now().toISOString() };
          /* The two halves are held to each other before anything goes out, as `signVersion` holds a key file. */
          return (await verifySignature(signature, kind, id, version, checksum)).ok ? signature : null;
        } catch {
          return null;
        }
      },
      signYank: async (kind, id, version, reason) => {
        try {
          const sig = toB64(await sc.sign(ALG, privateKey, new TextEncoder().encode(yankText(kind, id, version, reason))));
          const signature: Signature = { alg: 'ed25519', key_id, public_key, sig, signed_at: now().toISOString() };
          return (await verifyYank(signature, kind, id, version, reason)) ? signature : null;
        } catch {
          return null;
        }
      },
    };
  } catch {
    /* No Ed25519 in this browser, or no room to keep the key: it publishes unsigned, and says so. */
    return null;
  }
}

/**
 * The publisher's key: made the first time and kept, loaded every time after. `null` when this browser cannot make or
 * keep one (no WebCrypto, no Ed25519, no IndexedDB), which publishes unsigned as before.
 */
export async function authorKey(given?: KeyStore | null, now: () => Date = () => new Date()): Promise<AuthorKeyHandle | null> {
  const store = given === undefined ? await theStore() : given;
  if (store === null) return null;
  let out = making.get(store);
  if (out === undefined) {
    out = made(store, now);
    making.set(store, out);
    /* A failure is not kept, so a later press tries again. */
    void out.then((k) => (k === null ? making.delete(store) : undefined));
  }
  return out;
}

/** The publisher's signature over taking a version back, or `null` when this browser holds no key. */
export async function yankSignatureFor(kind: EntryKind, id: string, version: string, reason: string, store?: KeyStore | null): Promise<Signature | null> {
  const key = await authorKey(store);
  return key === null ? null : key.signYank(kind, id, version, reason);
}

/** A signature over one version, by the publisher's key, or `null` when this browser cannot sign. */
export async function signFor(kind: string, id: string, version: string, checksum: string, store?: KeyStore | null): Promise<Signature | null> {
  const key = await authorKey(store);
  return key === null ? null : key.sign(kind, id, version, checksum);
}

/**
 * The signature a file goes to the Kennel with: its kind, id and version read through the door it will be read by
 * (`readCatalogueFile`, as the Kennel's `acceptSubmission` reads them) and the checksum of its canonical JSON. `null`
 * when the browser cannot sign, or when the file does not read, which the Kennel then refuses in its own words.
 */
export async function signatureFor(text: string, store?: KeyStore | null): Promise<Signature | null> {
  const read = await readCatalogueFile(text, { kind: 'kennel' });
  if (!read.ok) return null;
  const file = read.value;
  const { id, version } = file.kind === 'usecase' ? { id: file.shared.usecase.usecase, version: file.shared.usecase.version } : { id: file.file.pack.manifest.pack, version: file.file.pack.manifest.version };
  return signFor(file.kind, id, version, await fileChecksum(text), store);
}
