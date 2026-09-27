/**
 * Home's words and the first run's: what needs you, the figures right now, since you were away, an empty record,
 * a colleague's Home, a measure a project reports, and `/start`.
 *
 * AN AREA FILE OF THE COPY AGGREGATE (ARC-8). `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const home = {
  /* What the record would do, appended to a decision's second line on Home, so "what needs you"
     shows its thinking rather than four questions and none. */
  suggestedAnswer: 'Suggested:',
  toDecide: 'to decide',

  /* home */
  /* THE LINES A USE CASE'S VOICE MAY REPLACE reach Home through `lib/voice.ts`, which reads each one as the house
     line, so that file is the only one naming them. They are Home's words all the same, so they live here. */
  needsYou: 'What needs you',
  /* THE BAND OF FIGURES, AND IT WAS A LITERAL IN THE SCREEN. Every other title on this page comes
     from here; this one was typed as `title="Right now"` in the markup, where `19 §9`'s vocabulary
     cannot see it and `dead-copy` cannot count it. */
  rightNow: 'Right now',
  sinceAway: 'Since you were away',
  nothingNeedsYou: 'Nothing needs you today',
  andMore: 'and more',
  /* THE OVERFLOW OF A FEED, as a count and a place to go. Home is not the log — `19 §2` gives that
     job to `/audit` — so what this screen owes a reader is how much it is not showing and the door
     to the rest, which is the same shape the needs-you list already uses. */
  moreInTheLog: (n: number) => `${n.toLocaleString('en')} more in the log`,
  markAllRead: 'Mark all read',
  /* THE `cleared` STATE FOR THE FEED, which is a feed you have worked through rather than a record
     with nothing in it. `19 §6` gives this state no action, because there is nothing to do. */
  nothingNew: 'Nothing new since you last looked',
  /* A MEASURE A PROJECT REPORTS, as a tile and a line (`record/measures.ts`): the period before, and the change against it. */
  measurePrevious: (n: number, weeks = false) => `Previous ${n} ${weeks ? 'weeks' : 'days'}`,
  measureAgainst: (change: string, n: number, weeks = false) => `${change} on the previous ${n} ${weeks ? 'weeks' : 'days'}`,
  measureNothingBefore: (n: number, weeks = false) => `Nothing reported in the ${n} ${weeks ? 'weeks' : 'days'} before`,
  measureLastOn: (day: string) => `Last reported ${day}`,
  /* THE FIVE STATES, ON THE FOUR SCREENS THAT COULD NOT DRAW ANY OF THEM. `grep -c "<Empty"` was
     0 on Home, /audit, /packs and /vault — four surfaces with no way to tell "nothing here yet"
     from "nothing matched", which `19 §6` calls the failure by name. */
  /* THE RECORD ITSELF IS EMPTY, which is a different sentence from every list being empty and from
     nothing needing you. It is the state of the first hour and nothing could say it. */
  recordEmpty: 'Nothing in the record yet',
  recordEmptyBody: 'A record holds what you keep track of: what you owe and are owed, what you pay for, who is involved, and the decisions behind them.',
  startHere: 'Start here',
  /**
   * HOME FOR A COLLEAGUE WHO HOLDS LISTS AND NOT THE RECORD, in place of the two nothings above.
   *
   * Measured through the real seed (`loop/research-invite-landing.md` finding 1): a bookkeeper invited
   * to one empty list was told "Nothing in the record yet." and offered `Start here` over 230 rows, and
   * no screen named the list they had been invited to. The first thing they are told is which list is
   * theirs, and the one control goes there.
   */
  yourList: (name: string) => `Nothing needs you. Your list here is ${name}`,
  yourLists: (names: string) => `Nothing needs you. Your lists here are ${names}`,
  yourListBody: 'The rest of this record belongs to its owner, who can see everything you add.',
  openList: (name: string) => `Open ${name}`,
  /* AND `/start` FOR THE SAME COLLEAGUE, which offered them the tiles that set up a record and which the
     record refused, tile by tile. Setting a record up is its owner's to do. */
  startNotYours: 'This BrainDog is already made, and setting it up is for its owner.',
  startNotYoursWhy: 'You were invited to part of it by its owner.',
} as const;
