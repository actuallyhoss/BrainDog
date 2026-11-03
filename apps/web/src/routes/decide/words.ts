/**
 * DECIDE'S OWN WORDS, for the declared page (`views.ts` `decideHome`), the gate (`[id]/+page.svelte`), the answer a press
 * gives (`press.ts`) and BrainDog's own page updates (`improved.ts`), so no sentence a person reads on those screens is
 * typed into the markup. The words the classic screen already kept beside their code stay there (`views.ts` `WORDS`,
 * `lead.ts` `WORDS`, `[id]/onward.ts`, `[id]/picked.ts`).
 *
 * PLAIN AND SHORT: a button says what it does, a question is answered by a press, and a reason is
 * offered as a note after a decline or an edit, never asked for before it. No em dash, and no word of the system's.
 *
 * A PLAIN MODULE, so a test reads the same words the screens say.
 */

export const words = {
  /** A decided question's answer in the Decided list, as its page says it. */
  accepted: 'Accepted',
  declined: 'Declined',
  /* ── the page ── */

  /** The page's calm line, lifted into the head while nothing waits. */
  nothingWaiting: 'Nothing needs you.',
  /** With nothing to ask and something BrainDog did itself today (today F12). */
  nothingHandled: (n: number) => `Nothing needs you. BrainDog handled ${n.toLocaleString('en-GB')} itself today.`,
  /** The calm line once something has been decided, with how long ago the last one was. */
  lastDecided: (when: string) => `Nothing needs you. The last one was decided ${when}.`,
  /* WITH SOMETHING IN THE INBOX "NOTHING WAITS" WOULD BE FALSE: the calm line then says no question waits. */
  noQuestion: 'No question waits on you.',
  noQuestionDecided: (when: string) => `No question waits on you. The last one was decided ${when}.`,
  /** The heading over the questions after the first one. */
  alsoWaiting: 'Also waiting',
  /** The columns of what was decided. */
  question: 'Question',
  chosen: 'Chosen',
  why: 'Why',
  when: 'When',
  /** The calls' one line: how many of those already checked came true. */
  callsRead: (met: number, checked: number) =>
    checked === 0 ? 'None has been checked yet.' : `${met.toLocaleString('en-GB')} of ${checked.toLocaleString('en-GB')} checked came true.`,
  /** The fold over each call, under the line that says how they went. */
  callsEach: 'See each call',

  /* ── one press ── */

  /** Said with the small dot on the suggested answer, for a reader who cannot see the dot. */
  suggested: 'Suggested',
  /** The record's Reject, said as the card says it. */
  decline: 'Decline',
  /** Accept, when accepting moves money: the button names the amount. */
  acceptFor: (amount: string) => `Accept ${amount}`,
  /** The line a decline Backspace gave leaves, with Undo beside it for six seconds before it is sent. */
  declinedHeld: (title: string) => `Declined “${title}”.`,
  /** Over the one line a question opens when the record still keeps a reason for it. */
  reasonAsked: 'This one needs a reason before it is kept. One line is enough.',
  send: 'Send',

  /* ── a note, after a decline or an edit ── */

  /** The offer, under the answer, once it is in. */
  noteOffer: 'Add a note',
  /** Over the field, saying who it is for. */
  noteLabel: 'A note for whoever reads this later',
  noteSend: 'Add note',
  /** Once it is kept. */
  noteKept: 'Your note is kept with the question.',

  /* ── the gate ── */

  /** The gate's answer to a question of options, with the one chosen. */
  decide: 'Answer',
  /** Putting the question off: opens the step that asks why and until when. */
  notNow: 'Not now',
  /** An option card's button under its name and reason, so the name is not said twice; a screen reader hears the name after it. */
  choose: 'Choose',
  /** The question page's second tile (today F9): why it is asked, in the asker's words. */
  whyAsked: 'Why this is asked',
  /** And what answering would change, under it. */
  changes: 'What it changes',
  /** The confirm an answer that cannot be taken back opens in its own card: "Retire it? This cannot be undone." */
  confirm: (answer: string) => `${String(answer).replace(/[.?!]+$/u, '')}? This cannot be undone.`,
  /** The way back out of that confirm, sending nothing. */
  goBack: 'Go back',
  /** A few of the rows an answer changes, named in its card, and how many more. */
  sample: 'Some of what it changes',
  sampleMore: (n: number) => `and ${n.toLocaleString('en-GB')} more`,
  /** Under an answer that leaves things as they are, beside answers that each draw what they change. */
  nothingChanges: 'Nothing changes.',

  /** An address naming a question this record does not hold: said without the handle in the address. */
  notHere: 'This question is not in this BrainDog.',
  /** A question settled elsewhere, whose decision is not among the ones read. Its title is the heading over this. */
  closedNow: 'This question is no longer open.',

  /* ── BrainDog's own page updates, as one card ── */

  /** Who asks, on the card's by-line. */
  by: 'BrainDog',

  /** The card's heading: how many of the person's pages BrainDog has made better. */
  improved: (n: number) => (n === 1 ? 'BrainDog improved one of your pages' : `BrainDog improved ${n.toLocaleString('en-GB')} of your pages`),
  /** Under the heading: that nothing of the person's own is lost. */
  improvedKeeps: 'Anything you changed on them stays as you left it.',
  accept: 'Accept',
  seeEach: 'See each change',
  /** Once they are in. */
  improvedDone: (n: number) => (n === 1 ? 'One page is updated.' : `${n.toLocaleString('en-GB')} pages are updated.`),
  /** An update that carries no note of what it changes. */
  improvedNewer: (title: string) => `${title} has a newer version.`,
  /** When one of them asks to be read before it goes in: what calls other services, or takes something away. */
  improvedRead: 'One of these asks you to read it first.',
  /** When this build cannot draw the plan here, and Add-ons can. */
  improvedOnAddons: 'Read these on Plugins, where each plan is shown whole.',
  openAddons: 'Open Plugins',
} as const;
