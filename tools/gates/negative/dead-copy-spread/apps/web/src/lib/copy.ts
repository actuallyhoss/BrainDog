/**
 * The seeded violation: a sentence typed in an area file the aggregate spreads, and rendered nowhere.
 *
 * `copy` types nothing itself, as `apps/web/src/lib/copy.ts` does. `shown` and `neverShown` are typed in
 * `copy/area.ts`, so the gate finds `neverShown` only by following the spread to that file. A gate that read only this
 * file would find no key at all and pass.
 */
import { area } from './copy/area.ts';

export const copy = {
  ...area,
} as const;
