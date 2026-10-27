/**
 * A run carried in from somewhere else keeps the day it was last seen there.
 *
 * THE KERNEL OWNS `last_seen`, and refused it from every caller (`KERNEL_WRITTEN`, `IMMUTABLE_FIELD`), so an adapter
 * that sent the old system's time lost the whole run, and one that left it out gave every run the import's day. On the
 * owner's record 295 imported runs read as if they had all been last heard from on the morning of the import.
 *
 * WHAT IS CARRIED IS STORED BESIDE THE CLOCK, NEVER IN IT. A carried time is `seen_before` (declared by migration 28),
 * so `last_seen` still means heard from here, `presenceOf` still answers `before` for the run, and `heardAt` reads the
 * carried day when nothing here has been heard. A run heard from here keeps refusing a caller's `last_seen`: its clock
 * is the record's.
 *
 * A STEP LEFT SOMEWHERE ELSE IS NOT A STEP HERE. A carried run's `next` was written for a session that is gone, so it
 * drops unless the run is in the `handoff` state, the one state that says a step waits to be taken (H.630).
 *
 * The kernel's write path calls this before its field loop and applies the answer after the stamp (`index.ts`).
 */

import type { Refusal } from '@braindog/ports';

import { coerce, type Json } from './coerce.ts';
import type { Patch } from './index.ts';

/** What a carried write becomes: the patch without the carried time, the stamp that holds it, and whether `next` goes. */
export type Carried = {
  /** The caller's patch with `last_seen` taken out, and `next` too when it drops. The same object when nothing was carried. */
  patch: Patch;
  /** The kernel's own fields to stamp after validation: `seen_before`, or nothing. */
  stamp: { seen_before?: string };
  /** Whether the row's `next` is cleared after the stamp, the one it held as well as the one this write sent. */
  dropNext: boolean;
};

/** The state that keeps its step: a run that ended and left one for the next session. */
const KEEPS_STEP = 'handoff';

/** The state a run is created in when the write names none, as the runs register declares it. */
const CREATED_AS = 'active';

/** A run's current row as far as this reads it. */
type Current = { state?: string | null; fields: Record<string, Json> } | null | undefined;

/** Whether a run has been heard from here: it holds a `last_seen`, which only the record writes. */
const heardHere = (current: Current): boolean => typeof current?.fields.last_seen === 'string' && current.fields.last_seen !== '';

/** The state the run is in once this write lands: the one it sends, else the one it holds, else the one it is made in. */
function stateAfter(patch: Patch, current: Current): string {
  if (typeof patch.state === 'string' && patch.state !== '') return patch.state;
  const held = current?.state ?? current?.fields.state;
  return typeof held === 'string' && held !== '' ? held : CREATED_AS;
}

/**
 * What a write to the runs register carries in, or a refusal when the time it carries cannot be read.
 *
 * ONLY ON A CREATE OR ON A RUN NEVER HEARD FROM HERE, and only when the patch holds a `last_seen`. Anything else
 * answers the patch as it came, so the field loop refuses a `last_seen` sent to a live run as it always has.
 *
 * THE TIME IS READ AS ANY INSTANT IS (`coerce`): a time with no zone, or one that is not a time, is refused in the
 * instant's own sentence at `last_seen`, rather than as a field the caller may not write.
 */
export function carriedIn(patch: Patch, current: Current): { ok: true; value: Carried } | { ok: false; refusal: Refusal } {
  const same: Carried = { patch, stamp: {}, dropNext: false };
  if (patch.last_seen === undefined || heardHere(current)) return { ok: true, value: same };
  const { last_seen: said, ...rest } = patch;
  /* A `null` CLEARS NOTHING HERE: there is no carried time to clear on a run that was never heard from, so the field is
     taken out and the write goes on as if it had not named it. */
  if (said === null) return { ok: true, value: { ...same, patch: rest } };
  const read = coerce({ id: 'last_seen', type: 'instant' }, said);
  if (!read.ok) return read;
  const dropNext = stateAfter(patch, current) !== KEEPS_STEP;
  if (dropNext) delete rest.next;
  return { ok: true, value: { patch: rest, stamp: { seen_before: read.value as string }, dropNext } };
}
