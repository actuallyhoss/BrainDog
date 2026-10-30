/**
 * FORGET WHAT THIS TAB READ OF A RECORD, WITHOUT LOADING THE READERS TO DO IT.
 *
 * Signing in drops every answer the tab kept (`forget` in `boot-live.ts`), so a move out that is not a full load asks
 * the record again. Sign-in imported `boot-live.ts` for that one call, which put the record's readers (the client, the
 * kernel's shapes, the seed's names) in front of a stranger's first sign-in screen (E14). They hold nothing until they
 * have loaded, so here their `forget` is called only once they have, and until then the one thing kept on the device,
 * the last copy of the shell, is dropped by itself.
 */
import { dropCopy } from './boot-copy.ts';

let reader: (() => void) | null = null;

/** Called by `boot-live.ts` as it loads: from then on its `forget` is what forgetting calls. */
export function forgetWith(forget: () => void): void {
  reader = forget;
}

/** Drop the kept shell and every answer kept beside it; with the readers never loaded, only the copy on this device. */
export function forgetRead(): void {
  if (reader) reader();
  else dropCopy();
}
