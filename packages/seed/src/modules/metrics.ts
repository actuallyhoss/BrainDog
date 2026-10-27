/**
 * The figures the first-party modules ship, as `@braindog/seed/packs/metrics`, read straight from each module.
 *
 * `@braindog/seed/packs` carries them too, and the first screen needs nothing else from it. But that door also carries
 * the documents (`packs/first-party.ts`), which read the root, which is the sample, so the app's first open paid for
 * every module's document and example rows to learn how a figure is formatted. Built here from the five modules' own
 * tables, a bundle keeps those tables and drops the rest: about eight kilobytes on a phone where it was about thirty-four.
 *
 * IT LIVES BESIDE THE MODULES, because it names them: a file the core ships may not spell an add-on's id (`tools/gates/core-names.mjs`).
 *
 * ONE TABLE. `index.ts` exports this one as `METRICS`, so the root, the packs door and this door hand out the same value.
 */

import type { SeedMetric } from './base.ts';
import { ESTATE_METRICS } from './estate.ts';
import { ADDON_LEG_LISTS, withoutLegs } from './held-legs.ts';
import { MONEY_METRICS } from './money/figures/index.ts';
import { PEOPLE_METRICS } from './people.ts';
import { PROJECT_METRICS } from './portfolio.ts';
import { WORK_METRICS } from './work.ts';

const FIGURES: readonly { pack: string; metrics: Record<string, SeedMetric> }[] = [
  { pack: 'money-core', metrics: MONEY_METRICS },
  { pack: 'estate', metrics: ESTATE_METRICS },
  { pack: 'portfolio', metrics: PROJECT_METRICS },
  { pack: 'work', metrics: WORK_METRICS },
  { pack: 'people', metrics: PEOPLE_METRICS },
];

/** EVERY FIGURE AS ITS MODULE DECLARES IT, with the walk's legs over the lists an add-on holds: what the pack documents are cut from. */
export const ALL_METRICS: Record<string, SeedMetric> = Object.assign({}, ...FIGURES.map((f) => f.metrics));

/** THE SAMPLE'S FIGURES: without a leg over a list only an add-on holds, which the sample does not, and a figure over the walk would be refused it. */
export const METRICS: Record<string, SeedMetric> = withoutLegs(ALL_METRICS, (register) => !ADDON_LEG_LISTS.has(register));
