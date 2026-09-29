/**
 * The entry screens' own words: the one line that says what a passkey is, and the six steps sign-up draws beside its
 * form (`loop/design/SCREENS.md`, Sign in / Sign up / Invite).
 *
 * A `words` OBJECT IN A MODULE THESE SCREENS OWN, and not keys in `copy.ts` (`lib/copy.ts` header: after ARC-8 no unit
 * edits the aggregate). The steps restate what the flow already does, in the order it does it: the mail
 * (`copy.signupMailSent`), Stripe's page (`copy.signupPayWhy`), the passkey `/start` asks for first
 * (`copy.passkeyFirstWhy`), then the one question and "Make it mine" (`firstRun`). Nothing here promises a step the
 * code does not take.
 *
 * Plain Node may load this file through a test, so it imports only relative `.ts` files.
 */

import { firstRun } from '../../lib/first-run.ts';

export type StepWord = { title: string; line: string };

export const words = {
  /** Under the passkey way in: what a passkey is, in one sentence. */
  passkeyLine: "A passkey opens with your device's own lock, so there is nothing to type or remember.",

  nextTitle: 'What happens next',
  /** The tile's meta: where this person is in the six. */
  stepOf: (n: number, of: number) => `Step ${n} of ${of}`,
  now: 'Now',
  done: 'Done',
  /** THE TILE'S READING LINE: the one fact a stranger wants before they type anything, which is when money moves. */
  payNote: "You pay at step 3, on Stripe's page. Close it without paying and nothing is charged, and you can start again.",

  steps: [
    { title: 'Your email and a name', line: "The name becomes your record's address." },
    { title: 'Open the link', line: 'It is mailed to you, works once and lasts a day.' },
    { title: 'Pay on Stripe', line: "On Stripe's own page, then straight back here." },
    { title: 'Add a passkey', line: "Not a password: it opens with your device's own lock." },
    { title: 'Tell it who you are', line: `Answer "${firstRun.whoQuestion}" in one sentence, in your own words.` },
    { title: firstRun.makeIt, line: 'It sets up your first lists and pages, and opens your Home.' },
  ] as readonly StepWord[],
};
