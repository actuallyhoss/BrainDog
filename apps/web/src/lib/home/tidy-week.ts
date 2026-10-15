/**
 * What the tidy found, finder by finder, under what went stale on Home (AGT-C18): "Empty runs: 41 stale, 3 cleared
 * this week", a line a kind of thing.
 *
 * THROUGH THE RECORD'S OWN FIGURES AND NOTHING ELSE. Each finder answers two figures on request, `stale-<finder>` (how
 * many wait now) and `tidied-<finder>` (how many the record cleared in seven days), and this file only asks for them
 * and says them. It never tidies, never asks, and files nothing: the tick's finders ask nobody (`ask: null`), and a
 * read here leaves that so.
 *
 * A FINDER THE RECORD WILL NOT ANSWER FOR IS LEFT OUT, WHOLE. A refusal on either figure, a host built before them, a
 * reading that is not a whole number and a host that threw all drop that finder, and the others still draw. A finder
 * at nought and nought is dropped too: there is nothing to say of it.
 *
 * A ROUTE-ONLY MODULE, like `stale.ts`: the client carries the route table as a value, so `Stale.svelte` imports this
 * by `import()` once its own lines are drawn, and nothing every screen loads ever pulls it.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';

/**
 * The kernel's finders (`packages/kernel/src/tidy.ts`, `tidy-keys.ts`, `tidy-same.ts`), in the order it registers
 * them, each with the plain name of the things it finds. `id` is the record's word and is never drawn.
 */
export const TIDY_FINDERS: readonly { id: string; name: string }[] = [
  { id: 'runs-stopped', name: 'Silent runs' },
  { id: 'runs-empty', name: 'Empty runs' },
  { id: 'steps-old', name: 'Steps nobody took' },
  { id: 'questions-old', name: 'Questions left open' },
  { id: 'questions-moot', name: 'Questions that no longer need you' },
  { id: 'faults-open', name: 'Faults still open' },
  { id: 'keys-unopened', name: 'Keys nobody has opened' },
  { id: 'rows-same', name: 'Things here twice' },
];

/** One finder as the record answered for it: how many wait now, and how many were cleared this week. */
export type Found = { id: string; name: string; stale: number; cleared: number };

/** The client's own `metric`, handed in so this is driven without a record. */
export type Metric = (metric: string) => Promise<unknown>;

/** A figure's reading, or `null` for a refusal, a host that threw, and a reading that is not a whole number. */
async function countOf(metric: Metric, id: string): Promise<number | null> {
  try {
    const out = (await metric(id)) as { ok?: unknown; value?: { value?: unknown } | null } | null | undefined;
    const n = out?.ok === true ? out.value?.value : undefined;
    return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Every finder's two figures, asked side by side, in the finders' order. A finder either figure is refused for is
 * left out. Never throws.
 */
export async function tidyWeekFrom(metric: Metric): Promise<Found[]> {
  const read = await Promise.all(
    TIDY_FINDERS.map(async (f) => {
      const [stale, cleared] = await Promise.all([countOf(metric, `stale-${f.id}`), countOf(metric, `tidied-${f.id}`)]);
      return stale === null || cleared === null ? null : { id: f.id, name: f.name, stale, cleared };
    }),
  );
  return read.filter((f): f is Found => f !== null);
}

/** What the tidy found on the record at `base`, finder by finder. Always an answer: one that fails is none. */
export async function loadTidyWeek(base: string, io?: Fetch): Promise<Found[]> {
  try {
    const client = createClient({ base, ...(io ? { fetch: io } : {}) });
    return await tidyWeekFrom((id) => client.metric(id));
  } catch {
    return [];
  }
}

/** "41 stale", "none stale". */
const staleSaid = (n: number): string => (n === 0 ? 'none stale' : `${String(n)} stale`);

/** "3 cleared this week", "none cleared this week". */
const clearedSaid = (n: number): string => (n === 0 ? 'none cleared this week' : `${String(n)} cleared this week`);

/**
 * THE LINES, one a finder: "Empty runs: 41 stale, 3 cleared this week". A finder at nought and nought is dropped, and
 * `null` when none is left, which draws nothing.
 */
export function tidyWeekLines(found: readonly Found[]): { id: string; said: string }[] | null {
  const lines = found
    .filter((f) => f.stale > 0 || f.cleared > 0)
    .map((f) => ({ id: f.id, said: `${f.name}: ${staleSaid(f.stale)}, ${clearedSaid(f.cleared)}` }));
  return lines.length === 0 ? null : lines;
}
