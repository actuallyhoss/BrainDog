/**
 * THE FIRST RUN'S OWN WORDS, and the one rule of the old first-row form that `RowForm` still reads.
 *
 * IT IS SPLIT OUT OF `copy.ts` FOR THE ENTRY CHUNK'S SAKE. `copy.ts` is imported by the shell, so everything in it lands
 * in the chunk every screen waits for, and these sentences are read by one screen a person sees once. The `dead-copy`
 * gate reads this object as it reads `copy`: every key here is read, as `firstRun.<key>`, by a file the app ships.
 *
 * ONE PROMPT AND ONE ACCEPT. The two turns, the use-case card worded as a manifest
 * ("Builds on", "Lists:", "Pages:", "In a voice that is"), the five one-row tiles and screen two's panel went with the
 * screen they belonged to. What is left says what was heard and what the BrainDog will be, in words a person says.
 */

export const firstRun = {
  /* THE PROMPT. A question, one field and four chips, one for each of the four people the product is for:
     an individual, a solo founder, a team and somebody starting something. Each chip is a
     clause a person could have typed, appended to what is there, never a choice made for them. */
  whoQuestion: 'Who are you?',
  whoPlaceholder: 'Your name, and what you want to keep here',
  whoChips: ["I'm a student", 'I run a few companies', "I'm part of a team", "I'm starting something new"],
  whoChipsLabel: 'Add to your answer',
  whoGo: 'Show my BrainDog',
  /* THE SENTENCE ONCE IT IS READ, drawn as one line a press opens again for editing. */
  whoEdit: 'Edit what you said',

  /* WHAT WAS HEARD: each phrase of the sentence and what it became, and the name said back. */
  heardTitle: 'What I heard',
  heardName: (name: string) => `You are ${name}.`,
  /* A SENTENCE THESE RULES CANNOT READ IS KEPT, NEVER REFUSED: nothing is guessed from it, and the person turns on
     what they want by hand. */
  heardNone: 'Nothing here makes a list yet. Turn on what you want below.',
  /* AND WHERE THE WORDS ARE KEPT, said only where they are: the note on the person's own People entry, which needs a
     name heard and People kept. Said unconditionally, it promised a note to somebody who gave no name. */
  heardNote: 'Your words are kept as the note on your entry in People.',
  /* WITH PEOPLE OFF THE NAME IS SAID BACK AND STORED NOWHERE, because a member's own settings hold no name and People
     is never turned back on behind somebody who turned it off. */
  nameNotKept: 'People is off, so your name is said here and kept nowhere.',
  /* An amount typed with no currency is said back, so the person sees why it is not in the entry (`shape.ts`). */
  shapeNoCurrency: 'no currency, so not kept',
  /* A title the record keeps, built only from what was typed: the cadence and the client's name (`shape.ts`). */
  shapeInvoice: (cadence: string | null, client: string | null) =>
    `${cadence ? `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)} invoice` : 'Invoice'}${client ? ` to ${client}` : ''}`,
  and: (items: readonly string[]) => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`),

  /* WHAT THE BRAINDOG WILL BE, before anything is written: its pages, its Home, what it keeps and the first entries. */
  mineTitle: 'Your BrainDog',
  mineFor: 'Make it for',
  minePages: 'Its pages',
  mineHome: 'Its Home',
  /* THE HOME IS DRAWN WITH EXAMPLES AND SAYS SO, because none of them is written. */
  mineExamples: 'Drawn with examples to show its shape. None of them is saved.',
  mineEntries: 'From what you said',
  mineIn: (title: string, list: string) => `${title}, in ${list}`,
  mineKeeps: 'What it keeps',
  keepSwitch: (name: string) => `Keep ${name}`,
  /* A MODULE THE USE CASE STANDS ON stays on while that use case is chosen, and says why. */
  keepNeeded: (title: string) => `${title} needs it.`,

  /* THE CURRENCY, asked only when Money is kept and the sentence typed none. */
  currencyQuestion: 'Which currency do you use?',
  currencyFind: 'Find a currency',
  currencyNone: 'No currency matches that.',
  currencyFirst: 'Choose the currency your money is in, and Money is made in it.',

  /* THE REMINDER, offered where what it keeps has due dates and the host can ring this phone (Web Push). */
  remindOn: 'Remind me on this phone',
  remindWhy: 'What falls due can ring here, once you say yes.',
  remindIsOn: 'This phone will be reminded.',

  /* THE ONE ACCEPT. Everything is written in this press, and nothing before it. */
  makeIt: 'Make it mine',
  makingIt: 'Making it',
  makeSomething: 'Turn on one thing to keep first.',
  madeToast: 'Your BrainDog is ready.',
  /* WHAT COULD NOT BE MADE, in the person's words; the record's own sentence stays under Details. */
  /* A TITLE, SO NO FULL STOP: it heads the list of what was refused. */
  notAllMade: 'Some of it could not be made',
  notAdded: (name: string) => `${name} was not added.`,
  notMade: (title: string) => `${title} was not made.`,
  notMet: (name: string) => `${name} was not added to People.`,
  notSet: 'The currency was not set.',
  whyDetails: 'Details',
  openHome: 'Open my BrainDog',

  /**
   * AND `/start` OPENED AGAIN ON A RECORD THAT IS ALREADY MADE SAYS SO, AND OFFERS THE WAY BACK.
   *
   * The root layout sends a record with no lists here and spares `/start` from that redirect, which is what makes this
   * the one screen somebody can reach with the record already behind it. Answering again installs; it deletes nothing
   * and changes no entry, so saying so is what lets somebody who came here on purpose carry on.
   */
  againMade: 'This BrainDog is already made.',
  againMore: 'Answering again adds to it and takes nothing away.',
  againBack: 'Open this BrainDog',
} as const;

/**
 * Which fields a first-row form asks for: the title, and every field the list requires that the caller has not already
 * answered. `RowForm`'s `first` mode reads it; it sits here beside the words it was written for, holding no sentence.
 */
export function firstAsks<F extends { id: string; required?: boolean }>(fields: readonly F[], title: string | undefined, given: Readonly<Record<string, string>> = {}): F[] {
  return fields.filter((f) => f.id === title || (f.required === true && given[f.id] === undefined));
}
