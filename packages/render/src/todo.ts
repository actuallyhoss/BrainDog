/**
 * Which of a `todo` row's cells are the quiet line under its title, decided once for both renderers.
 *
 * ONE PLACE, because the two drawers disagreeing about a blank cell is a difference on every task the
 * product shows: a page's projection pads a two-column todo to the kind's four cells with empty
 * strings, so a drawer that kept a blank would draw an empty line, or a lone dot, under all of them.
 */

/** What sits between the two facts. The same dot a figure in several currencies is written with. */
export const TODO_META_JOIN = ' · ';

/** The third and fourth cells, the blank ones left out, in the order they were written. */
export const todoMeta = (cells: readonly string[]): string[] => cells.slice(2, 4).filter((c) => c.trim() !== '');
