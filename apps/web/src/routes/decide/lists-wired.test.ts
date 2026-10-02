/**
 * BOTH DECIDE SCREENS HAND THE HINT THE LISTS, not only the level.
 *
 * `whyNotAnswering` learned the colleague sentence earlier, and `page.test.ts` holds its
 * words. Neither screen passed it `me.lists`, so the function's second argument defaulted to `null`
 * on every call in the product and a bookkeeper given `write` on Expenses still read "This needs
 * decide, and you have read access." on `/decide` and on `/decide/<id>`. A sentence nobody is handed
 * is a sentence nobody reads, and svelte-check cannot see it: dropping an optional argument
 * type-checks. So this reads the two screens' own text, the way `page.test.ts` reads the queue's.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const screen = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('every call to whyNotAnswering on both decide screens is handed the shell’s lists', () => {
  for (const path of ['./+page.svelte', './Classic.svelte', './[id]/+page.svelte']) {
    const calls = screen(path).match(/whyNotAnswering\([^)]*\)/gu) ?? [];
    assert.ok(calls.length > 0, `${path} no longer asks whyNotAnswering at all`);
    for (const call of calls) assert.equal(call, 'whyNotAnswering(me.level, me.lists)', `${path} asks without the lists`);
  }
});
