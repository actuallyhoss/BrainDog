/**
 * Decide's grouping lives in the address, so the one arrangement of the queue worth sending somebody is one a link carries.
 *
 * THE GROUPING WAS THE MISSING HALF. The register list keeps its filters, its search and its sort in the query
 * string; `/decide` kept its group-by in a local `$state` in `+page.svelte`, so pressing *By list*,
 * copying the address and sending it opened the recipient's queue ranked and ungrouped, and a reload did the same to
 * the person who pressed it. The two halves here are the reading (`groupingOf`) and the writing (`groupedAddress`), and
 * the sweep at the bottom holds the page to them, because a pure module the screen does not call is a module that fixes
 * nothing.
 *
 * `50 §9` runs these with `node --test` from `apps/web`, like every other test beside them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A NAMESPACE AND NOT A NAMED IMPORT, so a missing export is one failing test rather than a file that will not load and
   takes the sweep below down with it. */
import * as grouping from './grouping.ts';

const SCREEN = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');

test('the address says how the queue is grouped', () => {
  assert.equal(typeof grouping.groupingOf, 'function', 'grouping.ts exports no groupingOf, so the address is never read');
  assert.equal(grouping.groupingOf(new URL('https://x/decide?group=about')), 'about');
  /* NO PARAMETER IS THE RANKED QUEUE, which is the screen's own default and the one a bare `/decide` has always drawn. */
  assert.equal(grouping.groupingOf(new URL('https://x/decide')), 'none');
  /* A VALUE THIS BUILD DOES NOT KNOW IS THE DEFAULT, not an error and not a group with no key. A link written by a
     later build, or typed by hand, still opens the queue. */
  assert.equal(grouping.groupingOf(new URL('https://x/decide?group=owner')), 'none');
  assert.equal(grouping.groupingOf(new URL('https://x/decide?group=')), 'none');
});

test('pressing a grouping writes it into the address and keeps everything else there', () => {
  assert.equal(typeof grouping.groupedAddress, 'function', 'grouping.ts exports no groupedAddress, so the press writes nothing');
  assert.equal(grouping.groupedAddress(new URL('https://x/decide'), 'about'), '/decide?group=about');
  /* ANOTHER PARAMETER SURVIVES THE PRESS. The address is the screen's whole state, and a grouping that dropped the rest
     of it would be the address losing something every time the segmented control is touched. */
  assert.equal(grouping.groupedAddress(new URL('https://x/decide?lane=agent'), 'about'), '/decide?lane=agent&group=about');
  /* THE DEFAULT IS NOT WRITTEN, so `/decide` stays `/decide` and never becomes `/decide?group=none`, and never a bare
     trailing `?` either, which is what `goto('?')` leaves when the last parameter goes. */
  assert.equal(grouping.groupedAddress(new URL('https://x/decide?group=about'), 'none'), '/decide');
  assert.equal(grouping.groupedAddress(new URL('https://x/decide?group=about&lane=agent'), 'none'), '/decide?lane=agent');
  /* AND A RECORD'S OWN PREFIX IS KEPT, because the path is the browser's and names the record the queue belongs to. */
  assert.equal(grouping.groupedAddress(new URL('https://x/app/studio/decide'), 'about'), '/app/studio/decide?group=about');
});

test('what is written is what is read back', () => {
  for (const g of ['none', 'about'] as const)
    assert.equal(grouping.groupingOf(new URL(grouping.groupedAddress(new URL('https://x/decide?q=1'), g), 'https://x')), g);
});

test('the screen reads its grouping from the address and writes it there, and holds no copy of its own', () => {
  /* THE DEFECT WAS A LOCAL `$state`, so that is the thing looked for. With one in the file, a press could change what
     is drawn and leave the address saying something else, which is the whole of what an address-held arrangement is about. */
  assert.doesNotMatch(SCREEN, /let\s+grouping\s*=\s*\$state/u, 'the grouping is still a local $state, so the address does not carry it');
  assert.match(SCREEN, /groupingOf\(route\.url\)/u, 'the screen does not read its grouping from the address');
  /* REPLACE, NOT PUSH. A grouping is an arrangement of the same queue rather than a place, so Back from a grouped queue
     leaves `/decide` for wherever the reader came from, as `/search`'s typing does. */
  const writes = [...SCREEN.matchAll(/goto\(at\(groupedAddress\([^)]*\)\)[^)]*\)/gu)].map((m) => m[0]);
  assert.ok(writes.length > 0, 'the screen never writes a grouping into the address');
  for (const w of writes) assert.match(w, /replaceState:\s*true/u, `${w} pushes a history entry for an arrangement`);
});
