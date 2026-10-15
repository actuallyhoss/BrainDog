/**
 * The one word a run reads as, for a person (AGT-C04, AGT-C10): Working now, Gone quiet, Left a step, Ended, Stopped,
 * or From before.
 *
 * THE KERNEL TELLS SIX APART (`presenceOf` in `@braindog/kernel`), and every screen folded them into the face's three
 * (`RunLive` in `face.ts`), so a run that handed on a step, one that finished and one carried in by an import all read
 * "Stopped". The ring stays the face's three (`ringOf`); the word beside it is one of these six.
 *
 * SAID AGAIN HERE, AND PINNED, because `face.ts` is in what every screen loads and this is not: a run's page, the Agents
 * settings and a page's runs block import it in their own chunks, and none of them should pull the kernel in for one
 * rule. `presence-words.test.ts` holds this to `presenceOf` state by state, so the two never become two clocks.
 */

import type { RunLive } from './face.ts';

/** Where a run is now, as the record's clock says it: the kernel's `Presence`, word for word. */
export type RunPresence = 'working' | 'quiet' | 'left' | 'ended' | 'stopped' | 'before';

/** What each reads as, out loud. */
export const PRESENCE_WORDS: Record<RunPresence, string> = {
  working: 'Working now',
  quiet: 'Gone quiet',
  left: 'Left a step',
  ended: 'Ended',
  stopped: 'Stopped',
  before: 'From before',
};

/** A run active and heard from inside fifteen minutes is working: the kernel's `WORKING_MS`. */
export const WORKING_MS = 15 * 60_000;

/**
 * The one word for a run, from its `state` (the row's column, or its fields' own when the column is not handed) and its
 * fields, against the record's clock.
 *
 * NEVER HEARD FROM HERE, no `last_seen`, is from before, whatever its state says: a run carried in from somewhere else.
 * Then a handoff left a step, done ended, abandoned was stopped by the sweep, and an open run is working only while
 * active and heard from inside fifteen minutes; anything else is quiet.
 */
export function presenceSaid(state: unknown, fields: Record<string, unknown>, nowMs: number): RunPresence {
  const seen = fields.last_seen;
  if (typeof seen !== 'string' || seen === '') return 'before';
  const now = typeof state === 'string' ? state : typeof fields.state === 'string' ? fields.state : '';
  if (now === 'handoff') return 'left';
  if (now === 'done') return 'ended';
  if (now === 'abandoned') return 'stopped';
  return now === 'active' && Date.parse(seen) >= nowMs - WORKING_MS ? 'working' : 'quiet';
}

/**
 * The face's ring for a word: working and quiet keep theirs, everything that stopped working reads stopped.
 *
 * ONLY AN ACTIVE RUN HAS A RING (`liveOf` in `face.ts`): handed its state, an idle run that is quiet draws no ring, as
 * the face has always drawn it.
 */
export function ringOf(p: RunPresence, state?: unknown): RunLive {
  if (state !== undefined && state !== 'active') return 'stopped';
  return p === 'working' || p === 'quiet' ? p : 'stopped';
}
