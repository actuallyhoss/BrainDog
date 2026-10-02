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
 *
 * AND THE LINE IS READ FIRST, in Today's light syntax (`lib/work/capture.ts`): "Chase Halden tomorrow !urgent #kiln"
 * is a row called "Chase Halden", due tomorrow, urgent and filed under Kiln, on any list whose declaration has a due
 * day, a priority or a project link. A list with none of them reads the line as its words, so nothing changes there.
 */

import { labelOf } from '../record/api.ts';
import { REGISTERS, TITLES } from '../record/held.ts';
import { capturedFields, type Captured } from '../record/rows-write.ts';
import type { Fields, Filter } from '../record/schema.ts';
import { dayOf, shapeOf } from '../work/board.ts';
import { captureOf, captureSaid, contextOf, freshFields } from '../work/capture.ts';

/** A typed line, read: its words with what was read taken out, the fields what was read writes, and those as words. */
export type ReadLine = { text: string; parsed: Fields; said: string[] };

/**
 * A line typed into a capture over `register`, read against the list's own declaration.
 *
 * THE PROJECTS A `#word` NAMES ARE THE ONES THIS TAB ALREADY KNOWS BY NAME (`TITLES`), which every reader that resolves
 * a ref fills, so the line asks the record nothing. A `#word` naming no project it knows stays in the words, as it does
 * on Today. The title and the state are never taken from the line: the title is its words and the state is the list's
 * or the block's own, so a capture under `state is backlog` still files the row there.
 */
export function readLine(register: string, typed: string, now: number): ReadLine {
  const decl = REGISTERS[register];
  const text = typed.trim();
  if (!decl?.title) return { text, parsed: {}, said: [] };
  const shape = shapeOf(decl);
  const named = shape.project ? (TITLES.get(shape.project.to) ?? new Map<number, string>()) : new Map<number, string>();
  const projects = [...named].filter(([, name]) => name !== '').map(([seq, name]) => ({ seq, name }));
  const ctx = contextOf(shape, dayOf(now), projects);
  const c = captureOf(text, ctx);
  const parsed = freshFields(c, shape, null);
  delete parsed[shape.title];
  if (shape.state) delete parsed[shape.state];
  return { text: c.text, parsed, said: captureSaid(c, ctx) };
}

/**
 * The row a line typed into a capture over `register` becomes, or null where this build cannot write one.
 *
 * NULL FOR A LIST WITH NO DECLARATION HERE, because the declaration is what names the title field, and a row with
 * the line in no field is not the row somebody typed. The page reads the same answer to decide whether to hand the
 * capture a write at all, so a list it cannot write draws its one line naming the list instead of a field that
 * swallows what is typed.
 *
 * `parsed` IS WHAT `readLine` READ OFF THE LINE, and it wins over a value filled on the reader's behalf: a task typed
 * "tomorrow" is due tomorrow, not today, and is not said to have been filled with today.
 */
export function captureRow(register: string, text: string, inherited: Readonly<Record<string, string>>, now: number, parsed: Fields = {}): Captured | null {
  const decl = REGISTERS[register];
  if (!decl?.title) return null;
  const filters: Filter[] = Object.entries(inherited).map(([field, value]) => ({ field, op: 'is', values: [value] }));
  const row = capturedFields(register, text, filters, now);
  const read = Object.keys(parsed);
  if (read.length === 0) return row;
  const said = decl.fields.filter((f) => read.includes(f.id)).map((f) => `${labelOf(f).toLowerCase()} `);
  return { fields: { ...row.fields, ...parsed }, filled: row.filled.filter((f) => !said.some((s) => f.startsWith(s))) };
}
