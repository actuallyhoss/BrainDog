/**
 * A COLLEAGUE ON ONE LIST IS NOT A READER OF THE RECORD, on the two settings screens that said so.
 *
 * Measured through the real seed with a bookkeeper given `write` on
 * Expenses and no record level. `/settings/identity` drew `copy.levelMeans[me.level]` from the
 * shell's `read` fallback, "Can read, cannot change", to somebody whose whole job is changing rows.
 * And People drew a waiting invitation (`level: null, registers: { expenses:
 * 'write' }`) through `inv.level ?? 'read'`, "Reads", which told the owner a bookkeeper would read the
 * whole business. Both type-checked, because `read` is a word the ladder knows, so this reads the
 * screen's own text, the way `decide/page.test.ts` reads the queue's.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/* EACH AREA IS ITS OWN COMPONENT since the settings split, so each check reads the area it is about. */
const people = readFileSync(fileURLToPath(new URL('./areas/People.svelte', import.meta.url)), 'utf8');
const identityArea = readFileSync(fileURLToPath(new URL('./areas/Identity.svelte', import.meta.url)), 'utf8');

test('a waiting invitation with no record level is never drawn as a record-wide read', () => {
  assert.doesNotMatch(people, /inv\.level \?\? 'read'/u, 'a one-list invitation is listed as Reads');
  assert.match(people, /copy\.inviteWaitingRow\(inviteGives\(inv\),/u);
  /* AND WHAT IT GIVES IS THE LISTS IT CARRIES, each at its own level. */
  assert.match(people, /Object\.entries\(inv\.registers\)\.map\(\(\[id, level\]\) => `\$\{listName\(id\)\}: \$\{levelSaid\(level\)\}`\)/u);
});

test('/settings/identity names the lists a one-list colleague holds instead of a level they do not', () => {
  const identity = identityArea.match(/<span class="fact-key">\{copy\.onThisRecord\}<\/span><span class="fact-value">\{([^\n]*)\}<\/span>/u)?.[1];
  assert.ok(identity !== undefined, 'the identity area no longer says what you hold on this record');
  assert.ok(identity.startsWith('me.lists && me.lists.length > 0 ? namesOf(me.lists) : '), `the identity line reads only the level: ${identity}`);
});
