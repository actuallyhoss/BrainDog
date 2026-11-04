/**
 * The flag list's own shape, and the one property that has to hold when everything else goes wrong.
 *
 * WHAT IS HERE AND WHAT IS IN THE GATE, because the split is not arbitrary. A unit test can see the
 * declarations; only a gate can see the rest of the repository, the calendar and the two builds. So:
 * shape, defaults and fail-closed here; unread flags, expired flags, call-site counts and whether a
 * flag reaches the artefact in `tools/gates/flags.mjs`.
 *
 * AND EVERY TEST BELOW USED TO RUN OVER NOTHING. `FLAGS` is `{}` on purpose and should usually be:
 * *"an empty list is the state this file should usually be in"*. What went unwritten is what that
 * costs the file beside it. Five tests looped `Object.entries(FLAGS)`, the third was
 * `Object.isFrozen({})` over `deepEqual([], [])`, and the fourth stated in present tense that it
 * *"IS the missing-define case, running for real rather than simulated"* about a loop with no
 * iterations. Not one of them could go red, for the reason it named or for any other.
 *
 * SO ONE SYNTHETIC FLAG, BUILT HERE AND NOT PUT IN `FLAGS`. A worked example in the real list is
 * the first thing `tools/gates/flags.mjs` refuses, correctly: *"declared and read nowhere: a branch
 * nobody takes"*. The fixture splices one entry into a COPY of the shipped source instead, at the
 * one anchor that gate already parses on, and runs the copy. Nothing here is reimplemented:
 * `COMPILED`, `ON` and the `Object.freeze` are `flags.ts`'s own three lines, resolving a name that
 * exists.
 *
 * IT WOULD BE ONE EXPORTED LINE IN `flags.ts` INSTEAD, and that line is not written because nothing
 * in the product would call it. `data/call.ts`'s rule is the one that settles it: *"a `call()` that
 * nothing calls would be the exact shape of thing this codebase keeps finding and deleting."* A
 * seam added for a test is a seam, and reading the file the gate already reads costs the product
 * nothing.
 *
 * THE COPY IS LOADED TWICE, WHICH IS WHAT MAKES THE FAIL-CLOSED TEST A TEST. `flags.ts` reads the
 * global `__BRAINDOG_FLAGS__` and falls back to `''`. Loading with it absent is a build that lost
 * its `define`; loading with it naming the flag is the other half. A fallback that opened is now
 * the difference between two answers rather than a sentence about an empty loop.
 *
 * `50 §9` runs these with `node --test` from `apps/web`, like every other test beside them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FLAGS, flags, type Flag } from './flags.ts';
import type { Pref } from './pref.ts';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The name the fixture flag is declared under. Not a `Pref` key, which the second test checks. */
const FIXTURE = 'fixtureOnly';

const DAY = 86_400_000;
const iso = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * The one flag this file has, with every field the shape `Flag` asks for rather than a stub.
 *
 * ITS WINDOW IS RELATIVE TO TODAY, so the last test stays a test. A fixed `until` far in the future
 * would pass that assertion by being unreachable, and a fixed one near today would go red on a
 * morning when nobody had changed anything.
 */
const SYNTHETIC: Flag = {
  why: 'Nothing is undecided. This flag exists only in this test file, so the resolution below has a name to resolve.',
  /* NOT A PERSON, deliberately. `Flag.owner` wants one because a team does not delete a branch, and
     putting a real name against a flag that does not exist is a row somebody would go looking for. */
  owner: 'flags.test.ts',
  since: iso(Date.now() - 30 * DAY),
  until: iso(Date.now() + 30 * DAY),
  issue: 'flags.test.ts',
  ship: false,
  proof: null,
};

/**
 * The shipped file with one flag in it, run.
 *
 * THE ANCHOR IS THE GATE'S ANCHOR. `tools/gates/flags.mjs` finds the list with
 * `source.indexOf('export const FLAGS = {')`, so splicing at that same string means a change of
 * shape that breaks this fixture breaks that gate too, in the same run and for the same reason. A
 * second anchor of its own would be a second thing to keep true.
 */
