/**
 * A declared icon draws from all 251 glyphs, not only the 69 the app draws for itself, and the app's
 * own are the design system's icon shapes, drawn as the elements they are.
 *
 * BEFORE THIS FILE, `icon: rocket` ON A PAGE DREW A DOCUMENT. `iconFor` checked the name against
 * `icons.ts` alone, so every name in `braindog-render/glyphs` that the app had not also drawn by hand
 * (188 of the set, and the core's Lucide names such as `house`) fell back to the kind's glyph. The set
 * was shipped as data and no screen of the app could reach it. And `Icon` given a name outside the
 * app's own map drew `<path>` with no `d`, an empty box, because `PATHS[name]` was undefined.
 *
 * THE ORDER IS THE APP'S, THEN THE CORE, THEN THE SET, and the first test below is why the order
 * matters: `home`, `search` and `inbox` are drawn by both the app and the core, differently, and the
 * rail draws the app's. A lookup that asked the core first would redraw the shell under everybody.
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
import { HAND, PATHS, parseShapes, pathOf, type Shape } from './icons.ts';

/* THE COMPONENT IS COMPILED HERE, FOR THE SERVER, because `node --test` cannot load a `.svelte` file
   and the claims below are about what `Icon` draws rather than about what a lookup answers. Same
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
const { default: IconWell } = (await import(new URL('./IconWell.svelte', import.meta.url).href)) as {
  default: Component<{ name: string; size?: 'm' | 'l'; tone?: string }>;
};

const body = (name: string): string => render(Icon, { props: { name } }).body;

/** The shapes the component drew, read back off its markup, attributes and all. */
const drawnShapes = (name: string): Shape[] =>
  [...body(name).matchAll(/<(path|circle|ellipse|rect)\b([^>]*?)\/?>/g)].map(([, tag, attrs]) => ({
    tag,
    attrs: Object.fromEntries([...attrs!.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  })) as Shape[];

/** The one `d` the component drew, or undefined when it drew a path with none. */
const drawn = (name: string): string | undefined => /<path d="([^"]*)"/.exec(body(name))?.[1];

test('the app draws its own glyph first, where the core draws the same name differently', () => {
  for (const name of ['home', 'search', 'inbox'] as const) {
    assert.equal(iconFor(name, 'doc'), name);
    assert.deepEqual(drawnShapes(name), parseShapes(PATHS[name]));
    assert.notEqual(drawn(name), CORE[name === 'home' ? 'house' : name]);
  }
});

test('a glyph of several shapes is drawn as those shapes, with no name special-cased', () => {
  /* Settings is three sliders and three knobs: one path and three circles, read from the data. */
  assert.deepEqual(
    drawnShapes('settings').map((s) => s.tag),
    ['path', 'circle', 'circle', 'circle'],
  );
  assert.deepEqual(
    drawnShapes('projects').map((s) => s.tag),
    ['rect', 'rect', 'rect', 'rect'],
  );
  /* The dots carry the icon set's heavier stroke, on the element, over the glyph's 1.75. */
  assert.equal((drawnShapes('more')[0] as Extract<Shape, { tag: 'path' }>).attrs['stroke-width'], '2.75');
});

test('every glyph is drawn at stroke 1.75 with round caps and joins, a Lucide one included', () => {
  for (const name of ['today', 'house', 'check']) {
    const svg = /<svg[^>]*>/.exec(body(name))![0];
    assert.match(svg, /stroke-width="1\.75"/, name);
    assert.match(svg, /stroke-linecap="round"/, name);
    assert.match(svg, /stroke-linejoin="round"/, name);
    assert.match(svg, /stroke="currentColor"/, name);
  }
});

