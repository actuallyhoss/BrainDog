/**
 * The next steps a first Today offers once something is added (`WantMore.svelte`), use case 6's step 6.
 *
 * LOADED ON A FIRST TODAY ONLY (`Home.svelte`). The steps name the lists an agent would see in the person's own words,
 * and those words are read off every use case this build ships (`start/made.ts`), which a Today kept for months never
 * draws. So this file and what it reads arrive with a first Today, a moment after it, and never with any other.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { madeSteps, type MadeStep } from '../start/made.ts';
import { showTell, type Holds, type Said } from './first-today.ts';

export { madeSteps };

/**
 * The next steps Today offers, in the order the person's answer puts them, or none: while the card is still the first
 * act, and once the person has hidden them.
 */
export function wantMore(boot: Holds, pref: Said = {}): MadeStep[] {
  if (pref.nextStepsHidden === true || showTell(boot, pref)) return [];
  return madeSteps(boot.registers, pref.arrivesBy);
}
