/**
 * THE OWNER'S HOUSEKEEPING SCREENS (lane C4): Signing in, People & sharing, Backups, Billing and
 * Delete, read from their own text, the way `one-list.test.ts` reads the areas. Each test names the row it holds.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = (path: string): string => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
/* THE MARKUP ONLY: what follows the script block, so a comment or a word list above it is not read as a drawn line. */
const markup = (text: string): string => text.slice(text.lastIndexOf('</script>'));

test('X18: Signing in offers one Add a passkey, in Passkeys, and the You row links down to it', () => {
  const identity = markup(src('./areas/Identity.svelte'));
  const recovery = markup(src('./areas/Recovery.svelte'));
  /* THE YOU ROW SAYS THE COUNT AND LINKS DOWN, never a second Add a passkey beside the one in Passkeys. */
  assert.doesNotMatch(identity, /<span class="fact-do">\s*<Button[^>]*>\{copy\.addPasskey\}/u, 'the You row still draws its own Add a passkey');
  assert.match(identity, /href="#passkeys"/u, 'the You row does not link down to Passkeys');
  assert.match(recovery, /<Tile[^>]*id="passkeys"[^>]*title=\{copy\.passkeys\}/u, 'the Passkeys tile has no anchor to link to');
});

test('X18: Kept on this device is drawn only once something is kept, or was just forgotten', () => {
  const sessions = src('./areas/Sessions.svelte');
  assert.doesNotMatch(sessions, /Nothing of this record is kept on this device yet/u, 'the empty kept card is still said');
  assert.match(markup(sessions), /\{#if forgot \|\| \(kept !== null && kept\.answers > 0\)\}\s*<Tile icon="download"/u, 'the kept card is drawn with nothing kept');
});

test('X19: links and shares are one Shared card, full width, and People mounts neither Links nor the linking card', () => {
  const people = markup(src('./areas/People.svelte'));
  const sharing = markup(src('./areas/Sharing.svelte'));
  const health = markup(src('./areas/Health.svelte'));
  assert.doesNotMatch(people, /<Links\b/u, 'People still draws its own Links card');
  assert.doesNotMatch(people, /<Understand\b/u, 'the linking card is still in People & sharing');
  /* THE SHARED CARD HOLDS THE LINKS, and keeps the column's width when it holds only its empty state. */
  const shared = /<Tile icon="link" data-wide="" title=\{copy\.sharingShared\} count=\{[^}]*\}>([\s\S]*?)<\/Tile>/u.exec(sharing)?.[1];
  assert.ok(shared, 'the Shared card is not full width');
  assert.match(shared, /<Links inside\b/u, 'the links are not inside the Shared card');
  /* AND THE WALK THAT LINKS OLD PAYMENTS IS TIDYING, so it is under Tidy up, for an owner. */
  assert.match(health, /\{#if s\.anOwner\}<Understand \/>\{\/if\}/u, 'Tidy up does not hold the linking card');
});

test('X19: Links drawn inside a card says nothing until there is a link', () => {
  const links = src('./Links.svelte');
  assert.match(links, /inside = false/u);
  assert.match(markup(links), /\{#if inside\}\s*\{#if links !== null && links\.length > 0\}/u, 'an inside Links draws with no links');
});

test('X23: Billing and Delete say their name once, and Delete says no error before a wrong try', () => {
  const billing = markup(src('./areas/Billing.svelte'));
  const del = src('./areas/Delete.svelte');
  assert.doesNotMatch(billing, /title=\{copy\.billing\}/u, 'the self-host card is titled Billing under a Billing page');
  assert.match(billing, /title=\{copy\.billingNotBilled\}/u);
  assert.doesNotMatch(markup(del), /title=\{copy\.deleteRecord\}/u, 'the card is titled Delete this record under a page of that name');
  /* NOTHING UNDER THE FIELD BEFORE A PRESS: the hint was there before anything was typed and read as an error. */
  assert.doesNotMatch(markup(del), /:else if !matches\}\{words\.exactly/u, 'the hint is drawn before a wrong try');
});

test('X25, X26: What comes in gives a self-host its one command, and the web addresses say no "token" and put the line first', async () => {
  const { automations } = await import('../../../lib/copy/automations.ts');
  const ingest = markup(src('./areas/Ingest.svelte'));
  const doors = src('../../../lib/ui/WebhookDoors.svelte');
  assert.match(ingest, /<CodeLine text=\{addressCommand\(origin, shell\.index\.slug\)\} \/>/u, 'the self-host card has no command to copy');
  assert.doesNotMatch(ingest, /mailWords\.unroutedDoes/u);
  assert.doesNotMatch(automations.doorsHow, /token/iu);
  assert.match(automations.doorsHow, /private/iu);
  /* THE BUTTON FOLLOWS ITS LINE, in the body, not in the heading's corner where it wrapped above the line. */
  const body = markup(doors);
  assert.ok(body.indexOf('{copy.doorsHow}') < body.indexOf('{actionWords.newDoor}'), 'New web address stands above its line');
  assert.doesNotMatch(body.slice(0, body.indexOf('{copy.doorsHow}')), /actionWords\.newDoor/u);
});

test('X20: Backups says Needs you, one line per state, and how each going back is done', async () => {
  const { account } = await import('../../../lib/copy/account.ts');
  const { SUPPORT_EMAIL } = await import('../../../lib/copy/shell.ts');
  const backups = src('./areas/Backups.svelte');
  assert.doesNotMatch(backups, /in Decide/u, 'the missed night still sends him to Decide, which the bar calls Needs you');
  /* A MISSED NIGHT SAYS WHAT HAPPENS NEXT IN ONE LINE: tonight tries again, with no errand to run before then. */
  assert.match(backups, /missedLine: 'Tries again tonight\.'/u);
  /* THE SELF-HOST'S KEY IS NAMED, on a self-host, never "if you run BrainDog yourself". */
  assert.doesNotMatch(account.theKeyWhere, /If you run BrainDog yourself/u);
  assert.match(account.theKeyWhere, /key file next to your data/u, 'the key file is not named');
  /* GOING BACK SAYS HOW, on each host: the Cloud by writing to us, a self-host by the one command. */
  assert.match(account.restoreNotHere, new RegExp(SUPPORT_EMAIL.replace('.', '\\.'), 'u'), 'the Cloud does not say who to ask');
  assert.match(account.restoreSelfHostRestore, /braindog restore/u, 'a self-host is not told the command');
  /* NO "COPIES ABOVE" OVER NO COPY, and no "No backup yet" under "First copy tonight". */
  const area = markup(backups);
  assert.match(area, /copyLines\.length > 0 \? copy\.restoreLive : copy\.restoreFirst/u, 'the copies above are named with none above');
  assert.match(area, /title=\{firstTonight \? copy\.copiesFirst : copy\.noSnapshots\}/u, 'First copy tonight and No backup yet are both said');
  /*: the night's copy is a row of its own, the exports another, and a night that did
     not run is said once, with no "No nightly copies" under it. */
  assert.match(area, /\{:else if !failedNight && !missed\}[\s\S]*?words\.noNightly/u, 'a night that did not run is said twice');
  assert.match(area, /title=\{words\.exports\}/u, 'the exports he took are not said');
});
