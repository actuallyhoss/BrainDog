/**
 * What the picture changer says, and the receipts of its writes. Plain, and said only here. The hover over a mark says
 * its few words from `change-words.ts`, apart, so a screen that draws marks carries none of these.
 */
export const PICTURE_WORDS = {
  heading: 'Change the picture',
  drop: 'Drop a picture here, or paste one.',
  choose: 'Choose a picture',
  glyph: 'Pick a glyph instead',
  glyphHeading: 'Pick a glyph',
  noGlyph: 'No glyph',
  remove: 'Remove the picture',
  move: 'Drag to place it. Zoom to fit.',
  zoom: 'Zoom',
  use: 'Use this picture',
  other: 'Choose another',
  back: 'Back',
  sending: 'Saving the picture',
  /** Said when the file is no picture this browser can read. */
  unread: 'That is not a picture BrainDog can read. Try a PNG, JPEG or WebP.',
  /** Said where the glyphs, loaded the first time they are asked for, could not be. */
  glyphsUnloaded: 'The glyphs could not be loaded. Try again.',
  /** Said of an SVG, which the page cannot draw: the same logo as a PNG is. */
  svg: 'An SVG cannot be placed here. Save the logo as a PNG and choose that.',
  /** The receipts, past tense with the row named, each carrying its Undo. */
  changed: (name: string): string => `Changed the picture of “${name}”.`,
  removed: (name: string): string => `Took the picture off “${name}”.`,
  marked: (name: string): string => `Changed the mark of “${name}”.`,
  unmarked: (name: string): string => `Took the glyph off “${name}”.`,
} as const;
