/**
 * Three sentences and one button that were wrong for the first person to sign in on the Cloud.
 *
 * WHAT WAS MEASURED, AND IT IS WHY THIS FILE EXISTS. `loop/research-first-sign-in.md` drove the
 * Worker locally the way production runs it, provisioned a record, claimed it through the link and
 * a passkey Chrome's own WebAuthn stack made, and read every settings area as it came. Section 3
 * frictions 6, 10 and 11 are held here:
 *
 *   6. Settings > Agents, with no machine yet, told him to run `braindog login`. The CLI refuses
 *      that without a host, and the "Connect an agent" block further down the same area already
 *      printed the line that works, because `connectLines` builds it.
 *  10. After Sign out on Settings > Identity, "Signed in as owner@example.test" stayed in the table
 *      beside "You are signed out.", and the Sign in button was `href="/app/signin"` with no
 *      `next`, so the sign-in that followed landed on the kept sample (friction 1).
 *  11. Backups drew "Back up now" under the record's own sentence saying this host keeps no copies
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

const PAGE = readFileSync(new URL('./[area]/+page.svelte', import.meta.url), 'utf8')
  .replaceAll(/<!--[\s\S]*?-->/gu, '')
  .replaceAll(/\/\*[\s\S]*?\*\//gu, '');

/** The markup of one area, from its own arm to the next `{:else if area === …}`. */
function area(name: string): string {
  const from = PAGE.indexOf(`area === '${name}'}`);
  assert.ok(from >= 0, `${name} has no arm in the markup`);
  const to = PAGE.indexOf("{:else if area === '", from + 1);
  return PAGE.slice(from, to < 0 ? PAGE.length : to);
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

test('friction 6: an area with no machine yet hands over the login line that names this record', () => {
  const agents = area('agents');
  const empty = /<Empty kind="no-data-yet" title=\{copy\.noDevices\}[^>]*>/u.exec(agents)?.[0];
  assert.ok(empty, 'the machines section no longer has its empty state, so this is about nothing');
  /* `copy.enrollPrompt` IS `braindog login` WITH NOTHING AFTER IT, which the CLI refuses. */
  assert.doesNotMatch(empty, /copy\.enrollPrompt/u, 'the empty state still prints `braindog login` with no host');
  assert.match(empty, /agentPrompt=\{lines\.login\}/u, 'the empty state does not print the line `connectLines` builds');
  /* AND THAT LINE IS THE ONE THE CLOUD'S DEVICE FLOW TAKES, measured against the CLI's own refusal. */
  assert.equal(connectLines('https://app.brain.dog', 'sam').login, 'braindog login https://app.brain.dog/app/sam');
});

test('friction 10: once signed out, nobody is named as signed in, and Sign in comes back here', () => {
  const identity = area('identity');
  const row = identity.indexOf('copy.signedInAs');
  assert.ok(row >= 0, 'the Signed in as row is gone entirely, so this is about nothing');
  assert.match(enclosing(identity, row), /!signedOut\b/u, 'the Signed in as row is drawn after Sign out');
  assert.match(PAGE, /signedOut = true/u, 'nothing records that the sign-out went through');

  const signIn = /<Button href=\{?([^>]*?)\}?>\{copy\.signIn\}<\/Button>/u.exec(identity);
  assert.ok(signIn, 'the Sign in button is gone, so this is about nothing');
  assert.equal(signIn[1], 'signinFor(page.url)', 'Sign in is handed no `next`, so it lands on the front door');
});

test('friction 11: Back up now is drawn only where the record answered with its copies', () => {
  const backups = area('backups');
  const button = backups.indexOf('copy.snapshotNow');
  assert.ok(button >= 0, 'Back up now is gone, so this is about nothing');
  const when = enclosing(backups, button);
  assert.match(when, /\banOwner\b/u, 'the button is drawn to a colleague');
  /* `reading` IS NOT AN ANSWER EITHER: a button that is drawn and then taken away is one somebody presses. */
  assert.match(when, /copiesFrom === 'live'/u, 'Back up now is drawn without asking whether the record answered');
  assert.doesNotMatch(when, /copiesFrom !== 'live'|copiesFrom !== 'sample'/u);
});
