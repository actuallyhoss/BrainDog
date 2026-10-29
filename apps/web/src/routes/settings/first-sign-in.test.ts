/**
 * Three sentences and one button that were wrong for the first person to sign in on the Cloud.
 *
 * WHAT WAS MEASURED, AND IT IS WHY THIS FILE EXISTS. A walk drove the
 * Worker locally the way production runs it, provisioned a record, claimed it through the link and
 * a passkey Chrome's own WebAuthn stack made, and read every settings area as it came. Three of
 * the things it found are held here:
 *
 *   - Settings > Agents, with no machine yet, told him to run `braindog login`. The CLI refuses
 *      that without a host, and the "Connect an agent" block further down the same area already
 *      printed the line that works, because `connectLines` builds it.
 *   - After Sign out on Settings > Identity, "Signed in as owner@example.test" stayed in the table
 *      beside "You are signed out.", and the Sign in button was `href="/signin"` with no
 *      `next`, so the sign-in that followed landed on the kept sample.
 *   - Backups drew "Back up now" under the record's own sentence saying this host keeps no copies
 *      the app can take, and the press answered with that same refusal as a toast.
 *
 * A TEXT TEST OVER MARKUP, for the reason `levels.test.ts` gives: these are `{#if}` arms in a
 * `.svelte` file and this tree has no component test. The comments are stripped first, so a
 * comment that quotes the old defect cannot fail or pass a check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { connectLines } from '../../lib/record/device.ts';

/** One area's file without its comments: each area is its own component since the settings split. */
function area(name: string): string {
  return readFileSync(new URL(`./[area]/areas/${name.charAt(0).toUpperCase()}${name.slice(1)}.svelte`, import.meta.url), 'utf8')
    .replaceAll(/<!--[\s\S]*?-->/gu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '');
}

/** The condition of the innermost `{#if}` still open at `at` in `markup`. */
function enclosing(markup: string, at: number): string {
  const stack: string[] = [];
  const block = /\{#if\s([^}]*)\}|\{:else(?:\s+if\s([^}]*))?\}|\{\/if\}/gu;
  for (let m = block.exec(markup); m !== null && m.index < at; m = block.exec(markup)) {
    if (m[1] !== undefined) stack.push(m[1]);
    else if (m[0] === '{/if}') stack.pop();
    else stack[stack.length - 1] = m[2] ?? `not (${stack[stack.length - 1] ?? ''})`;
  }
  return stack.join(' && ');
}

/* THE AREA NO LONGER HAS A MACHINES LIST WITH ITS OWN EMPTY STATE: the setup card hands over the line, and the
   check on the markup went with the markup it read. What stays is the fact the check was about: the line names the
   record, because the Cloud's device flow refuses one that does not. */
test('the line that signs a machine in names this record', () => {
  assert.equal(connectLines('https://app.brain.dog', 'studio').setup, 'braindog setup https://app.brain.dog/studio');
});

test('once signed out, nobody is named as signed in, and Sign in comes back here', () => {
  const identity = area('identity');
  const row = identity.indexOf('copy.signedInAs');
  assert.ok(row >= 0, 'the Signed in as row is gone entirely, so this is about nothing');
  assert.match(enclosing(identity, row), /!signedOut\b/u, 'the Signed in as row is drawn after Sign out');
  assert.match(identity, /signedOut = true/u, 'nothing records that the sign-out went through');

  const signIn = /<Button href=\{?([^>]*?)\}?>\{copy\.signIn\}<\/Button>/u.exec(identity);
  assert.ok(signIn, 'the Sign in button is gone, so this is about nothing');
  assert.equal(signIn[1], 'signinFor(page.url)', 'Sign in is handed no `next`, so it lands on the front door');
});

test('Back up now is drawn only where the record answered with its copies', () => {
  const backups = area('backups');
  const button = backups.indexOf('copy.snapshotNow');
  assert.ok(button >= 0, 'Back up now is gone, so this is about nothing');
  const when = enclosing(backups, button);
  assert.match(when, /\banOwner\b/u, 'the button is drawn to a colleague');
  /* `reading` IS NOT AN ANSWER EITHER: a button that is drawn and then taken away is one somebody presses. */
  assert.match(when, /copiesFrom === 'live'/u, 'Back up now is drawn without asking whether the record answered');
  assert.doesNotMatch(when, /copiesFrom !== 'live'|copiesFrom !== 'sample'/u);
});
