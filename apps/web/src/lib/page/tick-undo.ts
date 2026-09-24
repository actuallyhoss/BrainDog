/**
 * The way back from a task ticked on a page: the write its receipt's undo sends.
 *
 * THE UNDO WROTE A STATE THE ROW NEVER HAD. It was `tickPatch(ref, !done)`, and "not done" is the list's default state,
 * so a task in `doing`, `blocked` or `review`, ticked and then undone, came back `open` while the receipt said it had only
 * been marked not done (audit sixty-four, section 3, measured against a kernel in `tick-undo.test.ts`). The board never
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

import { REGISTERS } from '../record/data.ts';
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
