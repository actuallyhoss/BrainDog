/**
 * The three decisions `/signin` makes about what it can offer, driven against the answer the live
 * host gives a brand new record.
 *
 * WHAT WAS MEASURED, AND IT IS THE WHOLE REASON THIS FILE EXISTS. On a brand new record,
 * `GET https://app.brain.dog/auth/methods` answered
 * `{ passkey: true, magic: false, key: false, open: false, demo: false, me: null, firstRun: true }`.
 * Run through `stateOf`, that is `signed-out` carrying a `Ways` whose passkey, magic and key are all
 * false and whose `lead` is null, because `waysOf` switches the passkey button off on the first run:
 * no passkey exists yet, so pressing it could sign nobody in. The screen then drew an empty
 * `<div class="doors">`, the lede *Sign in to open your record*, and the `unsupported` note, which
 * reads *"This browser cannot use a passkey here. Open this page in a browser that supports
 * passkeys."* The browser was fine. Changing it would have changed nothing. That sentence is the
 * first thing the owner of a new record meets and it sends him somewhere that cannot help.
 *
 * THE ONE BUTTON THAT WAS LEFT ON THAT SCREEN IS GONE. It was the demo pill, which opened the sample
 * business at `/`, and it was measured to work when this file was written. There is no sample now:
 * `/` with no session is sent back here, so the pill is removed and the claim link
 * sentence is the whole of the first run's screen, which is true, since it is the only way in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { Methods, Said } from '../../lib/auth.ts';
import { stateOf, type Seen, type Ways } from '../../lib/signin.ts';
import { account } from '../../lib/copy/account.ts';
import { actable, mailHeld, noDoorYet } from './first-door.ts';

/** What `https://app.brain.dog/auth/methods` answered, field for field, less `demo`: there is no demo left to read. */
const LIVE: Methods = { passkey: true, magic: false, key: false, open: false, me: null, firstRun: true };

const said = (m: Methods): Said<Methods> => ({ ok: true, value: m });

const seen = (m: Methods, over: Partial<Seen> = {}): Seen => ({
  methods: said(m),
  entered: null,
  link: null,
  step: { at: 'idle' },
  secure: true,
  webauthn: true,
  now: 1_758_000_000_000,
  ...over,
});

/** The `Ways` the screen is handed for a given methods answer, or null where `stateOf` carries none. */
function waysFor(m: Methods, over: Partial<Seen> = {}): Ways | null {
  const state = stateOf(seen(m, over));
  return 'ways' in state ? state.ways : null;
}

test('the live first run hands the screen a Ways with nothing in it that can act', () => {
  const state = stateOf(seen(LIVE));
  assert.equal(state.name, 'signed-out');
  assert.deepEqual(waysFor(LIVE), { passkey: false, magic: false, key: false, lead: null, keyOpen: false });
});

test('a Ways whose every way is false is not a way in, and the screen must draw no door block', () => {
  assert.equal(actable(waysFor(LIVE)), null);
  assert.equal(actable(null), null);
});

test('a Ways with one way left is still a way in', () => {
  const ways = waysFor({ ...LIVE, firstRun: false });
  assert.deepEqual(actable(ways), ways);
  assert.equal(ways?.passkey, true);
});

test('the first run with no door is what the screen says, not that the browser is at fault', () => {
  assert.equal(noDoorYet(LIVE, actable(waysFor(LIVE)), null), true);
});

test('a browser without WebAuthn on a passkey-only host is the browser, and says so instead', () => {
  const without = { ...LIVE, firstRun: false };
  const ways = waysFor(without, { webauthn: false });
  assert.equal(actable(ways), null);
  /* NOT the first run: a passkey exists, this browser cannot present it, and `passkeyUnusable` is true. */
  assert.equal(noDoorYet(without, actable(ways), 'unsupported'), false);
});

/**
 * THE SEQUENCE THAT IS ACTUALLY WALKED FIRST, and the one the repair regressed on its way past.
 *
 * A record on its first run is claimed by link, which is how `me` becomes non-null while `firstRun`
 * stays true: `firstRun` counts rows in `dir_passkey` (`packages/record/src/identity.ts:356`) and a
 * claim adds none. The signed-in screen offers "Add a passkey on this device" and, beside it, "Sign
 * out". Press the second one and `leave()` sets `me` to null in place while `firstRun` is untouched,
 * so the next render is `signed-out` with `note: 'out'` and an unactable `Ways`: exactly the shape
 * `noDoorYet` was written to catch. It must not catch it. The claim link was spent to get in
 * (`/auth/magic/redeem` is "Spend a sign-in or claim link, once", `packages/host/src/auth.ts:132`),
 * so "open the link you were given" points at a token the host will refuse, and it arrives instead
 * of the confirmation that the press he just made did what he asked.
 */
