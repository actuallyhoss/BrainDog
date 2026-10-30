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
} as const;
