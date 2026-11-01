/**
 * DRAWN WIDGETS (widgets plan §3.1, §3.3, §5.7, §8; W7): a `drawn` block on a board, drawn in the frame its size gives
 * it, and the one rule every widget on a board answers to, whether it is still shown (`until`).
 *
 * A DRAWN WIDGET IS A DRAWN BLOCK WITH A SIZE. Nothing new is stored: the board writes `size` as it does for any widget,
 * and the frame the host draws is that size's, fixed, so a board never moves when a component says its height. The
 * component reads `braindog.size` (`drawn.ts`'s bridge) to choose what to draw in it, and is drawn at every size it claims
 * when it is checked.
 *
 * ALIVE OR A PICTURE. At most `DRAWN_ALIVE_MOST` drawn widgets run at once on a board; the rest draw the picture each one
 * last handed back, kept on the device, inert (`drawnPictureDocument`), until they are on screen and the browser is idle.
 *
 * PURE AND ISOMORPHIC, like the catalogue it sits beside.
 */

import { DRAWN_HEIGHT } from './drawn.ts';
import { SIZE_SAID, WIDGET_SIZES, isWidgetSize, type WidgetSize } from './widget-sizes.ts';

/* ── until ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u;

/** A block's last day, when it has one written as a day, else `null`. */
export const untilOf = (block: Readonly<Record<string, unknown>>): string | null => (typeof block.until === 'string' && DAY.test(block.until) ? block.until : null);

/**
 * WHETHER A WIDGET IS STILL DRAWN ON `today` (`YYYY-MM-DD`, the reader's day): one with no `until`, or one whose last day
 * has not passed. A board filters its blocks by this before it lays them out; nothing is deleted, so the block stays in
 * the page's body where an edit can take it off or move its day. The kernel holds the same rule (`until.ts`).
 */
export const stillShown = (block: Readonly<Record<string, unknown>>, today: string): boolean => {
  const until = untilOf(block);
  return until === null || until >= today;
};

/* ── frames per size ─────────────────────────────────────────────────────────────────────────────────────────── */

/** How many drawn widgets run at once on one board; the rest draw their pictures (Call 14). */
export const DRAWN_ALIVE_MOST = 3;

/** One board row and the gap between rows, in CSS pixels, as a board without its own measure draws them. */
export const WIDGET_ROW_PX = 168;
export const WIDGET_GAP_PX = 12;

/**
 * THE HEIGHT OF A DRAWN WIDGET'S FRAME AT A SIZE: its rows of the board, the gaps between them, less the tile's heading,
 * held inside the heights a drawn frame may stand at. A board that measures its rows passes them.
 */
export function drawnFrameHeight(size: WidgetSize, rowPx: number = WIDGET_ROW_PX, gapPx: number = WIDGET_GAP_PX, headPx = 40): number {
  const rows = SIZE_SAID[size].rows;
  const h = rows * rowPx + (rows - 1) * gapPx - headPx;
  return Math.round(Math.min(DRAWN_HEIGHT.most, Math.max(DRAWN_HEIGHT.least, h)));
}

/** The sizes a drawn widget claims, read tolerantly: the board's words, each once, in the board's order. */
export function drawnSizes(v: unknown): WidgetSize[] {
  if (!Array.isArray(v)) return [];
  const said = new Set(v.filter(isWidgetSize));
  return WIDGET_SIZES.filter((s) => said.has(s));
}

/**
 * WHAT A DRAWN WIDGET'S CODE MUST DO TO CLAIM MORE THAN ONE SIZE: read `braindog.size` (or the third thing `on` hands
 * it), so each frame draws what fits it. One size needs nothing. The sentence finishes "This widget cannot be kept
 * because", or `null`.
 */
export function drawnSizesFault(code: string, sizes: readonly WidgetSize[]): string | null {
  if (sizes.length === 0) return 'it claims no size. Pick at least one of the frames it draws in.';
  if (sizes.length === 1) return null;
  const reads = /\bbraindog\s*\.\s*size\b/u.test(code) || /\bon\s*\(\s*function\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+/u.test(code) || /\bon\s*\(\s*\(\s*\w+\s*,\s*\w+\s*,\s*\w+\s*\)\s*=>/u.test(code);
  return reads ? null : `it claims ${sizes.length} sizes but draws the same in each. Read braindog.size and draw what fits each frame, or claim one size.`;
}

/** What each frame is, said to the model: its name, its cells and how tall it stands. */
const framesSaid = (sizes: readonly WidgetSize[]): string =>
  sizes.map((s) => `${s} (${SIZE_SAID[s].cols} by ${SIZE_SAID[s].rows}, ${drawnFrameHeight(s)} px tall)`).join(', ');

/**
 * WHAT THE MODEL IS ASKED FOR "DRAW IT" ON A BOARD (§5.7 step 3): a drawn block sized to the frames it will use, held to
 * the design book's draw rules, reading `braindog.size` to draw what fits each.
 */
export function drawWidgetAsk(line: string, sizes: readonly WidgetSize[]): string {
  const claimed = sizes.length > 0 ? sizes : (['wide'] as const);
  return [
    `Draw a widget for the board, as one drawn block (kind: drawn, with code: HTML, a style tag and a script, as the design book's draw rules say): ${line.trim()}`,
    `It is drawn in a fixed frame at each of these sizes: ${framesSaid(claimed)}. The frame does not grow; draw what fits it and nothing that scrolls.`,
    claimed.length > 1 ? 'Read braindog.size (or the third value braindog.on hands you) and draw less in the smaller frames.' : '',
    'Say something in words when there is nothing to draw.',
    'Draw it in the house look, as the design book\'s look rules say: flat on the tile, no gradient, shadow, glow or pill, corners of 8, red only for what is late, failing or below nought, big figures at 600 and tabular.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}
