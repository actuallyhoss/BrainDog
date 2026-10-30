/**
 * A TILE AS TALL AS WHAT IT HOLDS, ON A LAPTOP AT REST (first-hour audit E6, 31 October). Today's Needs you on a new
 * BrainDog was a large frame, about 380px, holding only "Nothing needs you" with its heading in the middle, beside Orders
 * due this week as large again with one order in it. The phone's rows already close up under what is drawn
 * (`Board.svelte`, A16); the laptop's grid keeps fixed cells, so a frame two rows tall is laid one row tall while what it
 * holds fits one row: a large as a wide, a tall as a small (or a wide, for a kind with no small).
 *
 * ONLY WHERE THE COUNT IS KNOWN: a list's rows, a queue's questions, the late lines, the runs at work. A figure, a chart
 * or anything else keeps the size it was given. Editing, every widget is laid at its own size, so a resize is seen as it
 * is chosen; the record keeps the size chosen, and this is how it is drawn, never what is written.
 *
 * PURE, AND NODE LOADS IT.
 */

import { sizesOf, type WidgetSize } from 'braindog-render';

/** How many rows a frame one row tall shows whole: a wide, and a small. */
export const ONE_ROW_HOLDS: Readonly<Partial<Record<WidgetSize, number>>> = { wide: 2, small: 1 };

/** The size a widget of `kind` is laid at, at rest, holding `rows` rows (`null` where they are not counted). */
export function restSize(kind: string, size: WidgetSize, rows: number | null): WidgetSize {
  if (rows === null) return size;
  const can = sizesOf(kind);
  /* A TALL GOES SMALL, or wide where its kind has no small (People's faces are cards): the same room, one row tall. */
  const tries: WidgetSize[] = size === 'large' ? ['wide'] : size === 'tall' ? ['small', 'wide'] : [];
  const to = tries.find((s) => can.includes(s));
  if (to === undefined) return size;
  return rows <= (ONE_ROW_HOLDS[to] ?? 0) ? to : size;
}

/** The lists a drawn block carries its rows in. */
const ROWS = ['rows', 'queue', 'feed', 'cards', 'items'] as const;
/** The kinds whose rows are what they show. */
const LISTED = new Set(['list', 'table', 'todo', 'queue', 'feed', 'cards', 'timeline']);

/**
 * How many rows a block as Home draws it holds, or `null` where that is not what it shows: the late lines and the runs
 * at work of the desk's own tiles, else a list's rows (the most it matched, where it says, so a list cut to its frame is
 * not taken for a short one).
 */
export function rowsOf(b: { kind?: unknown; desk?: { kind: string; lines?: readonly unknown[]; rows?: readonly unknown[] } | undefined } & Record<string, unknown>): number | null {
  const desk = b.desk;
  if (desk !== undefined) {
    if (desk.kind === 'late') return desk.lines?.length ?? null;
    if (desk.kind === 'working') return desk.rows?.length ?? null;
    return null;
  }
  if (typeof b.kind !== 'string' || !LISTED.has(b.kind)) return null;
  const held = ROWS.map((k) => b[k]).find((v): v is unknown[] => Array.isArray(v));
  if (held === undefined) return null;
  const said = [b.matched, b.total, b.counted].filter((n): n is number => typeof n === 'number');
  return Math.max(held.length, ...said);
}
