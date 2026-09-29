/**
 * The landing row of the decide scene, held to the word the app itself uses for its time.
 *
 * WHY THIS EXISTS. `Decide.svelte` draws `history.at(-1)` as the row the accepted proposal writes,
 * and it lands the moment the reader presses Accept. The copy said `3h ago` there, which is the
 * sample's `stamp(-3)` for `seq 4191` and `4192`, so the scene showed a row written a second ago
 * under a time three hours old. The app, for a row under a minute old, says `just now`
 * (`packages/render/src/format.ts`, `since`).
 *
 * THE WORD IS READ FROM `since` ITSELF, not typed here, so the day the app's wording changes this
 * fails instead of agreeing with a copy of the old word. The site has no workspace dependency on
 * render, so it is reached by relative path, the way `test/content.test.ts` reaches the seed.
 *
 * IT SITS IN `test/` AND NOT BESIDE `copy.ts` because the graph gate holds `src/` to its own package: a relative
 * import out of `src/lib` is the cross-package edge `31 §3` layer 3 refuses, and `test/` is where this site already
 * reaches another package's source to check a claim against it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { site } from '../src/lib/copy.ts';
import { since } from '../../../packages/render/src/format.ts';

test('the landing row says what the app says of a row written a moment ago', () => {
  const landing = site.decide.history.at(-1);
  assert.ok(landing, 'the decide scene has a landing row');
  assert.equal(landing.when, since(new Date(0).toISOString(), 0));
});
