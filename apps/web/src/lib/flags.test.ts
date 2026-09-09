/**
 * The flag list's own shape, and the one property that has to hold when everything else goes wrong.
 *
 * WHAT IS HERE AND WHAT IS IN THE GATE, because the split is not arbitrary. A unit test can see the
 * declarations; only a gate can see the rest of the repository, the calendar and the two builds. So:
 * shape, defaults and fail-closed here; unread flags, expired flags, call-site counts and whether a
 * flag reaches the artefact in `tools/gates/flags.mjs`.
 *
 * `50 section 9` runs these with `node --test` from `apps/web`, like every other test beside them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FLAGS, flags, type Flag } from './flags.ts';
import type { Pref } from './pref.ts';

const entries = Object.entries(FLAGS) as [string, Flag][];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

test('every flag declares everything a reviewer and a gate need', () => {
  for (const [name, f] of entries) {
    assert.ok(ISO_DAY.test(f.since), `${name}: since is "${f.since}", and it has to be an ISO day`);
    assert.ok(ISO_DAY.test(f.until), `${name}: until is "${f.until}", and it has to be an ISO day`);
    assert.ok(Date.parse(f.until) > Date.parse(f.since), `${name}: until is not after since`);
    /* A REMOVAL REFERENCE, ALWAYS. A flag with nowhere to look up why it is still here is the
       definition of permanent branching - nobody can tell whether the decision was taken and the
       deletion forgotten, or whether the decision is still open. */
    assert.ok(f.issue.trim().length > 0, `${name}: has no issue, so its removal is tracked nowhere`);
    /* AND A SENTENCE LONG ENOUGH TO BE ONE. `dead-copy`'s allow-list makes the same demand of its
       excuses, for the same reason: a two-word `why` is a label, and a label does not survive the
       six weeks between adding a flag and finding it again. */
    assert.ok(f.why.trim().length > 40, `${name}: its "why" is too short to tell a debt from a mistake`);
    assert.equal(typeof f.ship, 'boolean', `${name}: ship must be a boolean, not a value`);
  }
});

test('a flag name is never also a preference', () => {
  /* THE TWO MECHANISMS MUST NOT BLUR. `pref.ts` is per device, reversible by the reader, and read
     by the shell before first paint; a flag is per build and not the reader's to set. A name that
     is both is a control somebody will look for in Settings and a branch somebody will look for in
     a diff, and neither of them will find it.

     The type is the authority, not a list typed here - a list would drift from `Pref` exactly the
     way `prefs.mjs`'s own excuse list drifted from it. */
  const prefKeys: Record<keyof Pref, true> = {
    scheme: true,
    text: true,
    density: true,
    theme: true,
    contrast: true,
    sidebar: true,
    chars: true,
    suggestPages: true,
    seen: true,
    columns: true,
    nav: true,
    defined: true,
    sampleSaid: true,
  };
  for (const name of Object.keys(FLAGS))
    assert.ok(!(name in prefKeys), `${name} is a flag and a preference. It has to be one of them.`);
});

test('the resolved set is frozen, complete, and boolean', () => {
  assert.ok(Object.isFrozen(flags));
  assert.deepEqual(Object.keys(flags).sort(), Object.keys(FLAGS).sort());
  for (const [name, value] of Object.entries(flags))
    assert.equal(typeof value, 'boolean', `${name} resolved to a ${typeof value}`);
});

test('with no build constant every flag is off', () => {
  /* FAIL CLOSED, and this is the assertion that says so. `flags.ts` reads `__BRAINDOG_FLAGS__` and
     falls back to `''` when the define is missing - which is what happens under `node --test`,
     where nothing substitutes anything. So this test IS the missing-define case, running for real
     rather than simulated: a build that lost its `define` ships the product as it was before any
     flag was added.

     If this ever goes red because a flag came back true, the define reached the test runner and the
     fallback is no longer being exercised - which is worth knowing, because it means nothing checks
     the fallback any more. */
  for (const [name, value] of Object.entries(flags))
    assert.equal(value, false, `${name} is on with no build constant, so the fallback fails open`);
});

test('a flag never claims to be its own removal date', () => {
  /* The gate holds the window - the number lives in `budgets.json`, because "a gate that holds its
     own number is a number nobody reviews". What is asserted here is the part that needs no budget:
     a flag with `until` in the past is already broken at the moment it is written, and finding that
     out in CI ninety days later is finding it out too late. */
  const today = new Date().toISOString().slice(0, 10);
  for (const [name, f] of entries)
    assert.ok(f.until > today, `${name} expired on ${f.until}. Remove the flag and the branch.`);
});
