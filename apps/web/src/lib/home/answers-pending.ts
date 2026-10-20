/**
 * THE COUNT MOVES ON THE PRESS, NOT ON THE POLL. An answer on Needs you is held six seconds for its Undo (`press.ts`
 * `hold`) and only then sent, and the count came from `boot`, read again only once the write had landed and the poll
 * heard the record move: the badge, the tab and the head said one more than the screen showed for six seconds and more.
 *
 * SO A PRESSED ANSWER IS TAKEN OFF AT ONCE, AND PUT BACK BY UNDO OR A REFUSAL. Each one pressed is kept here by its
 * question's id: `null` while it is held, then the ticket of its write once the record took it. A `boot` read that
 * began after that write already counts it gone, so hearing it clears the id; one that began before (or a question still
 * held) keeps it taken off, since `boot` still counts it.
 *
 * PURE, so `answers-pending.test.ts` holds it; `waits.svelte.ts` keeps the one copy the screens read.
 */

/** Each pressed answer by its question's id: `null` while held for its Undo, else the ticket its write landed at. */
export type Pending = ReadonlyMap<string, number | null>;

/** The count with what was pressed taken off, never under nought. */
export const lessPending = (count: number, pending: Pending): number => Math.max(0, count - pending.size);

/** A question pressed: taken off now, held for its Undo. Pressing it twice is one. */
export const pressed = (pending: Pending, id: string): Pending => (pending.has(id) ? pending : new Map([...pending, [id, null]]));

/** Undo, or the record refused it: the question counts again. */
export const takenBack = (pending: Pending, id: string): Pending => {
  if (!pending.has(id)) return pending;
  const next = new Map(pending);
  next.delete(id);
  return next;
};

/** The record wrote it, at this ticket. A question nobody pressed here (another screen's) is not added. */
export const written = (pending: Pending, id: string, ticket: number): Pending => (pending.has(id) ? new Map([...pending, [id, ticket]]) : pending);

/**
 * A `boot` heard, read from `asked` on: every write that landed at or before then is in its count, so its id is let go.
 * One still held, or written after the read began, stays taken off.
 */
export const heard = (pending: Pending, asked: number): Pending => {
  const next = new Map([...pending].filter(([, at]) => at === null || at > asked));
  return next.size === pending.size ? pending : next;
};
