/**
 * The metrics the record ships with.
 *
 * THEY LIVE IN `@braindog/seed`, beside the registers and the rows, because the record is what
 * answers them: a declaration only the browser could read was a declaration the record could not be
 * measured against. What is here is the app's own type for them.
 *
 * THROUGH `@braindog/seed/packs`, NOT THE ROOT. The root is the sample as well, and `tools/gates/no-fixtures.mjs`
 * refuses a shipped file that imports it; the subpath carries the declarations and none of the rows.
 *
 * AND THROUGH `/packs/metrics`, NOT `/packs`: that door carries the modules' documents too, and this file is on the first
 * open. This one is the five modules' own tables and nothing behind them, the same value `/packs` hands out.
 */

import { METRICS as SEED_METRICS } from '@braindog/seed/packs/metrics';

import { knowFigures } from './figures-known.ts';
import type { MetricDecl } from './metrics.ts';

export const METRICS = SEED_METRICS as unknown as Record<string, MetricDecl>;

/* AND SO DOES EVERY FILE THAT READS `figures-known.ts`, under what a record has said of a figure. The page path no longer
   imports this file: a record says each figure it draws with the figure (`figures-known.ts`), and this loads for a
   record built before it said them, and for the screens that list every figure (the palette, a row's page, Decide). */
knowFigures(METRICS);
