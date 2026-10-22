/**
 * The kinds' keys table (`kinds/keys.ts`) names the registry's kinds, in its order, with each module's own keys.
 *
 * `drawn.ts` and `block-keys.ts` read the table and not the modules, so a screen does not load six kinds' code to learn
 * six names. That is only right while the two agree: a kind added to `BLOCK_KIND_MODULES` and not to the table would be
 * judged empty by `drawn.ts` and have its keys refused at install.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCK_KIND_MODULES } from '../src/kinds/index.ts';
import { KIND_KEYS, isRegisteredKind } from '../src/kinds/keys.ts';

test('the table and the registry name the same kinds in the same order', () => {
  assert.deepEqual(Object.keys(KIND_KEYS), Object.keys(BLOCK_KIND_MODULES));
});

test("each module's keys are the table's", () => {
  for (const [kind, module] of Object.entries(BLOCK_KIND_MODULES)) assert.equal(module.keys, KIND_KEYS[kind as keyof typeof KIND_KEYS], kind);
});

test('a kind the registry does not hold, or a name Object lends, is not registered', () => {
  assert.equal(isRegisteredKind('calendar'), true);
  assert.equal(isRegisteredKind('table'), false);
  assert.equal(isRegisteredKind('constructor'), false);
});
