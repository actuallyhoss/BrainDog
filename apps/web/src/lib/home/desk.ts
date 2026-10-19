/**
 * The agents working now, as the desk's "Working now" says them: who, in which project, doing what, and for how long.
 *
 * FROM `boot`'S OWN ANSWER (`workingNow()` in `waits.svelte.ts`), so this says the number the rail and the header say.
 * The project is its name and takes the project card's hue where the desk draws that card. Pure, tested in
 * `desk.test.ts`.
 */

import { since } from 'braindog-render';

import type { Working } from '../record/boot-live.ts';
import { actor } from '../record/names.ts';

export type WorkingRow = {
  key: string;
  agent: string;
  /** The run, which the face is coloured by; empty where the record sent no number. */
  run: string;
  live: 'working' | 'quiet';
  project: string | null;
  hue: number | null;
  doing: string | null;
  /** "12 min ago", or empty where the record did not say when it began. */
  began: string;
};

/** How many agents the desk names; the rest are counted. */
export const WORKING_MOST = 4;

export function workingRows(working: readonly Working[], hues: ReadonlyMap<string, number | null>, now: number): WorkingRow[] {
  return working.map((w, i) => ({
    key: w.seq === null ? `w${i}` : `S${w.seq}`,
    agent: actor(w.agent).name,
    run: w.seq === null ? '' : `S${w.seq}`,
    live: w.quiet ? 'quiet' : 'working',
    project: w.project && w.project.trim() !== '' ? w.project.trim() : null,
    hue: w.project ? (hues.get(w.project.trim()) ?? null) : null,
    doing: w.doing && w.doing.trim() !== '' ? w.doing.trim() : null,
    began: w.since ? since(w.since, now) : '',
  }));
}
