/**
 * The agents working now, as the desk's "Working now" says them: who, in which project, doing what, and for how long.
 *
 * FROM `boot`'S OWN ANSWER (`workingNow()` in `waits.svelte.ts`), so this says the number the rail and the header say.
 * The project is its name and takes the project card's colour where the desk draws that card: its SLOT (SPEC 1.3), the
 * same `--cat-*` pair the card's `--ph` is, never the old continuous hue. Pure, tested in `desk.test.ts`.
 */

import { since } from 'braindog-render';

import type { Working } from '../record/boot-live.ts';
import { actor } from '../record/names.ts';
import { slotOf, type Slot } from '../ui/face.ts';

export type WorkingRow = {
  key: string;
  agent: string;
  /** The run, which the face is coloured by; empty where the record sent no number. */
  run: string;
  live: 'working' | 'quiet';
  project: string | null;
  hue: number | null;
  /** The project's colour as the card draws it (`--cat-<slot>`), or `null` with no project or no card for it. */
  slot: Slot | null;
  doing: string | null;
  /**
   * How long it has been at it, for a run that is working (today F18): "for 32 min", "since 08:40", "since 2 Sep"; for a
   * run gone quiet, when it was last heard ("12h ago"). Empty where the record did not say when it began.
   */
  began: string;
};

/** How many agents the desk names; the rest are counted. */
export const WORKING_MOST = 4;

export function workingRows(working: readonly Working[], hues: ReadonlyMap<string, number | null>, now: number): WorkingRow[] {
  return working.map((w, i) => {
    const hue = w.project ? (hues.get(w.project.trim()) ?? null) : null;
    return {
      key: w.seq === null ? `w${i}` : `S${w.seq}`,
      agent: actor(w.agent).name,
      run: w.seq === null ? '' : `S${w.seq}`,
      live: w.quiet ? 'quiet' : 'working',
      project: w.project && w.project.trim() !== '' ? w.project.trim() : null,
      hue,
      slot: hue === null ? null : slotOf(hue),
      doing: w.doing && w.doing.trim() !== '' ? w.doing.trim() : null,
      began: w.since ? (w.quiet ? since(w.since, now) : forSaid(w.since, now)) : '',
    };
  });
}

/** How long a working run has been at it: minutes within the hour, then the clock it began at, then its day. */
export function forSaid(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(1, Math.round((now - t) / 60_000));
  if (mins < 60) return `for ${mins} min`;
  const at = new Date(t);
  if (now - t < 24 * 3_600_000) return `since ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `since ${at.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getMonth()]}`;
}
