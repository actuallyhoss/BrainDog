/**
 * THIS BUILD'S OWN FIGURE DECLARATIONS, AS FAR AS THEY HAVE LOADED: empty until `declared.ts` loads and hands it its table.
 *
 * THE DECLARATIONS ARE THE SEED'S FIVE MODULES' TABLES, about 35 KB once compressed, and the two files on Today's first
 * load that read them (`blocks.ts` for a grouped figure's parts and a series' unit, `row-href.ts` for where a hole's
 * figure lives) read them only for a block or a press that `page-live.ts` brought, and `page-live.ts` imports
 * `declared.ts`. So those two read this, and the tables arrive with the first page read instead of before Today draws.
 */

import type { MetricDecl } from './metrics.ts';

/* A LIVE BINDING, SET ONCE TO `declared.ts`'S OWN TABLE, so a reader sees the same object `declared.ts` hands out. */
export let FIGURES_KNOWN: Record<string, MetricDecl> = {};

export function knowFigures(table: Record<string, MetricDecl>): void {
  FIGURES_KNOWN = table;
}
