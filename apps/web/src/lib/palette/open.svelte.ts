/**
 * Whether the palette is open, held where a page can reach it.
 *
 * IT WAS LOCAL TO THE SHELL, and that is why a button labelled *Search* went Home. `/[id]`, the
 * screen you land on after typing an id that resolves to nothing, offered two controls: `Search`
 * with a magnifying glass and `Home`, and both navigated to `/`. Two controls, one behaviour, one of
 * them named for something else, on the screen whose entire purpose is "you were looking for
 * something and it is not here".
 *
 * ONE BOOLEAN, NOT AN EVENT. A `CustomEvent` on `window` would work and would put the shell's state
 * in a place nothing can typecheck; a rune in a module is the same state the shell already had, with
 * one more reader.
 */
export const palette = $state({ open: false, seed: '', mode: 'find' as 'find' | 'ask', thread: null as string | null, question: '' });

/** Open it. The one verb a page needs, so no page has to know how the shell holds it. */
export function openPalette(): void {
  palette.mode = 'find';
  palette.open = true;
}

/**
 * Open it straight into Ask (⌘J): the conversation with Slash, where it was left. Pressed with the palette already open,
 * it moves the palette to Ask.
 */
export function openAsk(): void {
  palette.mode = 'ask';
  palette.open = true;
}

/** Open Ask with a question already asked: the Slash page's own field (T24), so the first question is one step. */
export function askNow(question: string): void {
  palette.question = question.trim();
  palette.thread = null;
  openAsk();
}

/** Open Ask on one thread, read back from the record, to continue it (the Slash page's list). */
export function openThread(id: string): void {
  palette.thread = id;
  openAsk();
}

/**
 * Open it with words already in its field: what somebody typed into Today's ask bar, so the search, the "Add to" line
 * and Slash's question are all answered for it without typing it twice.
 */
export function openPaletteWith(seed: string): void {
  palette.seed = seed;
  palette.mode = 'find';
  palette.open = true;
}
