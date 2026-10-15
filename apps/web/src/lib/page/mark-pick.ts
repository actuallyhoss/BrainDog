/**
 * A row's mark, picked where the row is shown (PGS-A06's last step): pure, so the reading is tested without a
 * component, and `RowPanel.svelte` draws the mark as a button over it.
 *
 * THE MARK FIELD IS THE LIST'S OWN, its declared `identity.mark`, read from the same declarations `readableFields`
 * reads. That function keeps hiding the field from every form, because the identity is drawn, not typed: this is the
 * one place it is picked, as a picture, and nothing is added to `record/api.ts`, which every screen loads.
 *
 * ONLY A PICTURE THE HOST DRAWS, AND NO BUTTON. A name is held to the renderer's own test of a mark, `isMark`, which
 * the glyph picker's names come from too (`glyph-pick.ts`): it names a glyph the set draws, as written or through an
 * alias, and that glyph is none of the frame's controls. The kernel refuses a control as a mark on write as well; this
 * refuses it before anything is sent, so a pick that would be refused never leaves the panel.
 *
 * ONE FIELD, ONCE. The patch holds the mark's field and nothing else, so every other field on the form stays as typed.
 * Clearing writes `null`, and the row wears the first letter of its own name again.
 */

import { isMark } from 'braindog-render/glyphs/names';
import { REGISTERS } from '../record/held.ts';

/** The words the mark's button and its picker say. */
export const MARK_WORDS = {
  change: 'Change the mark',
  heading: 'Pick a picture',
  clear: 'No picture',
  close: 'Done',
  refused: 'Pick a picture that is not a button.',
  unloaded: 'The pictures could not be loaded. Try again.',
  /** The receipt a pick leaves, which carries its Undo. */
  said: (title: string): string => `Changed the mark of “${title}”.`,
  cleared: (title: string): string => `Took the picture off “${title}”.`,
} as const;

/** The field a list's rows keep their mark in, the declared `identity.mark`, or `null` where the list declares none. */
export function markFieldOf(register: string): string | null {
  const field = REGISTERS[register]?.identity?.mark;
  return typeof field === 'string' && field !== '' ? field : null;
}

/** Whether `glyph` may be a row's mark: a picture the host draws, never one of the frame's controls. */
export const mayBeMark = (glyph: string): boolean => isMark(glyph);

/**
 * The one write a pick makes: the mark's field set to `glyph`, or to `null` to clear it. `null` where the list declares
 * no mark, or where `glyph` names nothing the host draws as a mark.
 */
export function markPatch(register: string, glyph: string | null): Record<string, string | null> | null {
  const field = markFieldOf(register);
  if (field === null) return null;
  if (glyph === null) return { [field]: null };
  const name = glyph.trim();
  if (name === '' || !mayBeMark(name)) return null;
  return { [field]: name };
}
