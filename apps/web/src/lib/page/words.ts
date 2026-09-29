/**
 * The page reader's own words: the ones it gained when it was split and made the one drawer of a declared page.
 *
 * HERE AND NOT IN `copy.ts`, by the rule every area keeps: an area's new words sit in its copy file or in a
 * `words` object in a module it owns, so nothing edits the copy aggregate. The
 * page's older words stay where they were, in `lib/copy/pages.ts`, and are read from there.
 *
 * PURE, AND NODE LOADS IT.
 */

export const words = {
  /* A PREVIEW BESIDE THE PAGE IT WOULD REPLACE: the page as it stands, and the page as the change would make it. */
  now: 'Now',
  after: 'After',
  /** What the switch between the two chooses, for a screen reader. */
  compare: 'Which page to show',
  /* THE SOURCE OF A PAGE DRAWN FOR EACH ROW OF A LIST is the one text every such page is drawn from. */
  fromTemplate: 'Every page like this one is drawn from this same text, so a change to it changes all of them.',
  /* A NEW BLOCK SHOWS A LIST. On a page that shows none yet the reader is asked which, rather than handed one. */
  bindTitle: 'Which list to show',
  bindWhy: 'This page shows no list yet. Choose the list it should show.',
  bindNone: 'This record has no list yet, so anything added here would have nothing to show.',
} as const;
