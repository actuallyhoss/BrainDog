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
  /**
   * THE LATE TILE'S NAME SAYS EACH KIND IT HOLDS (live check of 30 October, 5): "Late and urgent 6" stood over one late
   * bill, a task due today and work handed back, beside Work's "None of your tasks is late". Its parts, first one first.
   */
  band: { late: 'Late', today: 'due today', urgent: 'urgent', back: 'handed back' },
  /** How a line that is not late came to stand in the late band, said where how late it is would be. */
  urgentWhy: 'urgent',
  backWhy: 'handed back to you',
  money: 'Cash ahead',
  cashNow: 'Cash now',
  /** Under the cash figure: the day it runs out on what is due, from the Money page's own figure. */
  lastsTo: 'Lasts to {{runs-out-on}}',
  /**
   * TODAY'S OWN SHORT LABELS for the two figures beside the cash, under "Cash ahead" (his call of 23 Oct): at about
   * 1280 wide the Money page's words, "To come in, next 30 days" and "Bills and usual spending, next 30 days", wrapped
   * beside their figures and Cash ahead clipped at the board's shortest row. Money keeps its long words, where the
   * figure has room.
   */
  comingIn: 'In, 30 days',
  /** The weekday on today's date block in Coming up. */
  today: 'Today',
  /** Bills, plans and the usual everyday spending going out (Money names it in full); short beside the cash, as `comingIn`. */
  goingOut: 'Out, 30 days',
  /**
   * The work that falls due this week, under Work's own heading (audit Q10): yours, as Work's band says it (finish F51),
   * so it never reads as Projects' "This week" or Timeline's "due in 7 days", which count agents' work and what waits on you.
   */
  workDue: 'Your work this week',
  /** The tile of the few key numbers that lead Today (`numbersTile`). */
  numbers: 'Numbers',

  /* EACH BLOCK'S OWN EMPTY LINE, for the blocks that stay drawn when they hold nothing. */
  nothingWaiting: 'Nothing is waiting on you.',
  nothingDue: 'Nothing falls due in the next two weeks.',
  nothingNew: 'Nothing new since you last looked.',
  nothingDueWork: 'No work falls due this week.',
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

  /* A RECORD WITH LISTS AND NOTHING PINNED, WAITING OR DUE: one calm sentence and one line on what fills the page. */
  nothingNow: 'Nothing needs you right now.',
  /** Needs you's tile on Today with nothing to ask (today F13). */
  nothingNeedsYou: 'Nothing needs you',
  /** Under it on a tile with nothing in it: what will be here, and how it gets there (AP22). */
  nothingNeedsYouWhy: 'When a bill is late or an agent needs a choice from you, it waits here.',
  fillsWith: 'What needs you and what falls due land here.',
} as const;
