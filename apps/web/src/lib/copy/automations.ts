/**
 * The words of the doors in: the web addresses this record takes things in at (`WebhookDoors.svelte`). The
 * flow editor on `/automations` keeps its own words beside its code in `lib/flow`, and adds them here from now on.
 *
 * AN AREA FILE OF THE COPY AGGREGATE (ARC-8). `lib/copy.ts` spreads this object into `copy`, and every screen reads a
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
     record whose only door took a build server's results read a section about bank texts (`DIRECTION.md` §22). The
     sender is whatever posts, and `webhook-doors.test.ts` fails if a use case comes back into these words. */
  doorsTitle: 'Web addresses that take things in',
  doorsHow: 'Each door below is a web address a phone, a script or another service posts to, and what arrives is written to the list the door names. The address carries a token, made here.',
  /* THE FACT THE SCREEN CANNOT HIDE, as the mail section states its own: only the digest is kept, so nothing reads the
     token back, and a blank where a value would go reads as "you have none". */
  doorsUnknown: 'This screen cannot show a token the record already has. Only a fingerprint of it is kept, so if you no longer have it, make a new one and the old one stops working.',
  doorsReading: 'Reading the doors this record declares.',
  /* THE EMPTY STATE SAYS WHO ADDS ONE AND HOW, because nothing on this screen can: a door is a declaration, and a
     declaration arrives as a change somebody approves. The prompt is the one to hand an agent. */
  doorsNone: 'No door declared yet',
  doorsNoneWhy: 'An agent adds one by proposing a change that declares an ingest with channel webhook and verify kind path, naming the list it writes to. Once the change is approved, the door is listed here with a button that makes its address.',
  doorsPrompt: 'read my record, then propose a webhook door with verify kind path for what I want posted in, and name the list it writes to',
  doorsWrites: (list: string) => `Writes to ${list}.`,
  doorsHeld: 'An address is in use. Making a new one stops the old one working.',
  doorsNotHeld: 'No address made yet.',
  /* `ingestMint` REFUSES EVERY OTHER KIND, so the row says why it has no button rather than drawing one that fails. */
  doorsOtherCheck: 'This door checks its senders another way, so there is no address to make here.',
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
  doorsNoAddress: 'This host answered the token without the path the address is built from, so no address is shown. Keep the token: it is the only copy there will be.',
  doorsMade: 'Made. Making another replaces this one, which is also how a leaked address is dealt with.',
  doorsNoToken: 'This host answered without a token in it, so nothing was shown. Try again, and if it happens twice nothing has been changed.',
  doorsNoRead: 'This host does not list its doors yet, so none can be shown here. Updating it brings the list.',
  doorsFreshWhy: 'Making an address needs a sign-in from the last fifteen minutes, because whoever holds it can write into this record.',
} as const;