test('signing out of a first run record is answered by the sign out, not by a spent claim link', () => {
  const out: Partial<Seen> = { step: { at: 'out' } };
  const state = stateOf(seen(LIVE, out));
  assert.equal(state.name, 'signed-out');
  assert.equal(state.name === 'signed-out' ? state.note : null, 'out');
  assert.equal(noDoorYet(LIVE, actable(waysFor(LIVE, out)), 'out'), false);
});

test('somebody already signed in is never told the record has no door', () => {
  const me = { person: 'p_01', email: 'ada@example.com', record: 'studio', provedAt: 1 };
  assert.equal(noDoorYet({ ...LIVE, me }, null, null), false);
});

/**
 * THE MARKUP IS READ AS TEXT, because nothing in this tree renders a Svelte component in a unit test
 * and the three defects above are all in the markup's conditions rather than in a function. A source
 * assertion is a weaker guard than a rendered one and it is the strongest one available here: it
 * fails the day somebody drops the condition, which is exactly how all three arrived.
 */
const PAGE = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

test('the screen has a branch for a record with no door yet', () => {
  assert.match(PAGE, /noDoorYet\(/);
});

/*
 * BOTH READS OF `view.ways` ARE NAMED, because one of them is not enough and that was measured.
 * `/actable\(/` alone stayed green with `return actable(view.ways)` put back to `return view.ways`:
 * the `locked` arm still spelled the word, so the token was present while the state that draws the
 * first run's doors had lost it. A guard that a mutation walks straight past is not a guard.
 */
test('the door block is drawn from ways that can act, not from a Ways object that exists', () => {
  assert.match(PAGE, /return actable\(view\.ways\)/);
  assert.match(PAGE, /actable\(\{ \.\.\.view\.ways, magic: false \}\)/);
});

/**
 * THE DEMO PILL IS GONE, AND WITH IT THE ONE BUTTON THE FIRST RUN HAD LEFT.
 *
 * It opened `/`, which drew the sample business for anybody not signed in. There is no sample now:
 * `/` with no session is this screen, so the pill would have sent a stranger back here. On the first run the claim
 * link sentence is what is left to read, which is the only way in there is.
 */
test('the screen draws no way into a demo, since there is none to open', () => {
  assert.doesNotMatch(PAGE, /copy\.openTheDemo|copy\.demoNeedsNothing/);
  assert.doesNotMatch(PAGE, /class="demo"/);
});

/* MAIL THAT IS NOT GOING OUT: the host answers `magic: 'down'`, the screen reads it rather than losing the whole
   answer, offers no link, and says why in one line. */
test("a host whose mail is down offers no link and the screen says so", () => {
  const down: Methods = { ...LIVE, firstRun: false, magic: 'down' };
  assert.equal(stateOf(seen(down)).name, 'signed-out');
  assert.deepEqual(waysFor(down), { passkey: true, magic: false, key: false, lead: 'passkey', keyOpen: false });
  /* ONE NOTICE FOR EVERY SIGN-IN STATUS SINCE 3 NOV (entry lane): the mail-down line is a warn Notice, and it names the
     ways that still work when there are any. */
  assert.match(PAGE, /host\?\.magic === 'down'[^}]*\}\s*<Notice tone="warn" icon="mail">\{noMail \? copy\.firstDoorMailDown : [^}]*copy\.mailDown\}<\/Notice>/);
  assert.equal(mailHeld(down, actable(waysFor(down)), null), false, 'a passkey exists, so the shared line is right');
});

/**
 * A STRANGER WHO JUST SIGNED UP, ON A HOST WHOSE MAIL IS DOWN. `waysOf` counts `magic: 'down'`
 * as no way, so the first run hands the screen the same empty `Ways` as a record nobody has claimed, and `noDoorYet`
 * said "Open the link you were given when the record was set up" to somebody nobody gave a link. His way in is the
 * letter. Measured red first: with the `magic !== 'down'` taken out of `noDoorYet`, the first assertion below fails.
 */
test('a first run whose mail is down says mail is down, never the claim link', () => {
  const down: Methods = { ...LIVE, magic: 'down' };
  const ways = actable(waysFor(down));
  assert.equal(ways, null);
  assert.equal(noDoorYet(down, ways, 'unsupported'), false);
  assert.equal(mailHeld(down, ways, 'unsupported'), true);
  /* THE BROWSER NOTE GOES TOO: the browser is not why nobody can get in. */
  assert.match(PAGE, /view\.name !== 'signed-out' \|\| noDoor \|\| noMail/);
  /* SIGNING OUT IS STILL ANSWERED BY THE SIGN OUT, and somebody signed in is told neither. */
  assert.equal(mailHeld(down, ways, 'out'), false);
  assert.equal(mailHeld({ ...down, me: { person: 'p_01', email: 'ada@example.com', record: 'studio', provedAt: 1 } }, null, null), false);
  /* THE SENTENCE OFFERS NOTHING HE DOES NOT HAVE: no passkey, no link he was given, no em dash. */
  assert.doesNotMatch(account.firstDoorMailDown, /passkey|you were given|\u2014/u);
  assert.match(account.firstDoorMailDown, /Mail is not going out/);
});
