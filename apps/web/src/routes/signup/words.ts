/**
 * Sign-up's own words: describe, then build, then one email, and the screen a free record is made on
 * ("Free leads").
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
  lede: 'Say who you are and what you keep track of.',
  /**
   * THREE PROMISES UNDER THE FIELD (use case 6, step 1), each one the product keeps: a free record takes no card;
   * nothing typed leaves this device until the email is sent; and Settings, Export hands every record
   * its own file, on every plan. The first is said only on Free, since Cloud and Cloud Plus lead to a payment.
   */
  promises: ['Free, with no card', 'Nothing is saved until you keep it', 'Yours to export or move, any time'],

  /** Over the lines heard, and the one press that says they are right. */
  heardTap: 'Pick one to change it',
  /** What the name heard became, said on its line. */
  you: 'you',
  /** A line opened to change: what it can become instead, and the way to take it out. */
  becomeInstead: 'Make it',
  takeOut: 'Take it out',
  nameLabel: 'Your name',
  keepLine: 'Done',
  next: "That's me",

  /** While a turn's reading is still out after the conversation went on with the rules' (1 Nov): what it finds lands on the build. */
  stillReading: 'Reading it once more. Anything else it finds shows up here.',
  /** Once a late reading landed and changed the build. */
  readAgain: 'Read again, and this is what it found.',

  /** The one tap that says the guessed time zone and currency are right, or changes them (1 Nov). */
  setTitle: 'Time and money',
  setLine: (zone: string, money: string | null) => (money === null ? `Times in ${zone} time.` : `Times in ${zone} time, money in ${money}.`),
  setChange: 'Change',
  setZone: 'Time zone',
  setDone: 'Done',
  /** A place named in the words gives a zone the device does not keep: offered, never taken without the tap. */
  setPlaced: (place: string) => `You said ${place}.`,
  setUse: (zone: string) => `Use ${zone} time`,


  /** The second step: the sentence kept, and one email. */
  keepTitle: 'Keep it',
  /** On Cloud or Cloud Plus, where the link leads to the payment and promises nothing free. On Free the line under the
      button says where to open the link (`openHere`). */
  keepLedePaid: 'One email, and we send a link. Open it on this device, pay, and your BrainDog is made.',
  keepSignedIn: 'You are signed in, so it is made as soon as you press.',
  keepSignedInPaid: 'You are signed in, so the payment comes next.',
  /** While the record's name is chosen from what was heard; then its title, with a way to change it. */
  calledFinding: 'Choosing a name from what you said',
  /** Over the name, so the box says whose name it is. */
  calledLabel: "Your BrainDog's name",
  /** With no name heard at all (AH26). */
  calledNone: 'Your BrainDog',
  /** Under the name: where it lives, which Change changes. */
  addressLabel: 'Its address',
  change: 'Change',
  send: 'Email me a link',
  sending: 'Sending',
  makeNow: 'Make my BrainDog',
  edit: firstRun.whoEdit,
  /** Under "Email me a link": where to open it, and the lock that signs her in after (use case 6, step 4). */
  openHere: "Open the link on this phone. After that, this phone's lock signs you in.",
  openHereWide: "Open the link on this device. After that, this device's lock signs you in.",
  /** While the mail travels, beside the build that waits for it. What was said rides in the link. */
  sentWhy: 'The link builds what you see here, on this device or another.',
  /** And when what was said was too long for a link to carry whole: said on the device that sent it. */
  sentCut: 'The link in the letter carries the start of what you said. All of it waits on this device.',
  /** Under the sentence, on a device that opened such a link and has no copy of its own. */
  linkCut: 'The link carried the start of what you said. The rest was left for later: add it here, or once your BrainDog is made.',

  /** Straight after the link, over the passkey (`PasskeyFirst`), before the build is made. */
  lockTitle: 'Your email is confirmed',

  /** The screen while the record is made and the build is written into it, one line for each stage. */
  making: 'Making your BrainDog',
  makingRecord: 'Making your BrainDog',
  makingParts: (parts: readonly string[]) => (parts.length === 0 ? 'Setting it up' : `Adding ${firstRun.and(parts)}`),
  makingOpen: 'Opening it',
  /**
   * When the build did not all go in: the record is made, what you said is kept on this device, and one press tries
   * again with only what is missing. Opening it as it is forgets what you said here.
   */
  madeTitle: 'Your BrainDog is made',
  madePartly: 'Some of it could not be added. Try again, or add it from inside.',
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
  payInstead: 'Pay for one instead',
  /** Sign-up refused, in this screen's words where the host sent none. */
  sendFailed: 'That did not go through. Check the address, then send it again.',
  /** The mailed link opened while the host could not be reached: the link is not spent, so it is not called expired. */
  linkUnreached: 'We could not reach BrainDog. Open the link again in a minute.',
  /**
   * A SIGN-UP LINK OPENED A SECOND TIME ON THE DEVICE THAT SPENT IT (first hour audit, E15): said as used, never as
   * broken, with the one way on that fits. It sent her to make a second BrainDog.
   */
  linkUsedTitle: 'This link was already used',
  linkUsedOpen: 'A link works once, and this one was opened here before. Your BrainDog is made, and you are signed in.',
  linkUsedMake: 'A link works once, and this one was opened here before. You are signed in, so you can make your BrainDog now.',
  linkUsedSignIn: (email: string) => `A link works once, and this one was opened here before. Sign in with ${email} to open your BrainDog.`,
  openMine: 'Open your BrainDog',
  signIn: 'Sign in',
  /** Under a link that did not work on a device that never spent it: it may have been used somewhere else. */
  usedElsewhere: 'Already opened it? Sign in instead',
  haveOne: 'Already have a BrainDog? Sign in',
  /** The header's half of it from 640px: the question in the second ink, then only "Sign in" as the link. */
  haveAsk: 'Already have a BrainDog?',
  /**
   * SIGN-UP BY INVITATION, REACHED WITH NO CODE: its own screen (`Apply.svelte`), not the closed
   * page. The site says nothing about invites; only this page does, and it offers a way in: apply, and be emailed.
   */
  inviteTitle: 'Early access, invite only',
  inviteWhy: "Free in early access. Ask, and we'll email you when there's room.",
  applyName: 'Your name',
  applyEmail: 'Your email',
  applyUse: 'What would you use it for?',
  /** One example of an answer, in the field until somebody types. */
  applyUseLike: "My shop's orders and invoices, or the app I build with Claude",
  applyLink: 'Your website or X handle',
  /** Beside the two questions a person may leave blank. */
  optional: 'Optional',
  applySend: 'Ask for an invite',
  /**
   * THE ONE LINE UNDER EACH FORM THAT NAMES THE TERMS AND THE PRIVACY POLICY (the scope of 24 October): the Terms say
   * "By making an account or using BrainDog, you agree to these terms", and nothing on sign-up linked them. Short, so it
   * is one line on a phone. Each link opens the site's own page in a tab of its own, so what was typed here stays.
   */
  agree: 'You agree to the',
  terms: 'Terms',
  agreeAnd: 'and',
  privacy: 'Privacy policy',
  /** Under a field left empty when the button was pressed: why it is needed, and nothing more (first F16). */
  applyNeedsName: 'Add your name.',
  applyNeedsEmail: 'Add your email.',
  applySending: 'Sending',
  /** In place of the form once the host has it. */
  applied: 'Thanks. Your invite will come to this address.',

  /** Beside Apply from 900px, under it on a phone: what happens next, three plain lines (first F5). */
  nextTitle: 'What happens next',
  nextLines: ['We email your invite.', 'Open it and say who you are.', 'Your BrainDog is made as you type.'],
  /** Refused, in this screen's words: too many tries says when to come back, a failed check says to do it again. */
  applyLimit: (seconds: number) => `Too many tries from here. Try again in ${waitOf(seconds)}.`,
  applyCheck: 'The person check did not pass. Try the check again.',
  applyFailed: 'That did not go through. Try again in a minute.',
} as const;

/** How long a wait is, said the way a person says it: a minute, 5 minutes, 2 hours. */
function waitOf(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 60) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'an hour' : `${hours} hours`;
}
