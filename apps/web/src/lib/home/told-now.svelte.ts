/**
 * WHAT CAME BACK FROM WHAT HE TOLD AGENTS, as the shell last read it (`readToldBack` in `record/told-live.ts`): the
 * threads a run answered Needs you and the ones it finished. Held for the tab like `waits.svelte.ts`, so the rail's
 * badge, Today and Needs you read one answer and no screen asks the record a second time.
 *
 * Empty until the shell has read it, and on a record where he never told an agent anything.
 */

import type { Thread } from '../record/instruct.ts';

/** What came back, and the kind of agent behind each run that answered, by handle. */
export type Told = { needs: readonly Thread[]; done: readonly Thread[]; agents: Readonly<Record<string, string>> };

let heard = $state.raw<Told>({ needs: [], done: [], agents: {} });

/** What waits on him and what was finished, as the newest read said. Reactive where it is read. */
export const toldNow = (): Told => heard;

/** Hear the shell's read. */
export function heardTold(back: { needs: readonly Thread[]; done: readonly Thread[]; agents?: Readonly<Record<string, string>> }): void {
  heard = { needs: back.needs, done: back.done, agents: back.agents ?? {} };
}
