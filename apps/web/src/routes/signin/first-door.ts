/**
 * What `/signin` can actually offer, on the one run nobody has ever walked: a record with no passkey
 * in it yet.
 *
 * MEASURED, AND IT IS THE REASON THIS FILE EXISTS. On a brand new record,
 * `GET https://app.brain.dog/auth/methods` answered `{ passkey: true, magic: false, key: false,
 * open: false, demo: false, me: null, firstRun: true }`. `firstRun` is zero rows in `dir_passkey`
 * (`packages/record/src/identity.ts:356`); `magic` is off because `AUTH_MAIL_FROM` is empty; `key` is
 * the self-host's and a Worker never has one. `waysOf` in `lib/signin.ts` then switches the passkey
 * button off, correctly, because registration needs a session (`packages/host/src/auth.ts:127-128`)
 * and there is no passkey to assert with. What it hands back is a `Ways` whose three ways are all
 * false and whose `lead` is null, and the screen treated that object as a set of doors because it
 * was not null: an empty door block, the lede *Sign in to open your record*, and the `unsupported`
 * note, *"This browser cannot use a passkey here."* The browser was not the problem and changing it
 * would have changed nothing. The way in is the claim link `POST /auth/provision` hands the operator.
 *
 * THE SENTENCES ARE HERE AND THEY BELONG IN `lib/copy.ts`. `50 §3` puts every sentence in one file so
 * the no-over-explaining rule is reviewable in one pass, and `tools/gates/dead-copy.mjs` reads that
 * file and `lib/first-run.ts` and no other. This run could not write either of them. Moving these two
 * keys into `copy.ts` is the repair, and nothing else has to change with them.
 */

import type { Methods } from '../../lib/auth.ts';
import type { State, Ways } from '../../lib/signin.ts';

/** The aside `signed-out` carries, read off the state rather than retyped so the two cannot drift. */
type Note = Extract<State, { name: 'signed-out' }>['note'];

/**
 * The ways that can be pressed, or null when none can.
 *
 * `stateOf` ANSWERS WITH A `Ways` WHENEVER THE HOST NAMED A METHOD, not whenever one can act, and the
 * two come apart on exactly one input: the first run of a passkey-only host. A screen that draws a
 * block for the second reading draws an empty block.
 */
export const actable = (ways: Ways | null): Ways | null => (ways && (ways.passkey || ways.magic || ways.key) ? ways : null);

/**
 * Whether the screen must say that this record has no way into it yet.
 *
 * TOLD APART FROM A BROWSER THAT CANNOT DO WEBAUTHN, which produces the same empty `Ways` and is a
 * different thing to say: there, a passkey exists and this browser cannot present it, so
 * `copy.passkeyUnusable` is true and pointing at another browser is a real fix. Here no credential
 * in the world opens this record, and the only sentence worth printing names the claim link.
 *
 * AND TOLD APART FROM THE PRESS THAT JUST LEFT, which `note` is here for and which the first cut of
 * this function got wrong. `me` goes null and `firstRun` stays true the moment somebody who claimed
 * the record by link signs out again, because `firstRun` counts passkeys and a claim adds none, so
 * the shape below is identical to a record nobody has ever opened. It is not one: the link that got
 * him in was spent doing it (`/auth/magic/redeem` spends a claim once, `packages/host/src/auth.ts:132`),
 * so the sentence would send him to a token the host refuses, in place of the confirmation he asked
 * for by pressing the button. `out` is the one note that means a person was here a moment ago.
 */
export const noDoorYet = (it: Methods, ways: Ways | null, note: Note): boolean =>
  it.me === null && it.firstRun === true && ways === null && note !== 'out';

/* THE DEMO PILL IS GONE, AND SO IS THE REASON IT WAS KEPT. The second finding on this screen was that
 * the pill never read `methods.demo`, and measuring showed it did not need to: a 401 at the bare `/app`
 * drew the shipped sample business, which is what the pill promised. There is no sample now.
 * `/app/` with nobody signed in is sent here like every other address that answers
 * 401 (`signInFirst` in `lib/at.ts`), so the pill would have been a button back to this screen, and
 * on the first run the claim link sentence is the one way in there is. `methods.demo` went with it.
 */

/** The two sentences for `noDoorYet`. See the header: these belong in `lib/copy.ts`. */
export const firstDoor = {
  title: 'This record has no passkey yet.',
  /* WHAT HE CAN DO, AND IT IS THE ONLY THING HE CAN DO. The claim link is handed to whoever
     provisioned the record and is never mailed (`33 §4`), so it is in a terminal and not an inbox. */
  why: 'Open the link you were given when the record was set up. You can add a passkey once you are in.',
} as const;
