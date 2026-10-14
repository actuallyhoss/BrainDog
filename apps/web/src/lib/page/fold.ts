/**
 * A LONG NOTE ON A PAGE SHOWS ITS FIRST TWELVE LINES, and "Read all" opens the rest in place (DIRECTION §35.19, "and
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
