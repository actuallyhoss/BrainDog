/**
 * The metrics the record ships with.
 *
 * THEY LIVE IN `@braindog/seed`, beside the registers and the rows, because the record is what
 * answers them: a declaration only the browser could read was a declaration the record could not be
 * measured against. What is here is the app's own type for them.
 *
 * THROUGH `@braindog/seed/packs`, NOT THE ROOT. The root is the sample as well, and `tools/gates/no-fixtures.mjs`
 * refuses a shipped file that imports it; the subpath carries the declarations and none of the rows.
 */

import { METRICS as SEED_METRICS } from '@braindog/seed/packs';

import type { MetricDecl } from './metrics.ts';

export const METRICS = SEED_METRICS as unknown as Record<string, MetricDecl>;
