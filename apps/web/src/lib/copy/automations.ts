/**
 * The words of the doors in: the web addresses this record takes things in at (`WebhookDoors.svelte`). The
 * flow editor on `/automations` keeps its own words beside its code in `lib/flow`, and adds them here from now on.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const automations = {
  /* ── webhook doors: the web addresses this record takes things in at (`WebhookDoors.svelte`) ── */
  /* WHAT IT IS, WHAT HE DOES WITH IT, AND WHAT IT COSTS HIM, in the mail section's order, because the two sit one under
     the other on the same screen and are the same act spelled for a different sender.
     NO SENDER IS NAMED. These keys were `shortcut*` and said "your bank", "an iPhone Shortcut" and "withdrawals", so a
     record whose only door took a build server's results read a section about bank texts. The
     sender is whatever posts, and `webhook-doors.test.ts` fails if a use case comes back into these words. */
  doorsTitle: 'Web addresses',
  /* NO "TOKEN": what a person needs to know is that the address is private. */
  doorsHow: 'Private addresses a phone or script posts to. Anyone holding one can post.',
  /* THE FACT THE SCREEN CANNOT HIDE, as the mail section states its own: only the digest is kept, so nothing reads the
     token back, and a blank where a value would go reads as "you have none". */
  doorsUnknown: 'Shown only when made. Lost it? Make a new one; the old one stops.',
  doorsReading: 'Reading the web addresses BrainDog takes things in at.',
  /* THE EMPTY STATE SAYS WHAT FILLS IT AND WHO ADDS ONE, because nothing on this screen can: a door arrives as a
     change somebody approves. It said "an ingest with channel webhook and verify kind path", which is the file's
     spelling and not the person's; those words stay in the prompt, which is handed to an agent. */
  doorsNone: 'Nothing posts in yet',
  /* WHAT WILL BE HERE, with New web address beside it (G17). */
  doorsEmpty: 'Each address you make is listed here, with what it writes to.',
  doorsNoneWhy: 'Ask an agent to set one up.',
  doorsPrompt: 'read my BrainDog, then propose a webhook door with verify kind path for what I want posted in, and name the list it writes to',
  doorsWrites: (list: string) => `Writes to ${list}.`,
  doorsHeld: 'An address is in use. Making a new one stops the old one working.',
  doorsNotHeld: 'No address made yet.',
  /* `ingestMint` REFUSES EVERY OTHER KIND, so the row says why it has no button rather than drawing one that fails. */
  doorsOtherCheck: 'This one checks its senders another way, so there is no address to make here.',
  doorsMint: 'Make the address',
  doorsRemint: 'Make a new address',
  doorsMinting: 'Making',
  /* THE CONFIRM, SAID AS WHAT IS LOST. A replaced token stops verifying in the same statement that keeps the new one,
     so whatever is posting to the old address is turned away from that moment with nothing to tell it why. */
  doorsReplaceAsk: 'Anything still posting to the address in use will be turned away the moment a new one is made.',
  doorsReplace: 'Replace it',
  doorsKeep: 'Keep the one in use',
  doorsOnce: 'Shown once, now. Copy it before you leave this screen: it cannot be shown again, and making another replaces it.',
  doorsCopyUrl: 'Copy the address',
  doorsUrlCopied: 'Address copied',
  doorsCopyToken: 'Copy the token',
  doorsTokenCopied: 'Token copied',
  /* THE WHOLE OF WHAT A SENDER NEEDS, in words that hold for a phone, a script or a service's webhook setting. */
  doorsPost: 'Send each item as the body of a POST to this address. The token in the address is the whole of the check, so nothing else needs setting up.',
  /* THE ADDRESS IS THE PATH THE RECORD ANSWERED, AND THIS HOST ANSWERED NONE. The screen says what is missing rather
     than building one that neither door would match. */
  doorsNoAddress: 'BrainDog answered the token without the path the address is built from, so no address is shown. Keep the token: it is the only copy there will be.',
  doorsMade: 'Made. Making another replaces this one, which is also how a leaked address is dealt with.',
  doorsNoToken: 'BrainDog answered without a token in it, so nothing was shown. Try again, and if it happens twice nothing has been changed.',
  doorsNoRead: 'This BrainDog does not list its web addresses yet, so none can be shown here. Updating it brings them.',
  doorsFreshWhy: 'Making an address needs a sign-in from the last fifteen minutes, because whoever holds it can write into your BrainDog.',

  /* ── the automation editor's footer (`routes/automations/[id]`) ── */
  /* SAID IN THE LIVE LINE AFTER AN UNDO, by the button or by Mod+Z, since the card that moved back says nothing. */
  flowUndone: 'Undid the last change.',
  /* THE SAME, AFTER A REDO, by the button or by Mod+Shift+Z / Mod+Y. */
  flowRedone: 'Redid the last change.',
  /* A NEW ONE THAT STARTS ON A PRESS: its trigger says "When you press Run now", and the button only exists once there
     is something saved to run, so the footer says where it will be. */
  flowRunAfterSave: 'Run now appears here once it is saved.',
  /* MORE THAN ONE THING HOLDS THE SAVE BACK, and each is said on the card it is about. */
  flowFaultsOnCards: (n: number) => `${n} things, each said on its card.`,
} as const;
