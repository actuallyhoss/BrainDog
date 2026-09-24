/**
 * A roadmap bar dropped on a page: the one write it becomes, and the way back its receipt offers.
 *
 * THE DRAWER HANDS THE GESTURE AND THE PAGE HOLDS THE ROW. `Roadmap.svelte` knows which part of a bar was taken and how
 * many whole days it went, and hands a drop that carries `dragPatch` bound to that gesture. It does not know the row as
 * the record keeps it: the cells it drew say `1.5 d` for an effort of 129,600 seconds and `0.33 d` for a third of a day,
 * and a patch worked out from that text would write the rounding back every time a bar was touched. The block's
 * `entries` hold the stored values, so the patch is worked out here, from them, by the one function that does that sum.
 *
 * THE FIELDS ARE THE BLOCK'S COLUMNS, NEVER `by` AND `effort` BY NAME. A roadmap row is `title | due | effort` (`kinds.ts`
 * in the renderer), so whatever the second and third columns name is what a drop writes. Work's tasks call them `by`
 * and `effort`; a pack that keeps a print run's dates as `due` and `days` is dragged by the same code, and nothing here
 * knows which list it is on.
 *
 * ONE DROP IS ONE UPDATE. Dragging an end moves the due day and the effort by the same days, and sent as two writes the
 * window would draw half moved between them, with a conflict waiting for whichever came second. The update goes at the
 * version the row was drawn at, so a row somebody else moved first is a conflict and never a silent overwrite.
 *
 * THE UNDO SENDS WHAT THE ROW HELD, field by field, and only the fields the drop wrote, which is `inverseOf`'s rule in
 * `rows-write.ts`. A field the row did not hold goes back as `null`: the record leaves an unset field out of the row, and
 * skipping it would keep the value the drop put there while the receipt said it had been put back.
 *
 * A ROUTE-ONLY MODULE, loaded when a bar is dropped, as `page-write.ts` is when a card is moved.
 */

import { day, type Row, type RowRef } from 'braindog-render';

import { updateRow, type Fetch, type Updated } from './page-write.ts';
import type { Entry } from './schema.ts';

/** Which part of a bar was dragged: the whole of it, its first day, or its last. */
export type DropMode = 'move' | 'start' | 'end';

/**
 * The drop `Roadmap.svelte` hands a host, by its shape. `braindog-render` does not export the drawer's own type, so it is
 * said here as what it is: the gesture, and `dragPatch` over a row as the record keeps it.
 */
export type Drop = {
  mode: DropMode;
  days: number;
  patch: (row: { by: string; effort?: number | null }) => { by?: string; effort?: number } | null;
};

/** What a roadmap block carries that a drop reads: its columns, and the rows it drew as the record holds them. */
export type RoadmapBlock = { columns: readonly { field: string }[]; entries: readonly Entry[] };

/** The write a drop means: the row's name, the patch, the patch that puts it back, and the receipt's sentence. */
export type Reschedule = { title: string; patch: Record<string, unknown>; back: Record<string, unknown>; said: string };

/** A due day as the record keeps one. Anything else is a row the roadmap skipped, and so one nobody can have dropped. */
const ISO = /^\d{4}-\d{2}-\d{2}$/u;

/** How the receipt says a start moved, which is by how much, because the start is a day the record does not keep. */
const startMoved = (title: string, days: number): string => {
  const n = Math.abs(days);
  const much = n === 1 ? 'a day' : `${n} days`;
  return `${title} now starts ${much} ${days > 0 ? 'later' : 'earlier'}.`;
};

/**
 * The write a drop on `row` means, or `null` when it means none.
 *
 * NULL IS NOT AN ERROR, it is "nothing to write", and the page then writes nothing and raises no receipt, so no undo is
 * spent on a drop that changed nothing. It is null for a row the page drew from text (no `ref`), a row the block no
 * longer holds AT THE VERSION IT WAS DRAWN AT (its values are not the ones the record holds now, and the re-read draws it
 * as it is), a due day that is not a day, an effort that is not seconds, and every drop `dragPatch` itself says no to.
 */
export function reschedule(block: RoadmapBlock, row: Row, drop: Drop): Reschedule | null {
  const ref = row.ref;
  const title = block.columns[0]?.field;
  const due = block.columns[1]?.field;
  const effort = block.columns[2]?.field;
  if (!ref || !due) return null;
  const held = block.entries.find((e) => e.seq === ref.seq && e.version === ref.version);
  if (!held) return null;
  const by = held.fields[due];
  const kept = effort === undefined ? undefined : held.fields[effort];
  if (typeof by !== 'string' || !ISO.test(by)) return null;
  if (kept !== undefined && kept !== null && typeof kept !== 'number') return null;
  const moved = drop.patch({ by, effort: kept ?? null });
  if (!moved) return null;

  const patch: Record<string, unknown> = {};
  if (moved.by !== undefined) patch[due] = moved.by;
  if (moved.effort !== undefined) {
    /* AN EFFORT WITH NO COLUMN TO WRITE IT TO is a drop `dragPatch` only answers for a window, and a list with no effort
       column draws none, so this is a drop on something this block did not draw. */
    if (effort === undefined) return null;
    patch[effort] = moved.effort;
  }
  const back: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) back[key] = held.fields[key] ?? null;

  const name = (title === undefined ? undefined : held.fields[title]) ?? row.cells[0] ?? '';
  const called = typeof name === 'string' && name !== '' ? name : `#${ref.seq}`;
  const said =
    drop.mode === 'move'
      ? `Moved ${called} to ${day(moved.by ?? by)}.`
      : drop.mode === 'end'
        ? `${called} is now due ${day(moved.by ?? by)}.`
        : startMoved(called, drop.days);
  return { title: called, patch, back, said };
}

/**
 * The drop sent: one update at the version the row was drawn at, and, when it landed, the undo that sends `back` at the
 * version the write made. A write that did not land offers no undo, because there is nothing to put back.
 *
 * THE VERSION THE WRITE MADE, NOT THE ONE THE PAGE READ. The page read the row at 3 and the drop made it 4; an undo at 3
 * would be refused as stale by the record, over a row nobody else touched.
 */
export async function rescheduleRow(
  base: string,
  ref: RowRef,
  change: Reschedule,
  io?: Fetch,
): Promise<{ out: Updated; undo: (() => Promise<Updated>) | null }> {
  const out = await updateRow(base, ref, change.patch, change.title, io);
  if (out.from !== 'written') return { out, undo: null };
  const made: RowRef = { ...ref, version: out.version ?? ref.version };
  return { out, undo: () => updateRow(base, made, change.back, change.title, io) };
}
