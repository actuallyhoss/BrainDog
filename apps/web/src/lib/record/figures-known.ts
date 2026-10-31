/**
 * WHAT EACH FIGURE IS, AS FAR AS THIS TAB HAS BEEN TOLD: what the record said of the figures its answers named, and this
 * build's own declarations once `declared.ts` has loaded.
 *
 * THE RECORD SAYS IT. Every answered block that names a figure carries `figures` (`BlockResult.figures` in the kernel):
 * each figure's name, the list and `where` it reads, what it adds up, its format, its target and what it groups by,
 * as this record declares it. `page-live.ts` learns them (`figures-said.ts`) before it reads the block, and `blocks.ts` (a grouped
 * figure's parts, a series' unit) and `row-href.ts` (where a hole's figure lives) read the same table. So the page path
 * never loads the seed's tables, about 30 KB once compressed, to say a figure the record has just described.
 *
 * A RECORD BUILT BEFORE IT SENDS NO `figures`, and for one of its blocks the build's tables are loaded as they were
 * (`figuresFor`), so an app ahead of its record draws what it drew. What the record said wins over the build's copy.
 *
 * THIS FILE IS ON TODAY'S FIRST LOAD (`blocks.ts` and `row-href.ts` read it), so it holds the table and nothing else;
 * what learns from an answer is `figures-said.ts`, which the page readers bring.
 */

import type { MetricDecl } from './metrics.ts';

/* ONE OBJECT, FILLED IN PLACE, so a reader that imported it sees every figure learnt after it loaded. */
export const FIGURES_KNOWN: Record<string, MetricDecl> = {};

/** The figures a record described (`figures-said.ts`), which the build's copy never overwrites. */
export const SAID = new Set<string>();

/* THE BUILD'S OWN COPY, KEPT APART, so a record switch can put it back under nothing (`figuresOf`). */
const BUILT: Record<string, MetricDecl> = {};
let known: string | null = null;

/** This build's own declarations (`declared.ts`), under every figure a record has described. */
export function knowFigures(table: Record<string, MetricDecl>): void {
  for (const [id, decl] of Object.entries(table)) {
    BUILT[id] = decl;
    if (!SAID.has(id)) FIGURES_KNOWN[id] = decl;
  }
}

/**
 * The table is for the record at `base` (RG19). ONE TAB OPENS MORE THAN ONE BRAINDOG, and a figure B names but does not
 * describe was drawn with A's declaration: A's format, target and `where`. On a switch what the last record said is
 * forgotten, and the build's copy is all that is left until the new one says its own.
 */
export function figuresOf(base: string): void {
  if (known === base) return;
  if (known !== null) {
    SAID.clear();
    for (const id of Object.keys(FIGURES_KNOWN)) delete FIGURES_KNOWN[id];
    Object.assign(FIGURES_KNOWN, BUILT);
  }
  known = base;
}
