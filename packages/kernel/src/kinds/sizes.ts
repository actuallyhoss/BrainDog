/**
 * WHAT EACH KIND DRAWS AT EACH WIDGET SIZE, the kernel's copy of the renderer's table (`braindog-render` `KIND_SIZES`,
 * the widgets plan of 29 October §3.3). A LEAF: the kernel does not import the renderer, and `declare.ts` and
 * `pages.ts` read this while the kinds' registry is still loading. `test/widget-sizes.test.ts` holds the two equal.
 *
 * The install refuses a size the kind cannot take, in a sentence naming the sizes it can; the read cuts a block's rows
 * to what its size shows and one more, so "N more" is known, where the kind draws its rows as read (`cap`).
 */

export const WIDGET_SIZES = ['small', 'wide', 'tall', 'large', 'full'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

type KindSizes = { shows: Partial<Record<WidgetSize, number>>; cap?: true };

const LIST: KindSizes = { shows: { small: 1, wide: 2, tall: 4, large: 5, full: 2 }, cap: true };
const FIGURE: KindSizes = { shows: { small: 1, wide: 2, tall: 4, large: 5, full: 6 } };
const CHART: KindSizes = { shows: { wide: 1, large: 1, full: 1 } };

export const KIND_SIZES: Readonly<Record<string, KindSizes>> = {
  note: { shows: { small: 1, wide: 1, tall: 1, large: 1, full: 1 } },
  stat: { shows: { small: 1, wide: 3, tall: 3, large: 3, full: 5 } },
  kpis: { shows: { small: 1, wide: 2, tall: 3, large: 4, full: 4 } },
  ring: FIGURE,
  progress: FIGURE,
  gauge: FIGURE,
  bar: FIGURE,
  split: FIGURE,
  sparkline: CHART,
  series: CHART,
  lines: CHART,
  forecast: CHART,
  todo: LIST,
  timeline: LIST,
  table: LIST,
  spec: LIST,
  steps: LIST,
  link: LIST,
  queue: { shows: { small: 1, wide: 1, tall: 2, large: 2, full: 1 } },
  cards: { shows: { wide: 2, tall: 5, large: 4, full: 4 } },
  calendar: { shows: { small: 1, wide: 7, large: 31, full: 84 } },
  heat: { shows: { small: 1, wide: 7, large: 31, full: 84 } },
  feed: { shows: { wide: 2, tall: 4, large: 5, full: 2 } },
  agents: { shows: { wide: 2, tall: 4, large: 5, full: 2 } },
  drawn: { shows: { small: 1, wide: 1, tall: 1, large: 1, full: 1 } },
  gallery: { shows: { wide: 2, large: 4, full: 4 } },
  lanes: { shows: { wide: 2, large: 5, full: 3 } },
  board: { shows: { large: 5, full: 2 } },
  roadmap: { shows: { large: 5, full: 2 } },
};

/** A kind with no row of its own: a wide, large or full frame, as a page block draws. */
export const ANY_SIZES: KindSizes = { shows: { wide: 2, large: 5, full: 2 } };

const rowOf = (kind: string): KindSizes => (Object.hasOwn(KIND_SIZES, kind) ? KIND_SIZES[kind]! : ANY_SIZES);

/** The sizes a kind takes, smallest first. */
export const sizesOf = (kind: string): WidgetSize[] => WIDGET_SIZES.filter((s) => rowOf(kind).shows[s] !== undefined);

export const isWidgetSize = (s: unknown): s is WidgetSize => typeof s === 'string' && (WIDGET_SIZES as readonly string[]).includes(s);

/**
 * The most rows a block of `kind` at `size` reads: what the size shows and one more, so the block knows there are more.
 * `null` where the kind is not cut (its rows are chosen from the whole read) or the size is not one it takes.
 */
export const sizeRead = (kind: string, size: unknown): number | null => {
  if (!isWidgetSize(size)) return null;
  const row = rowOf(kind);
  const shows = row.shows[size];
  return row.cap === true && shows !== undefined ? shows + 1 : null;
};
