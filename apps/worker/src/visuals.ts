/**
 * Visuals on the Cloud: pages at `<record>/a/pages/<sha256>`, swept with the files and out of the file door's reach,
 * which answers one hash segment only. A picture is only looked at, as the door kept it.
 */

import type { VisualStore } from '@braindog/record';

import { fileKey, filesPrefix, SHA256 } from './files.ts';

/** Where a record's visual pages live in `BLOBS`. */
export const pagesPrefix = (record: string): string => `${filesPrefix(record)}pages/`;

/** The bucket methods the store asks for, which R2's are. */
export type VisualBucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  head(key: string): Promise<{ size: number; httpMetadata?: { contentType?: string } } | null>;
};

/** The store for one record. `record` answers its id when first asked, as the sealed store's does. */
export function cloudVisuals(bucket: VisualBucket, record: () => string): VisualStore {
  const pageKey = (sha256: string): string => {
    if (!SHA256.test(sha256)) throw new Error('A page is named by its SHA-256, and this name is not one.');
    return `${pagesPrefix(record())}${sha256}`;
  };
  return {
    putPage: async (sha256, bytes) => {
      const key = pageKey(sha256);
      if ((await bucket.head(key)) !== null) return;
      await bucket.put(key, bytes, { httpMetadata: { contentType: 'text/plain; charset=utf-8' } });
    },
    getPage: async (sha256) => {
      const object = await bucket.get(pageKey(sha256));
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    },
    file: async (sha256) => {
      if (!SHA256.test(sha256)) return null;
      const object = await bucket.head(fileKey(record(), sha256));
      return object === null ? null : { bytes: object.size, mime: object.httpMetadata?.contentType ?? 'application/octet-stream' };
    },
    /* AN ATTACHMENT'S BYTES, read once when it is attached so its words can be kept (`methods/attachments.ts`). */
    getFile: async (sha256) => {
      if (!SHA256.test(sha256)) return null;
      const object = await bucket.get(fileKey(record(), sha256));
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    },
    /* A FILE AN AGENT HANDS IN AS TEXT, kept where the file door keeps one, under its hash and the type the record read. */
    putFile: async (sha256, bytes, mime) => {
      if (!SHA256.test(sha256)) throw new Error('A file is named by its SHA-256, and this name is not one.');
      const key = fileKey(record(), sha256);
      if ((await bucket.head(key)) !== null) return;
      await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    },
  };
}
