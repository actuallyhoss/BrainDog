/**
 * WHAT WAITS AND WHO IS WORKING, AS THE NEWEST `boot` SAID IT, for every screen that says either: the rail's badge and
 * its working row, Today's header and Decide's sentence.
 *
 * ONE ANSWER, HELD FOR THE TAB. The root layout writes it from the shell it was handed, and again from the poll's
 * re-read of `boot` whenever the record's version moves (`rereadBoot`), so no screen counts what waits a second way.
 *
 * LESS WHAT WAS JUST PRESSED (`answers-pending.ts`). An answer is held six seconds for its Undo before it is sent, so
 * `boot` alone lowered the count six seconds and a poll late: the card takes its question off here on the press, puts it
 * back on Undo or a refusal, and a `boot` read after the write lets it go.
 *
 * `null` UNTIL A RECORD THAT SENDS `waits` HAS ANSWERED: a screen then says what it said before, from its own reads.
 */

import { untrack } from 'svelte';
import type { Waits, Working } from '../record/boot-live.ts';
import { apiBase } from '../at.ts';
import { outWaiting } from '../record/answers-out.ts';
import { heard, lessPending, pressed, takenBack, written, type Pending } from './answers-pending.ts';

const state = $state<{ waits: Waits | null; working: readonly Working[] }>({ waits: null, working: [] });
/* WHAT THE LAST PAGE PRESSED AND NEVER HEARD BACK ABOUT (`answers-out.ts`). The `boot` this page opened with may or may not
   count it, since its write and that read raced, and it cannot say which. So until each is settled the count is never over
   what `boot` said when it was pressed less what is outstanding, and never under what `boot` says now. */
const left = typeof location === 'undefined' ? [] : outWaiting(apiBase());
const carried = new Set(left.map((o) => o.id));
const carriedTop = Math.max(-1, ...left.map((o) => o.n ?? -1));
/* `raw`: each change is a new Map, so the screens that read it follow it. */
let pending = $state.raw<Pending>(new Map(left.map((o) => [o.id, null] as const)));
/* THE TICKET OF THE NEWEST WRITE, counted up once a write lands. Plain, since nothing draws it. */
let tickets = 0;

/** What waits on the reader now, less what was just pressed, or `null` where no record said. Reactive where it is read. */
export const waitsNow = (): Waits | null => (state.waits === null ? null : { ...state.waits, questions: carriedCount(state.waits.questions) ?? lessPending(state.waits.questions, pending) });

/** The count while something the last page pressed is still outstanding (`carried`), or `null` when nothing is. */
function carriedCount(said: number): number | null {
  const before = [...pending.keys()].filter((id) => carried.has(id)).length;
  if (before === 0 || carriedTop < 0) return null;
  return Math.max(0, Math.min(said, carriedTop - before) - (pending.size - before));
}

/** How many `boot` last said wait, with nothing taken off: what a press writes down beside itself. */
export const waitsSaid = (): number | undefined => state.waits?.questions;

/** The agents working now, as the newest `boot` said it. Reactive where it is read. */
export const workingNow = (): readonly Working[] => state.working;

/** The ticket a `boot` read takes before it asks, so what it hears lets go only the writes that landed before it. */
export const waitsTicket = (): number => tickets;

/**
 * Hear a `boot`'s answer: what waits and who is working, as the shell or the poll read them. `asked` is the ticket taken
 * when the read began; the shell's own, handed over without one, is as new as the newest write.
 */
export function heardWaits(from: { waits: Waits | null; working: readonly Working[] }, asked: number = tickets): void {
  state.waits = from.waits;
  state.working = from.working;
  /* UNTRACKED: the layout hears the shell in an effect, which must not run again on every press. */
  untrack(() => (pending = heard(pending, asked)));
}

/** A question answered on a card: one less waits, now, while it is held for its Undo. */
export function answerPressed(id: string): void {
  pending = pressed(pending, id);
}

/** Undo, or the record refused the answer: the question waits again. */
export function answerTakenBack(id: string): void {
  pending = takenBack(pending, id);
}

/** The record wrote the answer: the next `boot` read from now on counts it gone itself. */
export function answerWritten(id: string): void {
  pending = written(pending, id, ++tickets);
}