const OPENS = 'export const FLAGS = {';
const source = readFileSync(new URL('./flags.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
if (!source.includes(OPENS))
  throw new Error(`flags.ts no longer holds ${JSON.stringify(OPENS)}, so this fixture has nothing to splice into`);

const dir = mkdtempSync(join(tmpdir(), 'braindog-flags-'));
const copy = join(dir, 'flags.ts');
writeFileSync(copy, source.replace(OPENS, `${OPENS}\n  ${FIXTURE}: ${JSON.stringify(SYNTHETIC)},`), 'utf8');

/** What one load of the copy came back with: the same two exports `flags.ts` has. */
type Loaded = { FLAGS: Record<string, Flag>; flags: Readonly<Record<string, boolean>> };

/**
 * Load the copy with the build constant set, or with it gone.
 *
 * THE GLOBAL AND NOT A PARAMETER, because `__BRAINDOG_FLAGS__` is what `vite.config.ts` substitutes
 * and what `flags.ts` reads. A loader that passed the value in would be exercising a seam this
 * product does not have, which is the shape of the thing this file is being fixed for. The query
 * string is only what gets a second instance out of the module cache, and the global is removed
 * again immediately, so the real `flags.ts` imported above never sees it.
 */
const GLOBAL = globalThis as unknown as { __BRAINDOG_FLAGS__?: string };
const load = async (compiled: string | undefined, tag: string): Promise<Loaded> => {
  if (compiled === undefined) delete GLOBAL.__BRAINDOG_FLAGS__;
  else GLOBAL.__BRAINDOG_FLAGS__ = compiled;
  try {
    return (await import(`${pathToFileURL(copy).href}?${tag}`)) as Loaded;
  } finally {
    delete GLOBAL.__BRAINDOG_FLAGS__;
  }
};

const off = await load(undefined, 'no-define');
const on = await load(FIXTURE, 'define');
rmSync(dir, { recursive: true, force: true });

/** Every flag there is to check: the shipped list, empty on purpose, and the one built above. */
const entries = Object.entries(off.FLAGS) as [string, Flag][];

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
     way `prefs.mjs`'s own excuse list drifted from it, twice. */
  const prefKeys: Record<keyof Pref, true> = {
    scheme: true,
    text: true,
    density: true,
    lookDensity: true,
    theme: true,
    contrast: true,
    shape: true,
    chars: true,
    suggestPages: true,
    nextStepsHidden: true,
    arrivesBy: true,
    seen: true,
    columns: true,
    nav: true,
    defined: true,
  };
  for (const [name] of entries)
    assert.ok(!(name in prefKeys), `${name} is a flag and a preference. It has to be one of them.`);
});

test('the resolved set is frozen, complete, and boolean', () => {
  /* BOTH THE SHIPPED MODULE AND THE FIXTURE, because they answer different halves. The shipped one
     is `{}` today, so what it asserts is the shape the list will have on the day it is not; the
     fixture is the same three lines over a name that exists, which is the half that can fail now. */
  assert.ok(Object.isFrozen(flags));
  assert.deepEqual(Object.keys(flags).sort(), Object.keys(FLAGS).sort());

  assert.deepEqual(
    Object.keys(off.FLAGS).sort(),
    [...Object.keys(FLAGS), FIXTURE].sort(),
    'the fixture is meant to be the shipped list with one flag added, and the splice did not land',
  );
  assert.ok(Object.isFrozen(off.flags));
  assert.deepEqual(Object.keys(off.flags).sort(), Object.keys(off.FLAGS).sort());

  for (const [name, value] of [...Object.entries(flags), ...Object.entries(off.flags)])
    assert.equal(typeof value, 'boolean', `${name} resolved to a ${typeof value}`);
});

test('with no build constant every flag is off, and with one the flag it names is on', () => {
  /* FAIL CLOSED, AND THIS IS NOW THE ASSERTION THAT SAYS SO. It used to claim it was "the
     missing-define case, running for real rather than simulated" over a loop with no iterations:
     `FLAGS` is empty, so `ON` was never asked about a name and nothing could come back true either
     way. `off` is the copy loaded with `__BRAINDOG_FLAGS__` gone, which is exactly what a build
     that lost its `define` ships, and it must resolve every flag off.

     AND THE OTHER HALF IS WHY THE FIRST HALF MEANS ANYTHING. A resolution hard-wired to `false`
     would pass the loop above and fail the line below, so the two together say the fallback is a
     fallback rather than the only answer this code can give. */
  for (const [name, value] of Object.entries(off.flags))
    assert.equal(value, false, `${name} is on with no build constant, so the fallback fails open`);
  assert.equal(on.flags[FIXTURE], true, `the build constant named ${FIXTURE} and it resolved off anyway`);

  /* And the shipped module, loaded by the import at the top of this file with nothing substituting
     anything, which is the same case over the list that actually ships. */
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
