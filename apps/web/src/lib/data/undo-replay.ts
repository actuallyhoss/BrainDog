/**
 * ⌘Z once the toasts are gone: the newest change this tab made, put back by the record, one a press.
 *
 * LOADED ONLY BY `import()` FROM THE KEY HANDLER (`+layout.svelte`), so the record's undo client is in no screen's entry
 * chunk; the stack it reads (`undo.ts`) is the tiny part every writing screen loads.
 *
 * THE NEWEST OFFER ON A TOAST GOES FIRST, since its toast is still saying it; that press spends its batch from `history`
 * (`optimist`), and while any toast still offers an Undo no batch is popped, so a batch whose toast is up is never put
 * back from here too. Otherwise the newest batch held is popped and the record asked to put it back (`undoChange`). What it
 * says is the record's own sentence: "Put back 2 changes." when it did, and its fix in the warn tone when it would not,
 * a member's token asking for a batch undo among them. Either way the press moves on, so the next one reaches the change
 * before it. A plan that moved as it was put back is held again, since nothing was put back and the record says to undo
 * it once more. A record that did not answer put nothing back, so the change is held again too.
 *
 * Undo only reverses this tab's own changes, one press at a time, and never deletes history: the record writes the put
 * back as a change of its own.
 */

import { apiBase } from '../at.ts';
import { copy } from '../copy.ts';
import { undoChange } from '../record/undo-write.ts';
import { toasts } from '../ui/toast.svelte.ts';
import { reread } from './live.svelte.ts';
import { history } from './undo.ts';

/** Puts back the newest change still held. False when there was none, so the caller says "Nothing to undo." */
export async function undoNewest(): Promise<boolean> {
  if (toasts.undoLast()) return true;
  /* POPPED BEFORE THE AWAIT, so a second press while the first is out reaches the change before it, never the same one. */
  const held = history.pop();
  if (held === null) return false;
  /* AN ANSWER STILL WAITING OUT ITS SIX SECONDS HAS NOTHING AT THE RECORD TO PUT BACK: its card takes it back, as its Undo does. */
  if (held.local) {
    held.local();
    return true;
  }
  /* THE CLIENT NEVER THROWS FOR A DEAD NETWORK: it answers `UNREACHABLE`, which `undoChange` hands on as a refusal like
     any other. So the socket is watched here, and a record that never answered keeps the change held. */
  let unreached = false;
  const io: typeof fetch = async (...args) => {
    try {
      const res = await fetch(...args);
      if (res.status === 502 || res.status === 503 || res.status === 504) unreached = true;
      return res;
    } catch (e) {
      unreached = true;
      throw e;
    }
  };
  let out;
  try {
    out = await undoChange(apiBase(), held.batch, io);
  } catch {
    history.push(held);
    toasts.push(copy.recordNotReached, { intent: 'warn' });
    return true;
  }
  if (out.from === 'undone') {
    await reread();
    toasts.push(out.said, { intent: 'good' });
    return true;
  }
  if (out.from === 'conflict' || unreached) history.push(held);
  toasts.push(out.fix, { intent: 'warn' });
  return true;
}
