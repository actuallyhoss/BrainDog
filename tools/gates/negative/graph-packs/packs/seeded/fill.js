/* The seeded violation: a pack's script reaching into a core package by path. A pack reaches the
   core as a file the record installs, never as an import, and a relative climb is the one import
   pnpm resolves without a manifest saying so. `.js` on purpose, because a pack's script is written
   in it and a gate that read only `.ts` under `packs/` would not see this line. */
import { k } from '../../packages/kernel/src/index.ts';

export const seeded = k;
