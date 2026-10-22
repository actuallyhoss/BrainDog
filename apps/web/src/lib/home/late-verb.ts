/**
 * THE ONE PRESS THAT FINISHES A LATE LINE'S ROW, in the words its own page leads with ("Mark paid", "Mark done"), or
 * `null` where its list declares no finished state or the reader may not change a row of it. The Late tile draws it
 * (`LateNow.svelte`), and Today keeps the line a press can finish when one thing stands in two lists
 * (`today-brief.ts` `onceEach`).
 */

import { REGISTERS } from '../record/held.ts';
import { finishOf } from '../../routes/r/[register]/[seq]/lead.ts';
import type { HomeLine } from './home-rows.ts';

/** The list a line's row is in, from its handle (`obligations#2`). */
export const listOf = (line: HomeLine): string | null => /^([a-z][a-z0-9_-]*)#[1-9][0-9]*$/u.exec(line.key)?.[1] ?? null;

/** The verb that finishes a line's row, as its own page says it, or `null` where the list has none or the reader may not. */
export function verbOf(line: HomeLine, writes: (list: string) => boolean): string | null {
  const list = listOf(line);
  if (list === null || !writes(list)) return null;
  return finishOf(REGISTERS[list], '')?.said ?? null;
}
