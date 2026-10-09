/**
 * Sign-up's own words: describe, then build, then one email (DIRECTION §37), and the screen a free record is made on
 * (DIRECTION §35, "Free leads").
 *
 * A `words` OBJECT IN A MODULE THIS SCREEN OWNS, and not keys in `copy.ts`, as `signin/words.ts` is. The question and
 * its chips are the first run's own (`firstRun.whoQuestion`), so `/start` and this page ask in one voice. Nothing here
 * promises a step the code does not take.
 *
 * Plain Node may load this file through a test, so it imports only relative `.ts` files.
 */

import { firstRun } from '../../lib/first-run.ts';

export const words = {
  /** The tab's title. */
  title: 'Start your BrainDog',
  /** Under "Who are you?": what to say. That nothing is kept yet is the second promise. */
  lede: 'Say who you are and what you want to keep track of. Your BrainDog builds as you type.',
  /** Over the chips, which are the first run's own (`firstRun.whoChips`). */
  startFrom: 'Or start from one of these',
  /**
   * THREE PROMISES UNDER THE FIELD (use case 6, step 1), each one the product keeps: a free record takes no card
   * (DIRECTION §35); nothing typed leaves this device until the email is sent; and Settings, Export hands every record
   * its own file, on every plan. The first is said only on Free, since Cloud and Cloud Plus lead to a payment.
   */
  promises: ['Free, with no card', 'Nothing is saved until you keep it', 'Yours to export or move, any time'],

  /** Over the lines heard, and the one press that says they are right. */
  heardTap: 'Tap one to change it',
  /** What the name heard became, said on its line. */
  you: 'you',
  /** A line opened to change: what it can become instead, and the way to take it out. */
  becomeInstead: 'Make it',
  takeOut: 'Take it out',
  nameLabel: 'Your name',
  keepLine: 'Done',
  next: "That's me",
  /** When nothing in the sentence could be placed: the use cases to choose from, as /start offers them. */
  closest: 'What is it closest to?',
  closestWhy: 'I could not place what you said yet. Pick the closest, or say a little more.',

  /** The one question (`lib/start/question.ts`), on its own step, with the way back to the words. */
  questionTitle: 'One thing I could not guess',
  questionNext: 'Continue',
  questionSkip: 'Skip it',
  back: 'Back',

  /** The second step: the sentence kept, and one email. */
  keepTitle: 'Keep it',
  /** On Cloud or Cloud Plus, where the link leads to the payment and promises nothing free. On Free the line under the
      button says where to open the link (`openHere`). */
  keepLedePaid: 'One email, and we send a link. Open it on this device, pay, and your BrainDog is made.',
  keepSignedIn: 'You are signed in, so it is made as soon as you press.',
  keepSignedInPaid: 'You are signed in, so the payment comes next.',
  /** While the record's name is chosen from what was heard; then its title, with a way to change it. */
  calledFinding: 'Choosing a name from what you said',
  change: 'Change',
  send: 'Email me a link',
  sending: 'Sending',
  makeNow: 'Make my BrainDog',
  edit: firstRun.whoEdit,
  /** Under "Email me a link": where to open it, and the lock that signs her in after (use case 6, step 4). */
  openHere: 'Open it on this phone. After that, this phone signs you in with its own lock, with no password to remember.',
  openHereWide: 'Open it on this device. After that, this device signs you in with its own lock, with no password to remember.',
  /** While the mail travels, beside the build that waits for it. What was said rides in the link. */
  sentWhy: 'The link builds what you see here, on this device or another.',

  /** Straight after the link, over the passkey (`PasskeyFirst`), before the build is made. */
  lockTitle: 'Your email is confirmed',

  /** The screen while the record is made and the build is written into it, one line for each stage. */
  making: 'Making your BrainDog',
  makingRecord: 'Making your record',
  makingParts: (parts: readonly string[]) => (parts.length === 0 ? 'Setting it up' : `Adding ${firstRun.and(parts)}`),
  makingOpen: 'Opening it',
  /**
   * When the build did not all go in: the record is made, what you said is kept on this device, and one press tries
   * again with only what is missing. Opening it as it is forgets what you said here.
   */
  madeTitle: 'Your BrainDog is made',
  madePartly: 'Some of what you said could not be added yet. Try again, or open it and add the rest from inside.',
  madeUnreached: 'What you said did not reach it yet. Try again, or open it and say it there.',
  tryAgain: 'Try again',
  makingAgain: 'Adding what is missing',
  openAsIs: 'Open it as it is',

  /** A refusal that came without the host's sentence: the name is the one thing on this screen to change. */
  makeFor: (name: string) => `Make ${name}`,
  makeRecord: 'Make your BrainDog',
  makeFailed: 'That did not go through. Check the name, then make it again.',
  makingNow: 'Making it',
  /** A second record is on a paid plan, and a person who wants one can go there from here. */
  payInstead: 'Pay for a record instead',
  /** Sign-up refused, in this screen's words where the host sent none. */
  sendFailed: 'That did not go through. Check the address, then send it again.',
  haveOne: 'Already have a BrainDog? Sign in',
  /** Sign-up by invitation, reached with no code: the closed page's own line, and the way to sign in under it. */
  inviteTitle: 'Sign-up is by invitation',
  inviteWhy: 'Open the link you were sent to start your BrainDog here. If you already have one, sign in.',
} as const;
