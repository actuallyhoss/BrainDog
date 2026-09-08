/**
 * The deployment list, held to the one in the package that paints it.
 *
 * TWO LISTS OF THE SAME THING IS ONE LIST AND A MEMORY OF IT. `30 section 2`'s argument for every
 * closed list in this corpus is that "a list enforced only by a validator is a list one code path
 * forgets", and this is the smallest possible instance: `@braindog/theme` decides which deployments
 * have a palette, `apps/web` decides which deployments have a word, and a deployment with a colour
 * and no label is exactly the failure the label exists to prevent.
 *
 * IT IS A TEST AND NOT A GATE, because a test can import both and a gate would have to grep two
 * `as const` arrays out of two packages. `@braindog/theme` is a dependency of this app already
 * (`accent.ts` imports it), and a test is allowed to reach further than a component.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ENVIRONMENTS as PAINTED } from '@braindog/theme';

import { ENV, ENVIRONMENTS, named } from './env.ts';
import { copy } from './copy.ts';

test('every deployment with a palette also has a word', () => {
  assert.deepEqual([...ENVIRONMENTS].sort(), [...PAINTED].sort());
});

test('every deployment has a label, and it is one this product typed', () => {
  /* 50 section 4.5: only text a developer typed into source stays legible under `data-shot`, and a
     label built by concatenation blurs. A screenshot of alpha filed as evidence about production
     is the confusion the badge exists to prevent, one artefact along. */
  const LABEL: Record<string, string> = { alpha: copy.alpha };
  for (const environment of ENVIRONMENTS) {
    const label = LABEL[environment];
    assert.equal(typeof label, 'string', `${environment} has no label in copy.ts`);
    assert.ok(label !== undefined && label.trim().length > 0, `${environment}'s label is empty`);
  }
});

test('a test run is not a deployment', () => {
  /* FAIL TO PRODUCTION. Nothing substitutes `__BRAINDOG_ENV__` under `node --test`, so this run IS
     the missing-define case: an absent constant has to resolve to the shipped product rather than to
     a half-labelled alpha one. If it ever goes red the fallback is no longer being exercised, and
     nothing else checks it. */
  assert.equal(ENV, '');
  assert.equal(named, false);
});

test('production is not a member of the list', () => {
  /* It is the absence of a deployment rather than one of them, which is what makes the shipped
     build's chrome have nothing extra in it at all rather than something that says "Production". */
  assert.ok(!(ENVIRONMENTS as readonly string[]).includes(''));
  assert.ok(!(ENVIRONMENTS as readonly string[]).includes('production'));
});
