/**
 * Whether a bare key belongs to what a person is typing, read off the key and not only off the focus.
 *
 * THE SHELL READ THE FOCUS ALONE (`typing`), so a key whose field had gone from under it was the shell's. Typing in a
 * box that closes or draws again as it is answered, the palette's on its way to a question or a reason box a page takes
 * away once its answer is in, drops the focus on the page while the hands are still on the keys, and the next `?`
 * opened the keys sheet over the question: seen on Needs you, where a question's page opened under the sheet.
 *
 * PURE, so `typed.test.ts` loads it in Node; the shell keeps the time of the last key typed in a field.
 */

/** How long after a key typed in a field a bare key is still taken as typing, and not as a shortcut. */
export const STILL_TYPING_MS = 1_000;

/** Whether a key came from inside something a person types in: a field, a box, a choice or anything editable. */
export function inField(target: unknown): boolean {
  const el = target as { closest?: (s: string) => unknown; isContentEditable?: unknown } | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.isContentEditable === true || el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/** Whether a bare key pressed at `now` is still the typing a key in a field at `typedAt` began, both in event time. */
export const stillTyping = (typedAt: number, now: number): boolean => now >= typedAt && now - typedAt < STILL_TYPING_MS;

/** Whether the shell leaves a bare key alone: it began in a field, it is part of a composition, or typing is still going on. */
export const notTheShells = (e: { target: unknown; isComposing?: boolean; timeStamp: number }, typedAt: number): boolean =>
  e.isComposing === true || inField(e.target) || stillTyping(typedAt, e.timeStamp);
