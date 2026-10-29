/**
 * A table row's link, on the one arm of `Table.svelte` that draws it: the phone's card list.
 *
 * A FILE OF ITS OWN BECAUSE THE ARM IS CHOSEN AT IMPORT. `rows-as-cards.svelte.ts` reads `matchMedia` once, when it is
 * first loaded, and answers the grid when there is no `window`, which is right for the SSR pass and is what
 * `parity.test.ts` needs for every table it compares. The grid arm draws no row as a link (the row is activated
 * through `onactivate`), so under that answer a row's `href` never reaches the markup and a test of it passes
 * against anything. Here a phone-width window exists before the first import, and `node --test` runs each file in
 * its own process, so the other files still see the grid.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.svelte')) {
      const filename = fileURLToPath(url);
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const filename = fileURLToPath(url);
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

Object.defineProperty(globalThis, 'window', {
  value: { matchMedia: () => ({ matches: true, addEventListener: () => {} }) },
  configurable: true,
});

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Table } = (await import(new URL('../svelte/p/Table.svelte', import.meta.url).href)) as {
  default: Component<{ columns: unknown[]; rows: unknown[]; total: number; href?: (path: string) => string }>;
};

const under = (p: string): string => (p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/acme/') ? `/acme${p}` : p);
const hrefsOf = (html: string): string[] => [...html.matchAll(/ href="([^"]*)"/gu)].map((m) => m[1]!);
const props = { columns: [{ field: 'title', label: 'Title', width: '1fr' }], rows: [{ key: '1', cells: ['Kiln'], href: '/r/things/1' }], total: 1 };

test('A PHONE CARD\'S LINK GOES THROUGH THE HOST\'S `href`, and without one it is the row\'s address as written', () => {
  const drawn = render(Table, { props }).body;
  assert.match(drawn, /class="table-cards"/u, 'the card arm is the one drawn, or the rest of this proves nothing');
  assert.deepEqual(hrefsOf(drawn), ['/r/things/1']);
  assert.deepEqual(hrefsOf(render(Table, { props: { ...props, href: under } }).body), ['/acme/r/things/1']);
});
