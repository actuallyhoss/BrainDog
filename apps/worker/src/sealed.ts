/**
 * Sealed files on the Cloud: the bytes `packages/record/src/methods/sealed.ts` keeps, in `BLOBS` under the record's own
 * id at `<record>/sealed/<name>`, beside its files (`<record>/a/`) and its copies (`<record>/snapshots/`).
 *
 * THE FILES' BUCKET AND NEVER THE FILES' DOOR. `files.ts` serves `<record>/a/<sha256>` and nothing else, so a sealed
 * part is never an address a page, a link or a browser can open; only the record's own four methods read this prefix,
 * from inside the record's object, and they hand a part back to the owner alone.
 *
 * A NAME IS CHECKED BEFORE IT IS USED. The record names a part by the hash of its key, the file's hash and its number
 * (`sealedName`), so no key anybody chose is ever part of an object's key, and a name in any other shape is thrown before
 * the bucket is asked.
 *
 * COUNTED AS A FILE IS COUNTED. `spend` is the day's bytes for one record (`ABUSE.uploadDay`), the budget `files.ts`
 * spends, asked by the record for each new part before it keeps it; the bucket is paid for per byte either way.
 *
 * GONE WITH THE RECORD. `destroy.ts` sweeps this prefix when the record is deleted, and the night's expiry of a closed
 * record sweeps it again, as it does the files.
 */

import { SEALED_NAME, type SealedStore } from '@braindog/record';

/** Where a record's sealed parts live in `BLOBS`: under the record's own id, so deleting the record can sweep them. */
export const sealedPrefix = (record: string): string => `${record}/sealed/`;

/** R2's ceiling on the keys one `delete` names. */
const DELETE_BATCH = 1000;

/** The three bucket methods the store asks for, which R2's are. */
export type SealedBucket = {
  put(key: string, value: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(keys: string | string[]): Promise<void>;
};

/**
 * The store for one record. `record` answers its id when a part is first put or read, not when the object opens, since a
 * record that has not been created yet has no id to keep anything under.
 */
export function cloudSealed(bucket: SealedBucket, record: () => string, spend?: (bytes: number) => Promise<number | null>): SealedStore {
  const keyOf = (name: string): string => {
    if (!SEALED_NAME.test(name)) throw new Error('A sealed part is named by its key, its file and its number, and this name is none of those.');
    return `${sealedPrefix(record())}${name}`;
  };
  return {
    put: async (name, bytes) => {
      await bucket.put(keyOf(name), bytes);
    },
    get: async (name) => {
      const object = await bucket.get(keyOf(name));
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    },
    drop: async (names) => {
      const keys = names.map(keyOf);
      for (let i = 0; i < keys.length; i += DELETE_BATCH) await bucket.delete(keys.slice(i, i + DELETE_BATCH));
    },
    ...(spend === undefined ? {} : { spend }),
  };
}
