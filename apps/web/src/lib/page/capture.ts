/**
 * What a page's `capture` writes when somebody presses Add: one row, in the block's list, titled with the line.
 *
 * THE REGISTER GRID'S LINE AND NOT A SECOND ONE. `/r/[register]` has had a one-line add since before the block
 * existed, and `capturedFields` is where it decides what a typed line becomes: the title, each value the filter pins,
 * and each required field nothing pinned at its emptiest value, every one of those said back to the person. A capture
 * on a page is the same line under the same filter, so it goes through the same function. Writing only the title and
 * the fills was the obvious shape and it is refused on the list a person opens most: obligations require four fields
 * beyond the title, which is the defect `capturedFields` was written to answer.
 *
 * THE FILLS ARRIVE AS STORED VALUES (`backlog`, not `Later`), which the kernel and `inheritedFrom` both answer with,
 * and they are handed back to `capturedFields` as the `is` filters they came from. `declaredValue` maps a stored
 * value to itself, so nothing is respelled on the way through; an enum value the list does not declare is dropped
 * there, as it is on the grid, rather than written.
 */

import { REGISTERS } from '../record/api.ts';
import { capturedFields, type Captured } from '../record/rows-write.ts';
import type { Filter } from '../record/schema.ts';

/**
 * The row a line typed into a capture over `register` becomes, or null where this build cannot write one.
 *
 * NULL FOR A LIST WITH NO DECLARATION HERE, because the declaration is what names the title field, and a row with
 * the line in no field is not the row somebody typed. The page reads the same answer to decide whether to hand the
 * capture a write at all, so a list it cannot write draws its one line naming the list instead of a field that
 * swallows what is typed.
 */
export function captureRow(register: string, text: string, inherited: Readonly<Record<string, string>>, now: number): Captured | null {
  if (!REGISTERS[register]?.title) return null;
  const filters: Filter[] = Object.entries(inherited).map(([field, value]) => ({ field, op: 'is', values: [value] }));
  return capturedFields(register, text, filters, now);
}
