/**
 * DECIDE'S OWN WORDS, for the declared page (`views.ts` `decideHome`) and for the gate (`[id]/+page.svelte`), so no
 * sentence a person reads on either screen is typed into the markup. The words the classic screen already kept beside
 * their code stay there (`views.ts` `WORDS`, `lead.ts` `WORDS`, `[id]/onward.ts`, `[id]/picked.ts`).
 *
 * A PLAIN MODULE, so a test reads the same words the screens say.
 */

export const words = {
  /* ── the page ── */

  /** The page's calm line, lifted into the head while nothing waits. */
  nothingWaiting: 'Nothing waits on you.',
  /** The calm line once something has been decided, with how long ago the last one was. */
  lastDecided: (when: string) => `Nothing waits on you. The last one was decided ${when}.`,
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

  /* ── the gate ── */

  /** The fold's handle when accepting changes nothing it can name, as on a question of options: what the fold holds then. */
  doesOpen: 'Why it is asked, and what it costs',
  /** The first of several things accepting puts in place, and how many more. */
  andMore: (first: string, n: number) => `${first}, and ${n.toLocaleString('en-GB')} more`,
  /** How long the question has been open, and that nobody has answered it. */
  opened: (when: string) => `Opened ${when}. Nobody has decided it.`,
  /** Beside the heading over the reason, which cannot be left out. */
  required: 'required',
  /** Over the reason box: the option being chosen, by its own name. */
  choosing: 'You are choosing',
  cancel: 'Cancel',
} as const;
