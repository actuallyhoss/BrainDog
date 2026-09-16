/** Each use case's name, kept apart for the feed, is the title the use case itself carries. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { USE_CASES } from '../src/usecases/index.ts';
import { USE_CASE_NAMES, useCaseName } from '../src/usecases/names.ts';

test('every starter use case is named as its title says, and no name is left over', () => {
  assert.deepEqual(Object.fromEntries(USE_CASES.map((u) => [u.usecase, u.title])), { ...USE_CASE_NAMES });
});

test('a use case this build does not ship is named from its id', () => {
  assert.equal(useCaseName('team'), 'Team board');
  assert.equal(useCaseName('book-club'), 'Book club');
});
