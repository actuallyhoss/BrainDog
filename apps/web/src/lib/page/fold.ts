/**
 * A LONG NOTE ON A PAGE SHOWS ITS FIRST TWELVE LINES, and "Read all" opens the rest in place ("and
 * shows less rather than more"; §36.23, "Reading measure is kept inside a tile, not by starving the page"). An imported
 * document poured down a project page whole, fourteen thousand pixels of it, and everything after it was out of reach.
 *
 * ONLY ON A PAGE AT ITS OWN ADDRESS. The panel is where a block is read whole, a preview is inert, and Home folds its
 * lists its own way (`home.ts`). Only prose: a chart, a list or a table is never cut at a line. The fold is per visit:
 * nothing here is stored, and the page draws it from the lines it measured (`PageBody.svelte`).
 *
 * PURE, so `fold.test.ts` holds the rule.
 */

/** The lines a folded block shows. */
export const FOLD_LINES = 12;

/** The kinds that are running text, and so may be cut at a line. */
const PROSE: ReadonlySet<string> = new Set(['note', 'document']);

/** Whether a block of this kind folds where it is drawn: running text, on a page at its own address. */
export const mayFold = (kind: string, mode: string): boolean => mode === 'page' && PROSE.has(kind);

/**
 * Whether a block is drawn folded: a note or a document of more than twelve lines at its measure, on a page at its own
 * address, never in the panel, a preview or Home. `lines` is what the block draws at the width it has.
 */
export const foldOf = (kind: string, lines: number, mode: string): boolean => mayFold(kind, mode) && lines > FOLD_LINES;

/** The lines a block draws: its prose's height over its line's height, rounded, and nought for one not yet measured. */
export const linesOf = (height: number, line: number): number => (height > 0 && line > 0 ? Math.round(height / line) : 0);

/** The words of the fold's one button, which says what a press does. */
export const foldWords = { open: 'Read all', shut: 'Show less' } as const;

/* ── a long list on a page ─────────────────────────────────────────────────── */

/**
 * A LONG LIST ON A PAGE AT ITS OWN ADDRESS SHOWS ITS FIRST THIRTY ROWS, and "Show 30 more" adds the next thirty where they
 * belong (UI pass, 1 Nov). Money's Ledger drew all 142 lines of three months at once, 12,400px at 1512, and a person
 * reading this month's spending scrolled past last summer to reach the filing-rules line under it. Thirty is two screens
 * of a ledger at a desk; a press is cheaper than that scroll, and the filters and the search narrow it first.
 *
 * NOT FOR A FEW: a list folds only when more than five rows would go under the fold, so "3 more" never stands under thirty.
 */
export const LONG_AT = 30;

/** The rows each press of "Show more" adds. */
export const LONG_STEP = 30;

/** The kinds that are a list of rows. A figure, a chart or a board is one picture and never cut. */
const LISTS: ReadonlySet<string> = new Set(['timeline', 'feed', 'table', 'list', 'todo']);

/** How many of `count` rows a long list draws when `shown` are open, and how many wait under it; `null` where none do. */
export const longFoldOf = (kind: string, count: number, shown: number): { shown: number; more: number } | null =>
  LISTS.has(kind) && count > shown + 5 ? { shown, more: count - shown } : null;

/** The fold's button: the next thirty, or the last few by their number. */
export const longWords = (more: number): string => (more > LONG_STEP ? `Show ${LONG_STEP} more` : `Show the last ${more}`);
