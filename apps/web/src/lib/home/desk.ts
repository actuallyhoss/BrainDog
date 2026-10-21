/**
 * The agents working now, as the desk's "Working now" says them: who, in which project, doing what, and for how long.
 *
 * FROM `boot`'S OWN ANSWER (`workingNow()` in `waits.svelte.ts`), so this says the number the rail and the header say.
 * The project is its name and takes the project card's colour where the desk draws that card: its SLOT (SPEC 1.3), the
 * same `--cat-*` pair the card's `--ph` is, never the old continuous hue. Pure, tested in `desk.test.ts`.
 */

import { since } from 'braindog-render';

import type { Working } from '../record/boot-live.ts';
import type { LiveRun, Thread } from '../record/instruct.ts';
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
  /** Paused or stopped by him, from `presence`; `null` while it runs as it likes. */
  held?: 'stop' | 'pause' | null;
  /** What it holds from him, in his words, from `presence` and what he told it: "Merge wave 1, then stop". */
  holds?: string | null;
  /** What the time's place says instead of how long, where `presence` says it is not working: "waiting", "Paused by you". */
  word?: string | null;
};

/** The words a row from `presence` says in place of how long. */
export const LIVE_WORDS = { waiting: 'waiting', pause: 'Paused by you', stop: 'Stopped by you' } as const;

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

/**
 * How long a working run has been at it, as a length and never a clock (today F18, VERIFY P2: "since 03:05" read as a
 * time to work out): "for 32 min", "for 2 h 5 min", "for 14 h", then the day it began.
 */
export function forSaid(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(1, Math.round((now - t) / 60_000));
  if (mins < 60) return `for ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 10) return m === 0 ? `for ${h} h` : `for ${h} h ${m} min`;
  if (h < 24) return `for ${h} h`;
  const at = new Date(t);
  return `since ${at.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getMonth()]}`;
}

/**
 * THE ROWS AS `presence` SAYS THEM (agents and MCP plan §4.4, §7.2), over the rows `boot` drew at the first paint: each
 * lead run open now that is working or thinking, or that `boot` counts as working, with what it says it is doing, how
 * long it has been at it, what he told it that it holds, and whether he paused or stopped it. A helper is folded under
 * the run it works for and is not a row. The project's name and colour are the `boot` row's for the same run, since
 * `presence` names a project by its handle and Today names it by its card.
 */
export function liveRows(rows: readonly WorkingRow[], live: readonly LiveRun[], threads: readonly Thread[], now: number): WorkingRow[] {
  const drawn = new Map(rows.map((r) => [r.run, r] as const));
  const leads = live.filter((r) => r.parent === null && r.state !== 'ended' && r.state !== 'gone' && (r.state === 'working' || r.state === 'thinking' || drawn.has(r.run)));
  return leads.map((r) => {
    const was = drawn.get(r.run);
    const told = r.instruction === null ? null : (threads.find((t) => t.id === r.instruction) ?? null);
    const working = r.state === 'working' || r.state === 'thinking';
    const began = new Date(now - Math.max(0, r.for_s) * 1000).toISOString();
    const doing = r.doing?.trim() || was?.doing || null;
    return {
      key: r.run,
      agent: was?.agent ?? actor(r.agent ?? 'other').name,
      run: r.run,
      live: working && r.stopped === null ? 'working' : 'quiet',
      project: was?.project ?? null,
      hue: was?.hue ?? null,
      slot: was?.slot ?? null,
      doing,
      began: forSaid(began, now),
      held: r.stopped,
      holds: told ? told.said.replace(/\s+/gu, ' ').trim() : null,
      word: r.stopped ? LIVE_WORDS[r.stopped] : working ? null : LIVE_WORDS.waiting,
    };
  });
}
