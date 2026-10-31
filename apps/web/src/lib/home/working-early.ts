/**
 * Who is working now, asked as soon as Today's answer says the tile has someone to show (`tile-code.ts`), and taken by
 * the tile when it mounts (`WorkingNow.svelte`), which read it only once the first screen had drawn (speed-e SE3).
 *
 * THE SAME TWO CALLS THE TILE MAKES, in one batch: the runs open now (`presence`) and, for the owner alone, what he told
 * agents (`instructionList`), which nobody else is answered. Held for one first read (`early-asks.ts`).
 *
 * PURE ENOUGH FOR NODE: no rune, no `$lib`.
 */

import { askEarly, heldEarly, takeEarly } from '../data/early-asks.ts';
import { firstDrawn } from '../data/first-drawn.ts';

/** What he told agents, as many as the tile reads. */
export const THREADS_READ = 20;

/** The two answers as the record gave them, and whether the second was asked. */
export type WorkingAsked = { presence: unknown; threads: unknown; owner: boolean };

const key = (base: string): string => `${base} working`;

/**
 * Ask who is working now, and for the owner what he told agents, on the record at `base`. ONLY BEFORE THE TAB'S FIRST
 * SCREEN HAS DRAWN, which is the read the tile waited for: a Today read again later finds the tile reading for itself,
 * and an answer asked then could be older than something he told an agent since.
 */
export function askWorking(base: string, owner: boolean): void {
  if (firstDrawn()) return;
  askEarly(key(base), async (): Promise<WorkingAsked> => {
    const { createClient } = await import('@braindog/client');
    const c = createClient({ base, ahead: true });
    const [presence, threads] = await Promise.all([c.presence(), owner ? c.instructionList({ limit: THREADS_READ }) : Promise.resolve(null)]);
    return { presence, threads, owner };
  });
}

/**
 * The runs and what he told out of the answers asked ahead, as the tile reads them, with no code of the control room's
 * (`instruct.ts` reads its own answers the same way): `runs` is `null` for a refusal, and the tile keeps what it drew.
 */
export function earlyRuns(got: WorkingAsked): { runs: unknown[] | null; threads: unknown[] } {
  const value = (answer: unknown): unknown =>
    answer !== null && typeof answer === 'object' && (answer as { ok?: unknown }).ok === true ? (answer as { value?: unknown }).value : undefined;
  const runs = value(got.presence);
  const told = value(got.threads) as { rows?: unknown } | undefined;
  return { runs: Array.isArray(runs) ? runs : null, threads: Array.isArray(told?.rows) ? told.rows : [] };
}

/** Whether the tile's first read is already on its way, so it reads at once rather than after the first screen. */
export const workingHeld = (base: string): boolean => heldEarly(key(base));

/** The answers asked ahead, handed once: `null` when the tile reads for itself. */
export const takeWorking = (base: string): Promise<WorkingAsked | null> | null => takeEarly<WorkingAsked>(key(base));
