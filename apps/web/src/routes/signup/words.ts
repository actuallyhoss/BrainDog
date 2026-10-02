/**
 * Sign-up's own words for Free (DIRECTION §35, "Free leads"): the rail's third step and its reading line when nothing
 * is paid, and the screen a free record is made on.
 *
 * A `words` OBJECT IN A MODULE THIS SCREEN OWNS, as `signin/words.ts` is, and not keys in `copy.ts`. The paid path
 * keeps `signin/words.ts`'s steps as they are; Free swaps the one step that is Stripe's for the one the host takes
 * instead (`/account/billing/checkout` with `plan: 'free'` makes the record there and then). Nothing here promises a
 * step the code does not take.
 *
 * Plain Node may load this file through a test, so it imports only a type.
 */

import type { StepWord } from '../signin/words.ts';

export const freeWords = {
  /** The rail's third step on Free: no payment, the record is made the moment the link is opened. */
  step: { title: 'Your record is made', line: 'The moment you open the link, with nothing to pay.' } satisfies StepWord,
  /** THE RAIL'S READING LINE ON FREE: the fact a stranger wants first, which is that nothing is charged. */
  note: 'Free needs no card. Cloud and Cloud Plus add more Slash and colleagues, from Settings, whenever you want them.',

  /** The screen while the record is made. */
  making: 'Making your record',
  makingWhy: 'Free, with no card. This takes a few seconds.',
  /** When the name could not be made: the host's sentence says why, and the name can be changed and tried again. */
  makeFor: (name: string) => `Make ${name}`,
  makeRecord: 'Make your record',
  /** A refusal that came without the host's sentence: the name is the one thing on this screen to change. */
  makeFailed: 'That did not go through. Check the name, then make it again.',
  makingNow: 'Making it',
  /** A second record is on a paid plan, and a person who wants one can go there from here. */
  payInstead: 'Pay for a record instead',
} as const;
