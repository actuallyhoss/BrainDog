/**
 * What `Panel.svelte` decides, in plain `.ts` so `node --test` can read it without mounting anything.
 *
 * THE PANEL HAS TWO FORMS (SYSTEM §5, §9). From 900px up it is docked at the window's end edge, beside the content,
 * which narrows for it: a non-modal `<dialog>` opened with `show()`, so the list behind it keeps its keyboard and its
 * pointer. Below 900px it is a bottom sheet: the same `<dialog>`, opened with `showModal()`, over the scrim.
 *
 * A PANEL THAT IS OPEN WHEN THE WINDOW CROSSES 900PX CHANGES FORM WITHOUT CLOSING. `step` says what the element has to
 * do to match what was asked, and one of its answers is to reopen in the other form.
 */

/** Below this the panel is a bottom sheet (SYSTEM §9, "Phone (below 900px)"). */
export const NARROW = '(width < 900px)';

export type Form = 'docked' | 'sheet';

export const formOf = (narrow: boolean): Form => (narrow ? 'sheet' : 'docked');

export type Step = 'show' | 'showModal' | 'close' | 'reopen' | null;

/**
 * What the `<dialog>` must do so it is what was asked for.
 *
 * `is.modal` is whether the element is open modally now (`:modal`). A docked panel is open and not modal; a sheet is
 * open and modal. An element open in the wrong one of those is reopened rather than left, because a docked panel on a
 * phone covers the list with no scrim and a modal one on a desktop takes the list's keyboard away.
 */
export function step(want: { open: boolean; form: Form }, is: { open: boolean; modal: boolean }): Step {
  if (!want.open) return is.open ? 'close' : null;
  if (!is.open) return want.form === 'sheet' ? 'showModal' : 'show';
  return is.modal === (want.form === 'sheet') ? null : 'reopen';
}
