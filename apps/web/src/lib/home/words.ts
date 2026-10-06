/**
 * Home's own words: the headings of Today's declared body (`default-home.ts`), and the calm sentence a record with
 * lists and nothing in them reads. The line under the title is worked out in `today-tiles.ts` (`sentenceOf`).
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
  overdue: 'Late',
  sinceAway: 'Since you were away',

  /* TODAY'S OWN BLOCKS (`todayHome`), which no use case words its own way: the work that needs you, and money. */
  /** One of the tasks list where the record gives it no word of its own; the line it is typed into says the list's own. */
  task: 'task',
  /** The late tile's name while it also holds a task due today, which is not late yet. */
  lateOrToday: 'Late or due today',
  toCheck: 'Handed back to you',
  urgent: 'Urgent',
  money: 'Money',
  cashNow: 'Cash now',

  /* EACH BLOCK'S OWN EMPTY LINE, for the blocks that stay drawn when they hold nothing. */
  nothingWaiting: 'Nothing is waiting on you.',
  nothingDue: 'Nothing falls due in the next two weeks.',
  nothingNew: 'Nothing new since you last looked.',
  nothingLate: 'Nothing is late or due today.',
  nothingToCheck: 'Nothing is waiting for you to check.',
  nothingUrgent: 'Nothing is marked urgent.',
  noneWorking: 'No agent is working.',

  /* WHO SAID THE LINE UNDER THE TITLE, when the model did (`home-line.ts`): shown on hover or focus, never at rest. */
  byline: 'Slash · today',

  /* A RECORD WITH LISTS AND NOTHING PINNED, WAITING OR DUE: one calm sentence and one line on what fills the page. */
  nothingNow: 'Nothing needs you right now.',
  fillsWith: 'Questions waiting on you, what falls due and what changed while you were away show up here as your lists fill.',
} as const;
