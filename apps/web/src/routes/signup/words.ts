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
  /** Under "Who are you?": what to say, and that nothing is kept yet. */
  lede: 'Say who you are and what you want to keep here. It builds as you type, and nothing is saved until you keep it.',
  /** The one press under the sentence. */
  next: 'Continue',
  /** When nothing in the sentence could be placed: the use cases to choose from, as /start offers them. */
  closest: 'What is it closest to?',
  closestWhy: 'I could not place what you said yet. Pick the closest, or say a little more.',

  /** The second step: the sentence kept, and one email. */
  keepTitle: 'Keep it',
  keepLede: 'One email, and we send a link. Open it on this device and your BrainDog is made, free, with no card.',
  /** The same on Cloud or Cloud Plus, where the link leads to the payment and promises nothing free. */
  keepLedePaid: 'One email, and we send a link. Open it on this device, pay, and your BrainDog is made.',
  keepSignedIn: 'You are signed in, so it is made as soon as you press.',
  keepSignedInPaid: 'You are signed in, so the payment comes next.',
  /** The record's name, chosen from what was heard, as one quiet line with a way to change it. */
  calledLine: (name: string) => `It will be called ${name}.`,
  calledFinding: 'Choosing a name from what you said',
  change: 'Change',
  send: 'Email me a link',
  sending: 'Sending',
  makeNow: 'Make my BrainDog',
  edit: firstRun.whoEdit,
  /** While the mail travels, beside the build that waits for it. */
  sentWhy: 'The link builds what you see here. If you open it on another device, you can say who you are again there.',

  /** The screen while the record is made and the build is written into it, one line for each stage. */
  making: 'Making your BrainDog',
  makingRecord: 'Making your record',
  makingParts: (parts: readonly string[]) => (parts.length === 0 ? 'Setting it up' : `Adding ${firstRun.and(parts)}`),
  makingOpen: 'Opening it',
  /** When some of the build did not go in: the record is made, and what is missing can be added from it. */
  madePartly: 'Your BrainDog is made, and some of it could not be added. You can add it from inside.',

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
} as const;
