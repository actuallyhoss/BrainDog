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
  needsYou: 'Needs you',
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
  money: 'Cash ahead',
  cashNow: 'Cash now',
  /** Under the cash figure: the day it runs out on what is due, from the Money page's own figure. */
  lastsTo: 'Lasts to {{runs-out-on}}',
  comingIn: 'Coming in, 30 days',
  /** The weekday on today's date block in Coming up. */
  today: 'Today',
  goingOut: 'Going out, 30 days',
  /** The tile of the few key numbers that lead Today (`numbersTile`). */
  numbers: 'Numbers',

  /* EACH BLOCK'S OWN EMPTY LINE, for the blocks that stay drawn when they hold nothing. */
  nothingWaiting: 'Nothing is waiting on you.',
  nothingDue: 'Nothing falls due in the next two weeks.',
  nothingNew: 'Nothing new since you last looked.',
  nothingLate: 'Nothing is late or due today.',
  nothingToCheck: 'Nothing is waiting for you to check.',
  nothingUrgent: 'Nothing is marked urgent.',
  noneWorking: 'No agent is working.',
  /** Never drawn on Today, where a tile with no key number is not drawn; said where the block is drawn elsewhere. */
  noNumbers: 'No key numbers yet.',

  /** A burst in what changed that the record put no words to: how many changes it was, never a bare number. */
  changes: (n: number) => (n === 1 ? 'One change' : `${n.toLocaleString('en-GB')} changes`),
  /** The tick behind a late task's dot, for a screen reader and as its tooltip. */
  markDone: (what: string) => `Mark “${what}” done`,

  /* WHO SAID THE LINE UNDER THE TITLE, when the model did (`home-line.ts`): shown on hover or focus, never at rest. */
  byline: 'Slash · today',

  /** The one link the desk keeps to a use case's own page, which never takes the desk's place: "The Solo founder page". */
  useCasePage: (name: string) => `The ${name} page`,

  /* A RECORD WITH LISTS AND NOTHING PINNED, WAITING OR DUE: one calm sentence and one line on what fills the page. */
  nothingNow: 'Nothing needs you right now.',
  /** Needs you's tile on Today with nothing to ask (today F13). */
  nothingNeedsYou: 'Nothing needs you',
  fillsWith: 'Questions waiting on you, what falls due and what changed while you were away show up here as your lists fill.',
} as const;
