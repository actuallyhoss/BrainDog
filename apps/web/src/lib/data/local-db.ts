/**
 * The local copy's store in IndexedDB (`local.ts` says what goes in it and why it stays true).
 *
 * ONE DATABASE, TWO STORES: `meta` holds the one owner row, `answers` the kept answers by `name key`. One owner at a
 * time, so a sign-out or a record switch is a `clear` and nothing is left behind under another name.
 *
 * EVERY CALL IS WRAPPED. A private window, blocked site data or a quota refuses IndexedDB in ways that throw or never
 * answer; `idbStore` answers `null` where there is none, and each method rejects instead of throwing, which the copy
 * reads as empty.
 */

import type { Meta, Store, Stored } from './local.ts';

const NAME = 'braindog-local';
const META = 'meta';
const ANSWERS = 'answers';
/** An open that never answers (a blocked upgrade) is given up on. */
const OPEN_MS = 1_500;

const done = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB refused'));
  });

const finished = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB refused'));
  });

function opened(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IndexedDB did not open')), OPEN_MS);
    try {
      const req = idb.open(NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        if (!db.objectStoreNames.contains(ANSWERS)) db.createObjectStore(ANSWERS, { keyPath: 'at' }).createIndex('kept', 'kept');
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        /* ANOTHER TAB ON A NEWER BUILD MAY ASK TO UPGRADE: this one lets go rather than block it. */
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = req.onblocked = () => {
        clearTimeout(timer);
        reject(req.error ?? new Error('IndexedDB blocked'));
      };
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

/** The browser's store, or `null` where IndexedDB is not there to ask. */
export function idbStore(idb: IDBFactory | null = here()): Store | null {
  if (idb === null) return null;
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    db ??= opened(idb).catch((e: unknown) => {
      db = null;
      throw e;
    });
    return db;
  };
  const tx = async (stores: string[], mode: IDBTransactionMode): Promise<IDBTransaction> => (await open()).transaction(stores, mode);

  return {
    async meta() {
      const t = await tx([META], 'readonly');
      return ((await done(t.objectStore(META).get('owner'))) as Meta | undefined) ?? null;
    },
    async setMeta(meta) {
      const t = await tx([META], 'readwrite');
      t.objectStore(META).put(meta, 'owner');
      await finished(t);
    },
    async get(at) {
      const t = await tx([ANSWERS], 'readonly');
      return ((await done(t.objectStore(ANSWERS).get(at))) as Stored | undefined) ?? null;
    },
    async put(row) {
      const t = await tx([ANSWERS], 'readwrite');
      t.objectStore(ANSWERS).put(row);
      await finished(t);
    },
    async drop(lists) {
      const t = await tx([ANSWERS], 'readwrite');
      const s = t.objectStore(ANSWERS);
      if (lists === null) s.clear();
      else {
        /* A WALK, NOT AN INDEX: there are at most `LOCAL_MOST` rows, and a multi-entry index is one more thing to migrate. */
        const req = s.openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return;
          if ((c.value as Stored).lists.some((l) => lists.has(l))) c.delete();
          c.continue();
        };
      }
      await finished(t);
    },
    async rewrite(lists, fn) {
      /* ONE TRANSACTION, so a screen never reads an answer half patched. `fn` is pure and never awaits, which an open
         IndexedDB transaction requires. */
      const t = await tx([ANSWERS], 'readwrite');
      const req = t.objectStore(ANSWERS).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        const row = c.value as Stored;
        if (row.lists.some((l) => lists.has(l))) {
          let next: Stored | null = null;
          try {
            next = fn(row);
          } catch {
            next = null;
          }
          if (next === null) c.delete();
          else c.update(next);
        }
        c.continue();
      };
      await finished(t);
    },
    async prune(most) {
      const t = await tx([ANSWERS], 'readwrite');
      const s = t.objectStore(ANSWERS);
      const n = await done(s.count());
      let over = n - most;
      if (over > 0) {
        const req = s.index('kept').openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c || over <= 0) return;
          c.delete();
          over -= 1;
          c.continue();
        };
      }
      await finished(t);
    },
    async clear() {
      const t = await tx([META, ANSWERS], 'readwrite');
      t.objectStore(META).clear();
      t.objectStore(ANSWERS).clear();
      await finished(t);
    },
  };
}

/**
 * THE LAST READER'S SIGNING KEY (`local-mark.ts`), in the `meta` store beside the owner, so the copy's `clear` takes it
 * too. A `CryptoKey` goes into IndexedDB whole and comes back still unable to be read out.
 */
export function idbKey(subtle: SubtleCrypto | null, idb: IDBFactory | null = here()): (make: boolean) => Promise<CryptoKey | null> {
  let db: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> => {
    if (idb === null) return Promise.reject(new Error('no IndexedDB'));
    db ??= opened(idb).catch((e: unknown) => {
      db = null;
      throw e;
    });
    return db;
  };
  return async (make) => {
    if (subtle === null) return null;
    try {
      const t = (await open()).transaction([META], 'readonly');
      const held = (await done(t.objectStore(META).get('mark-key'))) as CryptoKey | undefined;
      if (held) return held;
      if (!make) return null;
      const key = (await subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])) as CryptoKey;
      const w = (await open()).transaction([META], 'readwrite');
      w.objectStore(META).put(key, 'mark-key');
      await finished(w);
      return key;
    } catch {
      return null;
    }
  };
}

function here(): IDBFactory | null {
  try {
    return globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}
