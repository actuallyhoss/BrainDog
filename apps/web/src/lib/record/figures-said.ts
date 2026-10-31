/**
 * WHAT A RECORD SAYS OF ITS FIGURES, LEARNT INTO `figures-known.ts`: each answered block's `figures`, and this build's
 * own tables for a block from a record built before it said them. Apart from the table, which is on Today's first load,
 * because only the page readers (`page-live.ts`, `page-drawn.ts`) learn from an answer.
 */

import { apiBase } from '../at.ts';
import { FIGURES_KNOWN, SAID, figuresOf } from './figures-known.ts';
import type { MetricDecl } from './metrics.ts';

/* A FIGURE'S ID AS A DECLARATION WRITES ONE, so no key the answer sends can reach the object's prototype. */
const FIGURE_ID = /^[a-z][a-z0-9_-]{0,79}$/u;

/** What a record's answer said of each figure it named (`figures` on a block), kept as the figure's declaration. */
export function learnFigures(said: unknown): void {
  /* WHAT ANOTHER BRAINDOG IN THIS TAB SAID IS NOT THIS ONE'S (RG19). */
  if (globalThis.location !== undefined) figuresOf(apiBase());
  if (said === null || typeof said !== 'object' || Array.isArray(said)) return;
  for (const [id, facts] of Object.entries(said as Record<string, unknown>)) {
    if (!FIGURE_ID.test(id) || facts === null || typeof facts !== 'object' || Array.isArray(facts)) continue;
    const f = facts as Partial<MetricDecl>;
    if (typeof f.name !== 'string' || typeof f.source !== 'string' || f.value === null || typeof f.value !== 'object') continue;
    /* A FIGURE WITH NO TARGET IS SAID WITH NONE: the declaration's type holds one, and `targetLine` reads its bounds. */
    FIGURES_KNOWN[id] = { ...(f as MetricDecl), metric: id, target: (f.target ?? {}) as MetricDecl['target'] };
    SAID.add(id);
  }
}

type Answered = { readings?: unknown; values?: unknown; series?: unknown; source?: unknown; refusals?: unknown; figures?: unknown };

/** Whether a drawn block names a figure and its record said nothing of its figures: a record built before `figures`. */
const unsaid = (b: Answered | null | undefined): boolean => {
  if (!b || typeof b !== 'object' || b.figures !== undefined) return false;
  if (Array.isArray(b.refusals) && b.refusals.length > 0) return false;
  const values = b.values !== null && typeof b.values === 'object' && Object.keys(b.values).length > 0;
  return (Array.isArray(b.readings) && b.readings.length > 0) || values || (Array.isArray(b.series) && b.series.length > 0) || (typeof b.source === 'string' && b.source.startsWith('metric.'));
};

let built: Promise<void> | null = null;

/**
 * Learns what the blocks say of their figures, and loads this build's own tables only where a block came from a record
 * that says nothing of them: a promise to wait on before drawing, or `null` when nothing is owed.
 */
export function figuresFor(blocks: readonly (Answered | null | undefined)[]): Promise<void> | null {
  for (const b of blocks) if (b && typeof b === 'object') learnFigures(b.figures);
  if (!blocks.some(unsaid)) return null;
  built ??= import('./declared.ts').then(
    () => undefined,
    () => {
      built = null;
    },
  );
  return built;
}
