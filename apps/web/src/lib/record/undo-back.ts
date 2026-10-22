/**
 * A RECEIPT'S UNDO, PUT BACK BY THE RECORD WHERE IT CAN BE ("always undoable"). A write that landed under
 * a batch is undone by the record from its own log (`undo-write.ts` `undoChange`), which puts back what the write AND
 * the rules it set off did, and leaves alone a field somebody changed since. The screen's own inverse, the opposite
 * patch built from what landed (`data/optimistic.ts`), puts back only the fields the screen knew it wrote, so it is the
 * fallback: for a write that said no batch, and for a record on a build with no server undo.
 *
 * DRAWN AT ONCE EITHER WAY. The inverse's drawing is kept: the Undo draws the row as it was the moment it is pressed,
 * the record is asked, and the drawing is dropped once the screen has read the row back (`reread`), so nothing flickers
 * between the press and the answer. A refusal takes the drawing back and says the record's sentence, as any write does.
 *
 * PURE, with the server call handed in, so `node --test` drives every branch and this file pulls no client into the
 * module that imports it.
 */

import type { Change, Sent } from '../data/optimistic.ts';
import type { Undone } from './undo-write.ts';

/** What a fallback put back says when the screen's inverse brought no line of its own. */
export const backWords = { putBack: 'Put back.' } as const;

/** The way back a receipt offers, as `Change.undo` answers it. */
export type Back = Change<unknown> | (() => void) | null;

/** The batch a landed write says it was made under, or `null`: a row or an answer with `batch` as text. */
export function batchOf(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { batch } = value as { batch?: unknown };
  return typeof batch === 'string' && batch.trim() !== '' ? batch : null;
}

const isUndone = (v: unknown): v is Extract<Undone, { from: 'undone' }> =>
  v !== null && typeof v === 'object' && (v as { from?: unknown }).from === 'undone' && typeof (v as { said?: unknown }).said === 'string';

/**
 * The way back from a write: the record's undo of `batch` first, and `back`, the screen's inverse, when there is no batch
 * or the record has no server undo. `undo` is `undoChange` with its base bound; `reread` reads the screen's rows again
 * after the record put them back, and the inverse's drawing is dropped once it has.
 */
export function serverFirst(batch: string | null, back: Back, undo: (batch: string) => Promise<Undone>, reread?: () => unknown): Back {
  if (batch === null) return back;
  const drawn = back !== null && typeof back === 'object' ? back : null;
  /* WITH NO WAY BACK OF ITS OWN, the screen says the record's sentence: "Put back." would claim what nobody did. */
  const fallback = async (fix: string): Promise<Sent<unknown>> => {
    if (drawn) return drawn.send();
    if (typeof back !== 'function') return { ok: false, fix };
    back();
    return { ok: true, value: null };
  };
  return {
    apply: () => drawn?.apply(),
    revert: () => drawn?.revert(),
    send: async (): Promise<Sent<unknown>> => {
      const out = await undo(batch);
      if (out.from === 'undone') return { ok: true, value: out };
      if (out.from === 'missing') return fallback(out.fix);
      return { ok: false, fix: out.fix };
    },
    settle: (value) => {
      if (!isUndone(value)) return drawn?.settle?.(value);
      /* PUT BACK BY THE RECORD: the screen reads the rows again, and only then lets go of the drawing it made. */
      void Promise.resolve(reread?.()).finally(() => drawn?.revert());
    },
    said: (value) => (isUndone(value) ? value.said : typeof drawn?.said === 'function' ? drawn.said(value) : (drawn?.said ?? backWords.putBack)),
    /* THE RECORD'S UNDO IS NOT UNDONE IN TURN from a receipt; the inverse's own way back still is, on the fallback. */
    undo: (value) => (isUndone(value) ? null : (drawn?.undo?.(value) ?? null)),
  };
}
