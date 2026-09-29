/**
 * The way back from a task ticked on a page: the write its receipt's undo sends.
 *
 * THE UNDO WROTE A STATE THE ROW NEVER HAD. It was `tickPatch(ref, !done)`, and "not done" is the list's default state,
 * so a task in `doing`, `blocked` or `review`, ticked and then undone, came back `open` while the receipt said it had only
 * been marked not done (measured against a kernel in `tick-undo.test.ts`). The board never
 * had this fault, because its undo writes the column the card came from. This is the same idea for a tick: the values
 * the row held, which is the row page's `putBackOf` rule.
 *
 * `inverseOf` IS THAT RULE WITH THE FINISHED DAY ADDED, and it is used rather than copied. A tick moves the state, and the
 * record fills or empties the finished day in the same write (the kernel's `finished.ts`), so a done task un-ticked and
 * put back by the state alone came back finished today, not on the day it was finished. Measured: done on 1 September,
 * un-ticked and undone on the 24th, it read `2026-09-24`.
 *
 * LOADED WITH THE WRITE, not with the page, as `capture.ts` is, because `rows-write.ts` is a route-only module.
 */

import type { RowRef } from 'braindog-render';

import { REGISTERS } from '../record/held.ts';
import { tickPatch, type Declared } from '../record/page-write.ts';
import { inverseOf } from '../record/rows-write.ts';
import type { Entry } from '../record/schema.ts';

/**
 * The patch that undoes ticking `ref` to `done`, given `held`, the row as the page drew it when the tick was pressed.
 *
 * `held` IS THE BLOCK'S OWN ENTRY for the row, at the version the tick was sent at. It is absent when the row is on the
 * page only because an earlier write is holding it in place (`keepInPlace`), and the re-read no longer carries it. Then
 * nothing on the page says what the row held, and the undo falls back to the list's default not-done state, which is
 * what every tick did before this.
 *
 * `decl` IS THE RECORD'S DECLARATION as `schemaOf` read it, and it names the finished day although `Declared` does not
 * type it: `schemaOf` hands back the record's whole answer. The built-in declaration stands in only when there is none,
 * as it does in `tickPatch`.
 */
export function tickBackOf(ref: RowRef, done: boolean, decl: Declared | null, held: Entry | undefined): Record<string, unknown> | null {
  const tick = tickPatch(ref, done, decl);
  if (!tick) return null;
  if (!held) return tickPatch(ref, !done, decl);
  const state = decl ? decl.state : REGISTERS[ref.register]?.state;
  const finished = decl ? (decl as { finished?: unknown }).finished : REGISTERS[ref.register]?.finished;
  return inverseOf(held, tick as Entry['fields'], {
    ...(typeof state === 'string' ? { state } : {}),
    ...(typeof finished === 'string' ? { finished } : {}),
  });
}

/* ── a stone on a path ───────────────────────────────────────────────────── */

/** What a list of steps declares: the `ref` field naming the row each step belongs to, the `bool` that marks it done, and the field they sort by. */
export type Steps = { of: string; done: string; order?: string };

/**
 * A list's `steps: { of, done, order }` as the record declares it, or `null` for a list that declares no steps.
 *
 * READ OFF THE RECORD'S WHOLE ANSWER, as the finished day is above: `Declared` types only the state, and `schemaOf` hands
 * back the list's full declaration, `steps` with it. There is no built-in stand-in, because no list this build declares
 * is a list of steps; a path is only ever over a list somebody declared one.
 */
export function stepsOf(decl: Declared | null): Steps | null {
  const steps = decl ? (decl as { steps?: unknown }).steps : undefined;
  if (steps === null || typeof steps !== 'object') return null;
  const { of, done, order } = steps as { of?: unknown; done?: unknown; order?: unknown };
  if (typeof of !== 'string' || typeof done !== 'string') return null;
  return { of, done, ...(typeof order === 'string' ? { order } : {}) };
}

/**
 * The patch that marks a path's stone done or not done, or `null` when its list declares no steps to mark.
 *
 * THE LIST'S `done` FIELD AND NOTHING ELSE, because that one `bool` is what the record reads a path's marks from
 * (`done_now` in the kernel's `pages.ts`). A stone is not a task: its list may have no state at all, and `tickPatch`
 * would answer null for it, or move a state the path never reads.
 */
export function stonePatch(done: boolean, decl: Declared | null): Record<string, unknown> | null {
  const steps = stepsOf(decl);
  return steps ? { [steps.done]: done } : null;
}

/**
 * The patch that undoes pressing a stone to `done`, given `held`, the step as the page drew it when it was pressed.
 *
 * WHAT THE STEP HELD, as a tick's undo sends: a step nobody had ticked holds no value at all, and putting it back writes
 * that nothing rather than `false`, so the undo leaves the row as it found it. With no `held`, which is a step the
 * re-read no longer carries, the opposite mark is the only fact left to send, as `tickBackOf` falls back to.
 */
export function stoneBackOf(done: boolean, decl: Declared | null, held: Entry | undefined): Record<string, unknown> | null {
  const patch = stonePatch(done, decl);
  if (!patch) return null;
  return held ? inverseOf(held, patch as Entry['fields'], undefined) : stonePatch(!done, decl);
}
