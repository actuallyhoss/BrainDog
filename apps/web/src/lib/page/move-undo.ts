/**
 * The way back from a card moved on a board: the write its receipt's undo sends.
 *
 * THE BOARD PUT THE COLUMN BACK AND NOT THE DAY. Its undo was `movePatch(ref, field, from)`, which is right about the
 * state and wrong about the finished day: the record fills or empties that day in the same write as a move into or out
 * of `done` (the kernel's `finished.ts`), and a move back into `done` that names no day is dated today. Measured against
 * a kernel on 24 September (audit sixty-five, section 2, probe B1): a task done on 1 September, moved to `doing` and put
 * back, was sent `{"state":"done"}` and read `done on 2026-09-24`. `tick-undo.ts` said the board "never had this fault";
 * that was true of the state only.
 *
 * `inverseOf` IS THE RULE, used and not copied, as `tickBackOf` uses it: each field the move wrote, set to what the row
 * held, and the finished day with it when the field moved was the state. A board drawn over a field that is not the
 * state puts back that field alone, because a move that left the state alone left the day alone too.
 *
 * LOADED ON THE PRESS, as `tick-undo.ts` is, because `rows-write.ts` is a route-only module.
 */

import type { RowRef } from 'braindog-render';

import { REGISTERS } from '../record/data.ts';
import { movePatch, type Declared } from '../record/page-write.ts';
import { inverseOf } from '../record/rows-write.ts';
import type { Entry } from '../record/schema.ts';

/**
 * The patch that undoes moving `ref` from the column `from` to `to` over `field`, given `held`, the row as the page drew it
 * when the card was dropped.
 *
 * `held` IS ABSENT for a card the page is holding in place after a re-read left it out (`keepInPlace`). Nothing on the
 * page then says what the row held beyond the column the card was drawn in, so the put back is that column alone, which
 * is what every move sent before this. `from` is in the screen's spelling, as `movePatch` takes it.
 *
 * `decl` IS THE RECORD'S DECLARATION as `schemaOf` read it, whole, so it names the finished day although `Declared` does
 * not type it (`tickBackOf` says the same). The built-in declaration stands in only when the record answered none.
 */
export function moveBackOf(ref: RowRef, field: string, to: string, from: string, decl: Declared | null, held: Entry | undefined): Record<string, unknown> | null {
  if (!held) return from ? movePatch(ref, field, from, decl) : null;
  const named: { state?: unknown; finished?: unknown } | undefined = decl ?? REGISTERS[ref.register];
  return inverseOf(held, movePatch(ref, field, to, decl) as Entry['fields'], {
    ...(typeof named?.state === 'string' ? { state: named.state } : {}),
    ...(typeof named?.finished === 'string' ? { finished: named.finished } : {}),
  });
}
