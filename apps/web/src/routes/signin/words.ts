/**
 * The entry screens' own words: the desktop app's way back from Google (`desktop/+page.svelte`).
 *
 * A `words` OBJECT IN A MODULE THESE SCREENS OWN, and not keys in `copy.ts` (`lib/copy.ts` header: no unit
 * edits the aggregate). Sign-up's own words, the question and what follows it, are in `routes/signup/words.ts`.
 *
 * Plain Node may load this file through a test, so it imports only relative `.ts` files.
 */

export const words = {
  /** The tab's title while the one-time code is swapped. */
  desktopTitle: 'Signing in',
  /** While it works: a status line, with no dots that pretend to count. */
  desktopWorking: 'Signing you in',
  /** When the code would not swap: what happened, why it likely did, and the one way on. */
  desktopFailed: 'That sign-in did not finish',
  desktopFailedWhy: 'It may have timed out. Start again from the app.',
  desktopBack: 'Back to sign in',
  /** Signed in with nothing left to ask here, on the way straight in (first hour audit, E21). */
  goingIn: 'Signed in. Opening BrainDog',

  /* AN EMAILED LINK THE MAC APP ASKED FOR, opened in a browser: it goes back to the app rather than signing in here. */
  /** Under "Check your email" in the app: where the link finishes. */
  appLinkSent: 'Open the link on this Mac. It brings you back here, signed in.',
  handoffTitle: 'Finish signing in on your Mac',
  handoffWhy: 'You asked for this link in BrainDog for Mac. Open the app to finish there.',
  handoffOpen: 'Open BrainDog for Mac',
  handoffOpening: 'Opening BrainDog for Mac',
  handoffSentTitle: 'Back to BrainDog for Mac',
  handoffSentWhy: 'The app is signing you in. You can close this tab.',
  handoffAgain: 'Open the app again',
  handoffFailed: 'The link could not be handed to the app. Sign in here instead, or ask for a new link in the app.',
  handoffHere: 'Sign in in this browser instead',

  /* THE UI PASS (3 Nov): the screen's own lines where `copy` said a fact the screen already shows. */
  /** The link-sent screen: the address stands on its own line, so this says only what happens. */
  sentWhy: 'If this address can sign in here, a link is on its way. It works once, for 15 minutes.',
  /** Over the address a link opens, so whose account it is reads as a fact and not a sentence to parse. */
  linkIsFor: (kind: 'magic' | 'claim') => (kind === 'claim' ? 'This link is for' : 'This link signs in as'),
  notYou: 'Not your address? Close this page.',
  /** A spent link, said over the ways in, which are the way on. */
  expiredWhy: (kind: 'magic' | 'claim') => (kind === 'claim' ? 'Ask whoever set up your account for a new one.' : 'A link works once, for 15 minutes.'),
  /** A refusal over the ways in: the other ways are drawn under it, so it does not point at them. */
  tryAgain: 'Try again.',
  /** Email links paused while the other ways still work: the paused thing named, and why. */
  sendPaused: (minutes: number) => `Email links are paused for ${minutes === 1 ? 'a minute' : `${minutes} minutes`}`,
  sendPausedWhy: 'There were too many tries.',
  /** Mail down while other ways are drawn: it names no way, the buttons do. */
  mailDown: 'Mail is not going out right now. Try a link again in a few minutes.',
  /** Google's way back for an address nobody signs in with: the foot already offers a BrainDog of your own. */
  googleUnknown: 'Nobody here signs in with that Google address.',
  /** The check that you are a person, while its widget loads, when it did not load, and when Send was pressed first. */
  checkLoading: 'Checking that you are a person',
  checkFailed: 'The check that you are a person did not load.',
  checkFirst: 'Finish the check above first.',
} as const;
