/**
 * AN EXPLICIT SIGN-OUT TAKES THE PERSON'S PUBLISHER KEY OFF THIS BROWSER (his call of 23 Oct). The key is kept per
 * person (`author-key.ts`) and only the app's own press reaches it as them, but it is still in this browser's storage,
 * usable by anyone at the keyboard with the developer tools open. A person who presses Sign out on a shared Mac leaves
 * no key behind, so the next person on the device never publishes or takes back an add-on as them. Their next publish
 * here makes a new key, which the publish screen says once (`addon-from.ts` `words.keyAfterSignOut`).
 *
 * THE ONE KEY KEPT BEFORE KEYS WERE PER PERSON goes too: it is handed to the first person who asks for one, so whoever
 * signed in next would publish under it.
 *
 * A SESSION THAT ONLY LAPSED KEEPS ITS KEY: this is called from the explicit sign-outs in `auth.ts` alone.
 *
 * SMALL ON PURPOSE, AND THE ONE PLACE THE NAMES ARE: `author-key.ts` reads them from here, so a sign-out loads neither
 * the declare package nor the signing code, and the two can never name different stores. Never throws, and never opens
 * a store this browser does not already have.
 */

export const KEY_DB = 'braindog-author-key';
export const KEY_SHELF = 'keys';
export const KEY_LEGACY_SLOT = 'publisher';
export const keySlotOf = (person: string): string => `${KEY_LEGACY_SLOT}:${person}`;

/** Drop `person`'s publisher key, and the old shared one, from this browser. `null` drops the shared one alone. */
export async function forgetAuthorKey(person: string | null, idb: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB): Promise<void> {
  if (idb === undefined) return;
  try {
    /* NO STORE IS MADE TO EMPTY IT: a browser that never published has none, and opening one would make it. */
    if (typeof idb.databases === 'function') {
      const all = await idb.databases();
      if (!all.some((d) => d.name === KEY_DB)) return;
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(KEY_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(KEY_SHELF);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('indexeddb'));
      req.onblocked = () => reject(new Error('indexeddb'));
    });
    try {
      const tx = db.transaction(KEY_SHELF, 'readwrite');
      const shelf = tx.objectStore(KEY_SHELF);
      if (person !== null && person !== '') shelf.delete(keySlotOf(person));
      shelf.delete(KEY_LEGACY_SLOT);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(new Error('indexeddb'));
        tx.onerror = () => reject(new Error('indexeddb'));
      });
    } finally {
      db.close();
    }
  } catch {
    /* blocked or broken storage keeps nothing to drop */
  }
}
