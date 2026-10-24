import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstPartyModules } from '@braindog/seed/packs/modules';

import { describe, listingHolds, moduleHolds } from './describe.ts';
import { listingsOf } from './listing.ts';

test('ONE DESCRIPTION OF AN ADD-ON (E21): "N lists and N pages", the same whichever screen asks', () => {
  assert.equal(describe({ lists: 3, pages: 2 }), '3 lists and 2 pages');
  assert.equal(describe({ lists: 1, pages: 1 }), '1 list and 1 page');
  assert.equal(describe({ lists: 4, pages: 0 }), '4 lists');
  assert.equal(describe({ lists: 0, pages: 0 }), '');
  assert.equal(describe(null), '');

  /* A BUILT-IN SAYS THE SAME ON ITS OWN PAGE AND INSTALLED (its module) AS IN THE STORE (its listing). */
  const modules = firstPartyModules();
  const listed = listingsOf({ kennel: null, counts: null });
  for (const m of modules) {
    const l = listed.find((x) => x.key === `module:${m.id}`);
    if (!l) continue;
    assert.equal(describe(listingHolds(l, modules)), describe(moduleHolds(m)), m.id);
  }
  /* A PAGE DRAWN FOR EACH ROW OF A LIST IS NOT ONE A PERSON OPENS BY NAME, so it is not counted. */
  assert.deepEqual(moduleHolds({ id: 'x', registers: ['a'], pages: ['p', 'row'], rowPages: ['row'] }), { lists: 1, pages: 1 });
});
