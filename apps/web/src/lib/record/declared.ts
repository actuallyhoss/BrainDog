/**
 * The metrics the record ships with.
 *
 * THEY LIVE IN `@braindog/seed`, beside the registers and the rows, because the record is what
 * answers them: a declaration only the browser could read was a declaration the record could not be
 * measured against. What is here is the app's own type for them.
 */

import { METRICS as SEED_METRICS } from '@braindog/seed';

import type { MetricDecl } from './metrics.ts';

export const METRICS = SEED_METRICS as unknown as Record<string, MetricDecl>;
