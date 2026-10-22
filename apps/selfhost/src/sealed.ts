/**
 * Sealed files on a self-host: the bytes `packages/record/src/methods/sealed.ts` keeps, on disk at
 * `<data>/<slug>/blobs/sealed/<name>`, inside the folder the record's files are in (`files.ts`, `blobsFolder`).
 *
 * THE FILES' FOLDER AND NEVER THE FILES' DOOR. The door serves `blobs/<sha256>` and tests the name first, and `sealed` is
 * not sixty-four hex characters, so no address it answers reaches this folder. Only the record's own four methods read
 * it, and they hand a part back to the owner alone, as on the Worker (`apps/worker/src/sealed.ts`).
 *
 * A NAME IS CHECKED BEFORE IT IS JOINED INTO A PATH. The record names a part by the hash of its key, the file's hash and
 * its number (`sealedName`), so no key anybody chose is ever part of a path, and a name in any other shape is thrown.
 *
 * A PART IS WRITTEN UNDER A TEMPORARY NAME AND MOVED INTO PLACE, as a file is, so a crash mid-write leaves a stray
 * temporary file and never a part cut short under its own name; readable by this user alone, as the record file is.
 *
 * NOTHING IS COUNTED. The machine is the owner's, and its disk is the only limit a day of bytes would stand for.
 *
 * GONE WITH THE RECORD AND KEPT IN ITS COLD COPY: deleting a record removes `blobs/` and everything in it
 * (`server.ts`, `destroy`), and the cold copy takes `blobs/` whole (`cold.ts`).
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SEALED_NAME, type SealedStore } from '@braindog/record';

/** The folder a record's sealed parts live in: `sealed/` inside its files' folder. */
export const sealedFolder = (blobs: string): string => join(blobs, 'sealed');

/** The store for one record whose files are kept in `blobs`. */
export function diskSealed(blobs: string): SealedStore {
  const folder = sealedFolder(blobs);
  const pathOf = (name: string): string => {
    if (!SEALED_NAME.test(name)) throw new Error('A sealed part is named by its key, its file and its number, and this name is none of those.');
    return join(folder, name);
  };
  return {
    put: async (name, bytes) => {
      const target = pathOf(name);
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const passing = `${target}.${randomBytes(6).toString('hex')}.part`;
      writeFileSync(passing, bytes, { mode: 0o600 });
      renameSync(passing, target);
    },
    get: async (name) => {
      const at = pathOf(name);
      try {
        return new Uint8Array(readFileSync(at));
      } catch (e) {
        if ((e as { code?: unknown }).code === 'ENOENT') return null;
        throw e;
      }
    },
    drop: async (names) => {
      for (const name of names) rmSync(pathOf(name), { force: true });
    },
  };
}
