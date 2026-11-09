/** What the hover over a mark or a face says, and its button's name. Plain, and said only here. */
export const CHANGE_WORDS = {
  /** The hover's word, under the camera on a large mark. */
  change: 'Change',
  /** The button's name, with the row's. */
  changeOf: (name: string): string => (name.trim() === '' ? 'Change the picture' : `Change the picture of ${name}`),
  /** The same where its list keeps a glyph and no picture yet. */
  markOf: (name: string): string => (name.trim() === '' ? 'Change the mark' : `Change the mark of ${name}`),
  /** Said where the changer, loaded the first time it is asked for, could not be. */
  unloaded: 'The changer could not be loaded. Try again.',
} as const;
