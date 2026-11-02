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

/**
 * AND HOW MANY OF THE DESK'S OWN LINES (what is late, who is working) ONE ROW SHOWS WHOLE: one. Theirs are tall lines, a
 * face, a name, what it is doing and what it holds, as Home's `DESK_LAPTOP` says in cutting them to one in a one-row frame.
 */
export const DESK_ONE_ROW_HOLDS: Readonly<Partial<Record<WidgetSize, number>>> = { wide: 1, small: 1 };

/** Whether a block as Home draws it is one of the desk's own tiles, whose lines are tall (`DESK_ONE_ROW_HOLDS`). */
export const deskLines = (b: { desk?: { kind: string } | undefined }): boolean => b.desk?.kind === 'late' || b.desk?.kind === 'working';

/**
 * AND HOW MANY ROWS OF A TABLE ONE ROW SHOWS WHOLE: one, since its column names take a line (widgets-empty, 2 Nov). A
 * table from the sheet with no more rows than `TABLE_GROWS_TO` is laid two rows tall where one cannot hold them, so the
 * week's weather shows its three days at Wide.
 */
export const TABLE_ONE_ROW_HOLDS: Readonly<Partial<Record<WidgetSize, number>>> = { wide: 1, small: 1 };
export const TABLE_GROWS_TO = 3;

/** Whether the size laid at rest is two rows tall where the size chosen is one: the frame grew (`grow`). */
export const grewTo = (chosen: WidgetSize, laid: WidgetSize): boolean => TALLER[chosen] === laid || (chosen === 'tall' && laid === 'large');

/** The size two rows tall of the same width: a wide's is a large, a small's a tall. */
const TALLER: Readonly<Partial<Record<WidgetSize, WidgetSize>>> = { wide: 'large', small: 'tall' };

/**
 * The size a widget of `kind` is laid at, at rest, holding `rows` rows (`null` where they are not counted). `holds` is how
 * many of its rows a one-row frame shows whole.
 *
 * `grow`: A ONE-ROW FRAME THAT CANNOT HOLD WHAT IT MUST SHOW IS LAID ACROSS TWO ROWS, for the desk's own tiles, whose every
 * line is a person at work or a thing late (skills pass 3, 2 Nov). Working now chosen wide, with Claude and Codex at
 * work, drew both runs in a card 203px tall inside a frame of one row (185px), its foot padding cut to about 5; the only
 * cure inside the frame hid Codex behind "1 more". Laid across two rows, the frame at rest is as tall as the card and no
 * taller (`Board.svelte`, T5), and the tiles beside it close up under their own.
 */
export function restSize(
  kind: string,
  size: WidgetSize,
  rows: number | null,
  { holds = ONE_ROW_HOLDS, grow = false }: { holds?: Readonly<Partial<Record<WidgetSize, number>>>; grow?: boolean } = {},
): WidgetSize {
  if (rows === null) return size;
  const can = sizesOf(kind);
  const taller = TALLER[size];
  if (grow && taller !== undefined && rows > (holds[size] ?? Infinity) && can.includes(taller)) return taller;
  /* A TALL GOES SMALL, or wide where its kind has no small (People's faces are cards): the same room, one row tall. */
  const tries: WidgetSize[] = size === 'large' ? ['wide'] : size === 'tall' ? ['small', 'wide'] : [];
  const to = tries.find((s) => can.includes(s));
  if (to === undefined) return size;
  return rows <= (holds[to] ?? 0) ? to : size;
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
