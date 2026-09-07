/**
 * Copying, with the one failure it has reported honestly.
 *
 * `navigator.clipboard` IS ABSENT over plain HTTP, in a sandboxed frame, and in Safari outside a
 * user gesture. A copy button that silently does nothing is worse than no button: the reader pastes
 * whatever was in the clipboard before, into something that matters. So both paths speak, and the
 * sentence says which happened.
 *
 * IT LIVES HERE BECAUSE IT WAS ABOUT TO LIVE IN THREE PLACES. The grid had it twice, the row page
 * had a `Copy id` button with no handler at all, and the fix for that button was either a fourth
 * copy of ten lines or this file.
 */

import { copy } from './copy.ts';
import { toasts } from './ui/toast.svelte.ts';

/**
 * Put `text` on the clipboard and say so. `label` is what the toast quotes; the text by default.
 * `said` overrides the sentence for a surface that has its own — first run says where to paste it.
 */
export async function put(text: string, label = text, said?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toasts.push(said ?? copy.copied(label));
  } catch {
    toasts.push(copy.copyRefused, { intent: 'warn' });
  }
}

/** The spoken id of a row — `obligations#41`. What somebody pastes into a message to a colleague. */
export const putSpoken = (register: string, seq: number): Promise<void> => put(`${register}#${seq}`);

/** The row's address, absolute, so it survives being pasted anywhere. */
export const putLink = (register: string, seq: number): Promise<void> =>
  put(`${location.origin}/r/${register}/${seq}`);
