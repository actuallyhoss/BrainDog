/** BrainDog's own upkeep is told by what an add-on declares, never by its name. */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isUpkeep } from './hub.ts';

const decls = {
  kit: { pack: 'machines', role: 'carry' },
  locks: { pack: 'machines' },
  ledger: { pack: 'money' },
} as Record<string, { pack?: string }>;

test("AN ADD-ON THAT KEEPS WHAT EACH MACHINE CARRIES (the `carry` role) is upkeep, its rules and the rules over its lists", () => {
  assert.equal(isUpkeep({ pack: 'machines', register: null }, decls), true);
  assert.equal(isUpkeep({ pack: null, register: 'locks' }, decls), true);
  assert.equal(isUpkeep({ pack: null, register: 'ledger' }, decls), false);
  assert.equal(isUpkeep({ pack: 'money', register: 'ledger' }, decls), false);
  assert.equal(isUpkeep({ pack: null, register: 'unknown' }, decls), false);
});
