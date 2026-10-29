/**
 * THE FIVE FRAMES A WIDGET TAKES, AND NOTHING ELSE. Kept apart from the catalogue (`widgets.ts`) so Today, which draws a
 * board at its sizes, loads these few lines and not every template the sheet offers: the catalogue's entries are built
 * by calls, which a bundler keeps whole once anything in their file is imported.
 */

/** The five frames a widget can take on a board (§3.2): Small 1x1, Wide 2x1, Tall 1x2, Large 2x2, Full 4x1. */
export const WIDGET_SIZES = ['small', 'wide', 'tall', 'large', 'full'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

/** What each size is called on the screen, and the cells it takes on the laptop's four columns and the phone's two. */
export const SIZE_SAID: Readonly<Record<WidgetSize, { name: string; cols: number; rows: number; phoneCols: number }>> = {
  small: { name: 'Small', cols: 1, rows: 1, phoneCols: 1 },
  wide: { name: 'Wide', cols: 2, rows: 1, phoneCols: 2 },
  tall: { name: 'Tall', cols: 1, rows: 2, phoneCols: 1 },
  large: { name: 'Large', cols: 2, rows: 2, phoneCols: 2 },
  full: { name: 'Full', cols: 4, rows: 1, phoneCols: 2 },
};

/** How many rows a list widget shows at each size (§3.3); a size missing here draws no list. */
export const ROWS_AT: Readonly<Record<WidgetSize, number>> = { small: 1, wide: 3, tall: 6, large: 8, full: 8 };
/** How many figures a figure widget shows at each size. */
export const FIGURES_AT: Readonly<Record<WidgetSize, number>> = { small: 1, wide: 2, tall: 3, large: 4, full: 5 };

/** Whether a word is one of the five sizes. */
export const isWidgetSize = (v: unknown): v is WidgetSize => typeof v === 'string' && (WIDGET_SIZES as readonly string[]).includes(v);
