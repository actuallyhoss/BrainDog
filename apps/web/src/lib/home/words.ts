/**
 * Home's own words: the headings of the house Home (`default-home.ts`), its lead line, and the calm sentence a record
 * with lists and nothing in them reads.
 *
 * A `words` OBJECT IN THE MODULE THAT DRAWS THEM, and not keys in `copy.ts` (no unit edits the
 * aggregate). A heading a use case's voice may say its own way is still read through `said()` first; these are the
 * house lines it falls back to.
 */

export const words = {
  /* THE HOUSE HOME'S HEADINGS, in the order the page draws them. */
  rightNow: 'Right now',
  needsYou: 'What needs you',
  workingNow: 'Working now',
  comingUp: 'Coming up',
  overdue: 'Overdue',
  sinceAway: 'Since you were away',

  /* EACH BLOCK'S OWN EMPTY LINE, for the blocks that stay drawn when they hold nothing. */
  nothingWaiting: 'Nothing is waiting on you.',
  nothingDue: 'Nothing falls due in the next two weeks.',
  nothingNew: 'Nothing new since you last looked.',

  /**
   * THE LEAD LINE, BUILT FROM THE PAGE'S OWN COUNTS, and never from a count Home asks for a second time: "3 things need
   * you. Claude is on 2." A half with nothing to count is left out, and a page with neither draws no lead at all.
   */
  needing: (n: number) => (n === 1 ? '1 thing needs you.' : `${n.toLocaleString('en')} things need you.`),
  onIt: (who: string, n: number) => `${who} is on ${n.toLocaleString('en')}.`,
  agentsOn: (n: number) => (n === 1 ? '1 agent is working.' : `${n.toLocaleString('en')} agents are working.`),

  /* A RECORD WITH LISTS AND NOTHING PINNED, WAITING OR DUE: one calm sentence and one line on what fills the page. */
  nothingNow: 'Nothing needs you right now.',
  fillsWith: 'Questions waiting on you, what falls due and what changed while you were away show up here as your lists fill.',
} as const;
