/**
 * The holding pen's own words (the M4 rule: a unit's new words live in a module it owns, never in `copy.ts`).
 *
 * THE THREE VERBS ARE `pages.md` PGS-16's, the same three every offer in the product carries: "Show it" draws what keeping
 * would draw, "Keep it" writes it, "Not this one" puts it away for good. Nothing here says a thing happened until it did.
 */
export const penWords = {
  show: 'Show it',
  keep: 'Keep it',
  dismiss: 'Not this one',
  putBack: 'Put back',
  keeping: 'Keeping it',
  /** The line under the pen's heading, which says what an offer is before anybody presses anything. */
  hint: 'Each of these is offered, never applied. Show it to see what would change, keep it, or say not this one and it will not be offered again on any device.',
  nothing: 'Nothing waiting',
  nothingWhy: 'When this record has something to suggest, it waits here until you keep it or say no.',
  /** An icon offer's why: the word in the name the glyph was read from. */
  iconWhy: (name: string, word: string) => `${name} has no icon of its own, so the sidebar draws a plain one. This one matches the word "${word}".`,
  iconKept: (name: string) => `${name} has its new icon.`,
  kept: (title: string) => `Kept: ${title}.`,
  putBackDone: (title: string) => `${title} is as it was.`,
  dismissed: (title: string) => `${title} will not be offered again.`,
  /** What the sheet says while the record draws the change, and when there is no page to draw. */
  drawing: 'Drawing what it would look like.',
  noPage: 'Keeping this changes no page, so there is nothing to draw. The row above says what it changes.',
  iconShown: (name: string) => `The icon ${name} would carry in the sidebar and in search.`,
  /** The question an icon for a list is filed as, which the owner answers at once. */
  iconQuestion: (name: string) => `Give ${name} an icon`,
  iconReason: 'Kept from the holding pen.',
  sheetTitle: (title: string) => `What keeping ${title} would look like`,
};
