/**
 * What `/signin` can actually offer, on the one run nobody has ever walked: a record with no passkey
 * in it yet.
 *
 * MEASURED, AND IT IS THE REASON THIS FILE EXISTS. On 20 September 2026,
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

/* THE DEMO PILL WAS THE SECOND FINDING AND IT WAS WRONG, recorded here so nobody spends the hour
 * again. The pill is drawn for every state but `loading`, `signed-in` and `open` and it never reads
 * `methods.demo`, which live is false, so it looked like a primary button naming a record that does
 * not exist. Measured instead of read: `GET https://app.brain.dog/api/boot` answers 401
 * `UNAUTHORIZED`, `noRecord` in `lib/record/device.ts:143` counts `UNAUTHORIZED` as no record, and
 * `readBoot` therefore answers `{ from: 'sample' }`. So `/` draws the shipped sample business, which
 * is exactly what the pill promises and what the marketing site links to. `methods.demo` is a
 * narrower fact than the button: it says the host PINNED a public record for anonymous reads, and
 * the sample needs no host at all. Gating the pill on it would have deleted a working way forward
 * from the one screen that has no other.
 *
 * ONLY WHERE THE ADDRESS NAMES NO RECORD, since the app moved under `brain.dog/app`. `/app` with no one signed in is
 * the sample, as above; `/app/acme/…` answering 401 is sent here with `?next=`, because the sample drawn there would be
 * dressed as acme (`noRecord` in `lib/record/device.ts`, and the root layout's redirect). So the pill opens `/app/`.
 */

/** The two sentences for `noDoorYet`. See the header: these belong in `lib/copy.ts`. */
export const firstDoor = {
  title: 'This record has no passkey yet.',
  /* WHAT HE CAN DO, AND IT IS THE ONLY THING HE CAN DO. The claim link is handed to whoever
     provisioned the record and is never mailed (`33 §4`), so it is in a terminal and not an inbox. */
  why: 'Open the link you were given when the record was set up. You can add a passkey once you are in.',
} as const;
