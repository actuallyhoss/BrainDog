/**
 * The words of handing a row to somebody: the "Hand to" control in the row menu and the row page's head, the
 * short sheet it opens, the line the row keeps while an agent holds it, and the event a hand leaves in the history.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports nothing.
 */

export const hand = {
  /* THE VERB AND ITS OBJECT ARE THE ROW, so the control says only the verb; the sheet's title names the row. */
  handTo: 'Hand to',
  handSheetTitle: (title: string): string => (title ? `Hand "${title}" to` : 'Hand this to'),
  handYou: 'You',
  handPeople: 'People on this record',
  handAgents: 'Agents',
  /* SAID WHEN THE SHEET HAS NOBODY BUT YOU TO OFFER, so an empty list is not read as a list that failed. */
  handNobody: 'Nobody else is on this record yet, and no agent has run here.',
  handHolding: 'Holds it now',
  /* THE EVENT A HAND LEAVES ON THE ROW, signed by whoever pressed, so the history reads "Sami handed this to Mona". */
  handedNote: (name: string): string => `Handed this to ${name}`,
  handedToast: (name: string): string => `Handed to ${name}`,
  handPutBack: 'Put back',
  handPutBackDone: 'Put back as it was',
  /* AN AGENT HOLDS A ROW UNTIL ITS NEXT RUN TAKES IT, or while a job it was started as runs. */
  handWaiting: (agent: string): string => `Waiting for ${agent}'s next run`,
  handRunning: (agent: string): string => `${agent} is on it`,
  handReadFailed: 'BrainDog could not reach this record.',
  handRetry: 'Retry',
} as const;
