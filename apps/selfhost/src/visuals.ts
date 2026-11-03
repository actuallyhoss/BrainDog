/**
 * Visuals on a self-host: pages at `blobs/pages/<sha256>`, out of the file door's reach (it serves `blobs/<sha256>`
 * only), and a picture's length and type read from what the door kept.
 */

import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { VisualStore } from '@braindog/record';

import { keepType, SHA256, sniff } from './files.ts';

/** The folder a record's visual pages live in: `pages/` inside its files' folder. */
export const pagesFolder = (blobs: string): string => join(blobs, 'pages');

/** The store for one record whose files are kept in `blobs`. */
export function diskVisuals(blobs: string): VisualStore {
  const folder = pagesFolder(blobs);
  const pathOf = (sha256: string): string => {
    if (!SHA256.test(sha256)) throw new Error('A page is named by its SHA-256, and this name is not one.');
    return join(folder, sha256);
  };
  return {
    putPage: async (sha256, bytes) => {
      const target = pathOf(sha256);
      if (existsSync(target)) return;
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const passing = `${target}.${randomBytes(6).toString('hex')}.part`;
      writeFileSync(passing, bytes, { mode: 0o600 });
      renameSync(passing, target);
    },
    getPage: async (sha256) => {
      try {
        return new Uint8Array(readFileSync(pathOf(sha256)));
      } catch (e) {
        if ((e as { code?: unknown }).code === 'ENOENT') return null;
        throw e;
      }
    },
    /* A FILE ON DISK HAS NO TYPE BESIDE IT, so its first bytes are read again, as the door reads them when it serves it. */
    file: async (sha256) => {
      if (!SHA256.test(sha256)) return null;
      const at = join(blobs, sha256);
      let size: number;
      try {
        size = statSync(at).size;
      } catch {
        return null;
      }
      const head = new Uint8Array(16);
      const fd = openSync(at, 'r');
      try {
        readSync(fd, head, 0, head.length, 0);
      } finally {
        closeSync(fd);
      }
      return { bytes: size, mime: sniff(head) ?? 'application/octet-stream' };
    },
    /* AN ATTACHMENT'S BYTES, read once when it is attached so its words can be kept (`methods/attachments.ts`). */
    getFile: async (sha256) => {
      if (!SHA256.test(sha256)) return null;
      try {
        return new Uint8Array(readFileSync(join(blobs, sha256)));
      } catch (e) {
        if ((e as { code?: unknown }).code === 'ENOENT') return null;
        throw e;
      }
    },
    /* A FILE AN AGENT HANDS IN AS TEXT, kept where the file door keeps one: under a temporary name, then moved into place. */
    putFile: async (sha256, bytes, mime) => {
      if (!SHA256.test(sha256)) throw new Error('A file is named by its SHA-256, and this name is not one.');
      const target = join(blobs, sha256);
      mkdirSync(blobs, { recursive: true, mode: 0o700 });
      if (!existsSync(target)) {
        const passing = `${target}.${randomBytes(6).toString('hex')}.part`;
        writeFileSync(passing, bytes, { mode: 0o600 });
        renameSync(passing, target);
      }
      if (typeof mime === 'string') keepType(blobs, sha256, mime);
    },
  };
}
