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

import { at } from './at.ts';
import { copy } from './copy.ts';
import { toasts } from './ui/toast.svelte.ts';

/**
 * Put `text` on the clipboard and say so. `label` is what the toast quotes; the text by default.
 * `said` overrides the sentence for a surface that has its own — first run says where to paste it.
 */
/**
 * A HANG IS NOT A REJECTION, and this only caught the rejection.
 *
 * Chrome does not reject `writeText` when the document is not focused. It never settles. So the one
 * control that matters for verifying a backup, the public signing key on the export screen, was a
 * silent no-op in exactly that state: no toast, no error, nothing, and a person pressing it twice
 * gets nothing twice. Reproduced repeatedly while driving the deployed build, which is how it was
 * found, because a focused tab never shows it.
 *
 * A DEADLINE AND NOT A LONGER WAIT. The clipboard is a synchronous act from the reader's side; if
 * it has not happened in a second it is not going to, and saying so is the whole job of this
 * module. `Promise.race` rather than an abort, because there is nothing to abort: the write may
 * still land later, and the sentence is about what this product can honestly report.
 */
const DEADLINE = 1_000;

export async function put(text: string, label = text, said?: string): Promise<void> {
  try {
    const wrote = await Promise.race([
      navigator.clipboard.writeText(text).then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), DEADLINE)),
    ]);
    toasts.push(wrote ? (said ?? copy.copied(label)) : copy.copyRefused, wrote ? {} : { intent: 'warn' });
  } catch {
    toasts.push(copy.copyRefused, { intent: 'warn' });
  }
}

/** The spoken id of a row — `obligations#41`. What somebody pastes into a message to a colleague. */
export const putSpoken = (register: string, seq: number): Promise<void> => put(`${register}#${seq}`);

/**
 * The row's address, absolute, so it survives being pasted anywhere.
 *
 * AND UNDER THE SLUG IT WAS COPIED FROM, so it names its record. Pasted to a colleague, the old link opened whichever
 * record THEIR session was on, which was the right row number in the wrong business.
 */
export const putLink = (register: string, seq: number): Promise<void> =>
  put(`${location.origin}${at(`/r/${register}/${seq}`)}`);

/** A place in the app by its address, absolute and under this record's slug, as `putLink` copies a row's. */
export const putHref = (href: string): Promise<void> => put(`${location.origin}${at(href)}`);
