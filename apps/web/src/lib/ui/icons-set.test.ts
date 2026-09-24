/**
 * A declared icon draws from all 251 glyphs, not only the 63 the app drew for itself.
 *
 * BEFORE THIS FILE, `icon: rocket` ON A PAGE DREW A DOCUMENT. `iconFor` checked the name against
 * `icons.ts` alone, so every name in `braindog-render/glyphs` that the app had not also drawn by hand
 * (188 of the set, and the core's Lucide names such as `house`) fell back to the kind's glyph. The set
 * was shipped as data and no screen of the app could reach it. And `Icon` given a name outside the
 * app's own map drew `<path>` with no `d`, an empty box, because `PATHS[name]` was undefined.
 *
 * THE ORDER IS THE APP'S, THEN THE CORE, THEN THE SET, and the first test below is why the order
 * matters: `home`, `search` and `inbox` are drawn by both the app and the core, differently, and the
 * rail has been drawing the app's for months. A lookup that asked the core first would redraw the
 * shell under everybody the day this landed.
 *
 * WHAT A GREEN RUN HERE DOES NOT PROVE: that the set stays out of the entry chunk. `node --test` has
 * no bundler, so a static import of `set.ts` would pass every line of this file. That is the
 * `bundle` gate's claim, measured after a build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { CORE, loadSet } from 'braindog-render/glyphs';
import { iconFor } from '../record/api.ts';
import { PATHS } from './icons.ts';

/* THE COMPONENT IS COMPILED HERE, FOR THE SERVER, because `node --test` cannot load a `.svelte` file
   and the last claim below is about what `Icon` draws rather than about what a lookup answers. Same
   hook as `braindog-render`'s `table-cards.test.ts`. The server build runs no effect, so what it
   draws is what the component has on hand at mount, which is exactly the question for the core. */
registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

/* By URL and after the hook, so the hook is registered before the component is loaded, and so the
   type checker, which has no Svelte compiler in a `.ts` file, does not go looking for it. */
const { default: Icon } = (await import(new URL('./Icon.svelte', import.meta.url).href)) as {
  default: Component<{ name: string; size?: 's' | 'm' | 'l' | 'xl'; title?: string }>;
};

/** The one `d` the component drew, or undefined when it drew a path with none. */
const drawn = (name: string): string | undefined => {
  const body = render(Icon, { props: { name } }).body;
  return /<path d="([^"]*)"/.exec(body)?.[1];
};

test('the app draws its own glyph first, where the core draws the same name differently', () => {
  for (const name of ['home', 'search', 'inbox'] as const) {
    assert.equal(iconFor(name, 'doc'), name);
    assert.equal(drawn(name), PATHS[name]);
  }
  /* The premise, checked rather than assumed: if the two ever agreed this test would prove nothing. */
  assert.notEqual(PATHS.search, CORE.search);
});

test('a core glyph the app never drew resolves, and draws at mount without waiting on the set', () => {
  assert.equal(Object.hasOwn(PATHS, 'house'), false);
  assert.equal(iconFor('house', 'doc'), 'house');
  assert.equal(drawn('house'), CORE.house);
});

test('a glyph only the set holds is a name the check accepts before the set has arrived', () => {
  assert.equal(Object.hasOwn(PATHS, 'rocket'), false);
  assert.equal(Object.hasOwn(CORE, 'rocket'), false);
  assert.equal(iconFor('rocket', 'doc'), 'rocket');
});

test('an unknown name, or one off the prototype, still falls back', () => {
  assert.equal(iconFor('nosuch', 'doc'), 'doc');
  assert.equal(iconFor(undefined, 'rows'), 'rows');
  assert.equal(iconFor('', 'rows'), 'rows');
  /* A document is free text, so `constructor` in an `icon:` must not come back as a function. */
  assert.equal(iconFor('constructor', 'doc'), 'doc');
  assert.equal(iconFor('toString', 'doc'), 'doc');
});

test('every glyph in the set is a name the check accepts, so the list the app carries cannot drift', async () => {
  const set = await loadSet();
  const refused = Object.keys(set).filter((name) => iconFor(name, 'doc') !== name);
  assert.deepEqual(refused, []);
  assert.equal(Object.keys(set).length, 188);
});

test('Icon given rocket draws the set path once the set has arrived', async () => {
  const set = await loadSet();
  /* Arrival goes through the app's own loader, which is what a mounted `Icon` calls, so the second
     render finds it in hand. */
  const { glyphSet } = await import('./icons.ts');
  await glyphSet();
  assert.equal(drawn('rocket'), set.rocket);
  assert.match(set.rocket!, /^M12 15v5s3\.03-\.55 4-2/);
});
