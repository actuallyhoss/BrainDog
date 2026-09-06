/**
 * Whether the palette is open, held where a page can reach it.
 *
 * IT WAS LOCAL TO THE SHELL, and that is why a button labelled *Search* went Home. `/[id]` — the
 * screen you land on after typing an id that resolves to nothing — offered two controls, `Search`
 * with a magnifying glass and `Home`, and both navigated to `/`. Two controls, one behaviour, one of
 * them named for something else, on the screen whose entire purpose is "you were looking for
 * something and it is not here".
 *
 * ONE BOOLEAN, NOT AN EVENT. A `CustomEvent` on `window` would work and would put the shell's state
 * in a place nothing can typecheck; a rune in a module is the same state the shell already had, with
 * one more reader.
 */
export const palette = $state({ open: false });

/** Open it. The one verb a page needs, so no page has to know how the shell holds it. */
export function openPalette(): void {
  palette.open = true;
}
