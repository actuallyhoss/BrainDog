/**
 * Which add-ons `/packs` lists under Browse, as a function the page and `packs-honest.test.ts` both call.
 */

import { MODULE_NAMES } from '@braindog/seed/usecases/names';
import type { PackInfo } from '$lib/record/schema.ts';
import type { PackState } from '$lib/record/packs.ts';

/**
 * Every catalogue entry the record does not hold, and on a record only the ones this build ships.
 *
 * THE SAMPLE'S TWO THIRD-PARTY ADD-ONS WERE OFFERED ON A LIVE RECORD, star counts and all. `Freelancer UK` (214 stars)
 * and `Type foundry` (37) are the sample's picture of a catalogue: nobody wrote them, nothing ships a document for
 * either, so Install on a record could only toast that it was not installable, and no star or install is counted
 * anywhere. On a record Browse now keeps the modules `MODULE_NAMES` lists, which `names.test.ts` holds to the modules
 * the use cases name; `packs-honest.test.ts` holds each one kept to a document `packDocument` really returns. The
 * sample keeps both pictures, because every write on the sample already says it saved nothing.
 *
 * `installed` on an entry is the sample's own fact, so the sample leaves out what it already has and a record leaves
 * out what it reads back.
 */
export function browseable(packs: readonly PackInfo[], live: boolean, installed: readonly PackState[]): PackInfo[] {
  return packs.filter((p) => (live ? Object.hasOwn(MODULE_NAMES, p.id) : !p.installed) && !installed.some((s) => s.id === p.id));
}