test('every app glyph parses into shapes that sit in the 24 box', () => {
  for (const [name, markup] of Object.entries(PATHS)) {
    const shapes = parseShapes(markup);
    assert.ok(shapes.length > 0, name);
    for (const s of shapes) {
      const a = s.attrs as Record<string, string>;
      const n = (k: string) => Number(a[k]);
      const box =
        s.tag === 'circle'
          ? [n('cx') - n('r'), n('cy') - n('r'), n('cx') + n('r'), n('cy') + n('r')]
          : s.tag === 'ellipse'
            ? [n('cx') - n('rx'), n('cy') - n('ry'), n('cx') + n('rx'), n('cy') + n('ry')]
            : s.tag === 'rect'
              ? [n('x'), n('y'), n('x') + n('width'), n('y') + n('height')]
              : null;
      if (box) for (const v of box) assert.ok(v >= 1 && v <= 23, `${name} ${s.tag} reaches ${v}`);
    }
  }
});

test('a markup that is not a glyph is refused, not half drawn', () => {
  assert.throws(() => parseShapes('<circle cx="1" cy="1" r="1"/><g/>'));
  assert.throws(() => parseShapes('<path d="M0 0" onload="x"/>'));
});

test('pathOf still answers ONE d for the renderer, shapes rewritten as path commands', () => {
  for (const name of Object.keys(PATHS) as (keyof typeof PATHS)[]) {
    const d = pathOf(name, undefined)!;
    assert.equal(d[0], 'M', name);
    assert.doesNotMatch(d, /NaN|undefined|</, name);
  }
  /* A circle becomes two half arcs; a rounded rect four quarter arcs; a leading relative `m` an absolute one. */
  assert.match(pathOf('search', undefined)!, /^M4\.25 10\.75a6\.5 6\.5 0 1 0 13 0a6\.5 6\.5 0 1 0 -13 0M20 20/);
  assert.match(pathOf('work', undefined)!, /^M8\.25 3\.75h7\.5a4\.5 4\.5 0 0 1 4\.5 4\.5v7\.5/);
  assert.equal(pathOf('house', undefined), CORE.house);
});

test('a core glyph the app never drew resolves, and draws at mount without waiting on the set', () => {
  assert.equal(Object.hasOwn(PATHS, 'house'), false);
  assert.equal(iconFor('house', 'doc'), 'house');
  assert.equal(drawn('house'), CORE.house);
});

test('the rail places resolve by their own names', () => {
  for (const name of ['today', 'work', 'projects', 'money', 'activity', 'decide', 'settings', 'search', 'slash', 'plus'])
    assert.equal(iconFor(name, 'doc'), name);
  assert.equal(Object.keys(PATHS).length, 70, 'the sidebar\'s pin (5e5c85667)');
});

test('the people glyphs Settings leads with draw at mount, in the app\'s hand, without waiting on the set', () => {
  for (const name of ['user-check', 'user-plus'] as const) {
    assert.equal(iconFor(name, 'doc'), name);
    assert.deepEqual(drawnShapes(name), parseShapes(HAND[name]), name);
    const d = pathOf(name, undefined)!;
    assert.equal(d[0], 'M', name);
    assert.doesNotMatch(d, /NaN|undefined|</, name);
    for (const s of parseShapes(HAND[name])) if (s.tag === 'circle') assert.ok(Number(s.attrs.cx) - Number(s.attrs.r) >= 1, name);
  }
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
  /* 186 since `pin` moved into the core (7a8d2b0ac), as `mail` did for the Inbox's own glyph (frame F15). */
  assert.equal(Object.keys(set).length, 186);
});

test('IconWell is a span.well holding the icon, its tone on the well', () => {
  const plain = render(IconWell, { props: { name: 'money' } }).body;
  assert.match(plain, /<span class="well[^"]*" data-size="m"/);
  assert.doesNotMatch(plain, /data-tone/);
  const chosen = render(IconWell, { props: { name: 'today', size: 'l', tone: 'ink' } }).body;
  assert.match(chosen, /data-size="l" data-tone="ink"/);
  assert.match(chosen, /<svg class="icon/);
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
