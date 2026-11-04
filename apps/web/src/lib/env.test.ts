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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

/**
 * AND THE FOUR PLACES THE MECHANISM HAS TO BE PLUGGED IN, checked as source.
 *
 * Every one of them was missing, and every one of them was described in the present tense by a
 * comment somewhere: `env.ts` said "`vite.config.ts` substitutes a literal" and nothing defined
 * `__BRAINDOG_ENV__`; `EnvBadge.svelte` said "it is in the DOM on every screen that has chrome" and
 * `grep -rn EnvBadge` over the whole repository returned its own file; the same header said
 * "`title.ts` carries the other half" and `title.ts` had no environment in it at all; and
 * `tokens.css` `@import`ed the production palette on every deployment's behalf. Four halves of one
 * mechanism, each with prose asserting it was whole.
 *
 * A SOURCE GREP IS THE RIGHT SHAPE HERE AND IT IS WORTH SAYING WHY. What went wrong was not a
 * behaviour — nothing computed the wrong answer, and there was nothing to compute, which is exactly
 * why no behavioural test failed. `named` folds to `false` under `node --test`, so a test that
 * rendered the shell would draw the production chrome and pass. The defect was that four wires were
 * not connected, and the cheapest honest check for a wire is to look for it.
 */
const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('the build substitutes the environment, and throws on one it does not know', () => {
  const config = read('../../vite.config.ts');
  assert.match(config, /__BRAINDOG_ENV__:\s*JSON\.stringify\(ENV\)/, 'vite.config.ts defines nothing');
  assert.match(config, /throw new Error/, 'an unknown BRAINDOG_ENV builds production quietly');
  assert.match(config, /ENVIRONMENTS/, 'the list is retyped rather than imported');
});

test('the shell says which deployment it is, and the palette follows it', () => {
  /* THE BADGE IN THE CORNER IS GONE, and that was a call, not an oversight. It sat above the
     launcher and read as decoration on the one control that is meant to be the only floating thing
     on the screen. What `13 §5.1` actually requires is that the deployment is not carried by colour
     ALONE — and it is not: the tab reads `· BrainDog Alpha` and the favicon is the alpha mark, both
     of which are legible to a reader who cannot tell the two accents apart, and both of which are
     visible from outside the window rather than only inside it. */
  const layout = read('./shell/AppFrame.svelte');
  /* THE PALETTE IS THE ROOT LAYOUT'S, so a signed-out screen has it too; the frame keeps the mark. */
  assert.match(read('../routes/+layout.svelte'), /@braindog\/skin\/house\.css/u, 'the app does not import a palette it can alias');
  assert.match(layout, /mark-alpha\.svg/u, 'the deployment has no favicon of its own');

  /* NOT A `doesNotMatch` OVER THE WHOLE FILE, because the comment that replaced the `@import`
     quotes the line it replaced — so the first version of this assertion failed on the paragraph
     explaining why it exists. A statement is a line that starts with one. */
  const tokens = read('../../../../packages/skin/tokens.css');
  const imports = tokens.split(/\r?\n/u).filter((line) => line.trimStart().startsWith('@import'));
  assert.deepEqual(imports, [], 'the shared token layer drags one palette into every deployment');
});

test('and the tab says which deployment it is', () => {
  const title = read('./title.ts');
  assert.match(title, /from '\$lib\/env\.ts'/, 'title.ts does not know what a deployment is');
  assert.match(title, /copy\.alpha/, 'the word in the tab is not the word on the screen');
});
