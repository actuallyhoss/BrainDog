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
  /**
   * A captured line's receipt: the row by its words, the list it went to, what the line said beside its words ("Due Thu
   * 1 Oct", "Kiln"), and what was filled on the reader's behalf.
   */
  added: (what: string, list: string, read: readonly string[], filled: readonly string[]) =>
    `Added “${what}” to ${list}${read.length > 0 ? ` · ${read.join(' · ')}` : ''}${filled.length > 0 ? `, with ${and(filled)} filled in` : ''}.`,
  /* A PAGE ABOUT ONE ROW SPEAKS FIRST (things, not rows), and the row's own fields are one press under it. */
  showData: 'Show the data',
  /** A block with no heading and a kind with no name, said to a screen reader only: the region's name. */
  unnamed: 'Part of this page',
  /** A long block folded in place: what is under the fold, one press away. */
  more: (n: number) => `${n} more`,
  /** A block of charts folded in place: how many more numbers are under the fold. */
  moreNumbers: (n: number) => (n === 1 ? '1 more number' : `${n} more numbers`),
  /* WHAT A ROW WEARS IN JUST CHANGED after a write the page's own blocks made: a word or two, the list's own words. */
  markDone: 'Done',
  markReopened: 'Reopened',
  markMoved: (to: string) => `Moved to ${to}`,
  markDated: 'New dates',
  markAdded: 'Added',
  /* ANSWERING SEVERAL QUESTIONS AT ONCE: the box each card leads with, said with its question. */
  pick: (question: string) => `Choose “${question}” to answer with others`,
  /* THE PAGE'S LOOK (`look.ts`): a pin that keeps it as it is, and what Slash arranged, offered back and then kept. */
  pin: 'Pin this',
  unpin: 'Unpin',
  pinned: (title: string) => `Pinned ${title}. It stays as it is until you unpin it.`,
  unpinned: (title: string) => `Unpinned ${title}. Slash may arrange it again.`,
  arranged: (title: string) => `Slash arranged ${title}.`,
  slashArranged: 'Slash arranged',
  slashKept: (who: string) => `Slash arranged · ${who} kept`,
  pinnedLine: 'Pinned as it is',
  /** Who kept what Slash arranged, where the record names nobody for the reader. */
  owner: 'the owner',
  /** The next action under the headline, for a screen reader: the line itself says what it is. */
  next: 'Next step',
} as const;

/** "a", "a and b", "a, b and c". */
function and(parts: readonly string[]): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
