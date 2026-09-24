/**
 * Which add-ons `/packs` lists under Browse, as a function the page and `packs-honest.test.ts` both call.
 */

import { MODULE_NAMES } from '@braindog/seed/usecases/names';
import type { PackInfo } from '$lib/record/schema.ts';
import type { PackState } from '$lib/record/packs.ts';

/**
 * Every module this build ships that the record does not hold.
 *
 * THE SAMPLE'S TWO THIRD-PARTY ADD-ONS WERE OFFERED ON A LIVE RECORD, star counts and all. `Freelancer UK` (214 stars)
 * and `Type foundry` (37) are the fixtures' picture of a catalogue: nobody wrote them, nothing ships a document for
 * either, so Install could only toast that it was not installable, and no star or install is counted anywhere. Browse
 * keeps the modules `MODULE_NAMES` lists, which `names.test.ts` holds to the modules the use cases name;
 * `packs-honest.test.ts` holds each one kept to a document `packDocument` really returns.
 *
 * THERE IS NO SECOND LIST NOW. The sample kept both pictures, with a `live` flag choosing between them, and was drawn
 * whenever no record answered; the screen now draws Browse only once the record has said what it holds (DIRECTION 26).
 */
export function browseable(packs: readonly PackInfo[], installed: readonly PackState[]): PackInfo[] {
  return packs.filter((p) => Object.hasOwn(MODULE_NAMES, p.id) && !installed.some((s) => s.id === p.id));
}
