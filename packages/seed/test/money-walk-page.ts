/**
 * CASH AHEAD, READ THROUGH A RECORD, for the tests that hold the walk's truths.
 *
 * Money's home leads with Cash now and the walk drawn small (`parts/hero.ts`), and the chart with its controls is the
 * Forecast page's to place. The walk is one declaration wherever it is placed (`FORECAST` in `parts/forecast.ts`), so a
 * test reads that declaration as a block of its own (`Kernel.block`) and holds the walk, not the page it stands on.
 */

import type { BlockResult, Kernel, PageBlock } from '@braindog/kernel';

import { withoutLegs } from '../src/modules/held-legs.ts';
import { FORECAST } from '../src/modules/money/pages/parts/forecast.ts';

/** The Cash ahead block as Money declares it. */
export const CASH_AHEAD = FORECAST[0] as unknown as PageBlock & { heading: string; horizon: number; horizons: unknown[]; axis: string; from: unknown[] };

/**
 * Cash ahead read on a record, as a page drawing it reads it: `walk` is a length a reader picked on its knob. A leg over a
 * list the record does not hold (an add-on's) is left out, as every install leaves it out of the page it writes.
 */
export const readCashAhead = (k: Kernel, opts: { walk?: number | 'last' } = {}): BlockResult =>
  k.block(withoutLegs(CASH_AHEAD, (register) => k.register(register) !== undefined), opts);
