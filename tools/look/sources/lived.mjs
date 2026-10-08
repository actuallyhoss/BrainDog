/**
 * `lived`: the record PRF-A07 builds by living weeks of a profile through the product's own verbs.
 *
 * NOT BUILT YET. `tools/gates/lived.mjs` writes the file and hands back the file and its instant; until it exists
 * this source refuses with that sentence rather than drawing the seed under another name. Once it does, the file is
 * drawn as any record file is (`./file.mjs`), with the clock pinned at its instant. It may be pressed and never
 * counts as seen.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openFile } from './file.mjs';

const BUILDER = new URL('../../gates/lived.mjs', import.meta.url);

export async function open(profile = 'default') {
  if (!existsSync(fileURLToPath(BUILDER)))
    throw new Error('The lived record is not built yet: it arrives with PRF-A07. Draw the seed or a record file meanwhile.');
  const { buildLived } = await import(BUILDER.href);
  if (typeof buildLived !== 'function') throw new Error('tools/gates/lived.mjs has no buildLived, so the lived record cannot be built.');
  const built = await buildLived(profile || 'default');
  /* THE SELF-HOST'S CLOCK IS MILLISECONDS, so an instant handed back as a Date or an ISO string is turned into one
     here rather than pinning a clock that answers a string. */
  const at = built.now ?? built.at;
  const now = at === undefined || typeof at === 'number' ? at : new Date(at).getTime();
  if (Number.isNaN(now)) throw new Error('tools/gates/lived.mjs handed back an instant that is not a date, so the lived record cannot be drawn.');
  return openFile(built.file, { name: 'lived', record: `lived, ${profile || 'default'}`, now });
}
