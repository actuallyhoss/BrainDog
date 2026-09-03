/**
 * The `Table` primitive's props, in a `.ts` file so a consumer can import them as types.
 *
 * They live here rather than in `Table.svelte` because a type exported from a component's instance
 * script is not on the module's public surface — and the register grid, the declared page and the
 * shared page all need to build these shapes.
 */

import type { Tone } from '../src/index.ts';

export type Column = {
  field: string;
  label: string;
  /**
   * A CSS track. DECLARED, never content-derived: `content-visibility` needs size containment,
   * `subgrid` is nullified by it, so one `--cols` track list on the grid root is what keeps the
   * header and the body in step. The reason the fast path exists is that pages are declared (22 §4).
   */
  width: string;
  /** Quantities, dates and counts end; text and refs start (13 §4.2). */
  align?: 'start' | 'end' | undefined;
  /**
   * Text truncates at the end; an IDENTIFIER truncates in the middle, keeping prefix and suffix;
   * a FIGURE NEVER TRUNCATES, because a truncated figure is not shortened, it is wrong.
   */
  truncate?: 'end' | 'middle' | 'never' | undefined;
};

export type TableRow = {
  /** A stable key, never an index — deep-linking a paged list needs one (19 §5). */
  key: string;
  cells: (string | null)[];
  /** From a column's `tone_when`, or from the row's own state. Reaches the DOM with its glyph. */
  tone?: Tone | undefined;
  href?: string | undefined;
};
