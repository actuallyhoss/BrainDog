/**
 * A typed amount, `{{money:1840000 GBP}}`, is the one writer's where the host says the record's home, in the mirror and
 * in the Svelte drawer alike: a page that drew `GBP 18,400.00` in its sentence beside `£4,050` on its tiles spelled the
 * pound two ways (`two-spellings` on the gates' `/p/kiln`). A host that does not say draws what it drew before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block as BlockSegment } from './parse.ts';
import { toHTML, type RenderOptions } from './html.ts';

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

/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment; opts?: RenderOptions }>;
};

const SPEC = '```spec | Hosting\nObject storage | {{money:4100 GBP}} a month | the binaries\nFonts | {{money:129950 USD}} a year | the licence\n```';

const block = (): BlockSegment => {
  const [seg] = parse(SPEC, { page: true });
  assert.equal(seg?.type, 'block');
  return seg as BlockSegment;
};

/** The words of every typed figure, as drawn. */
const typed = (html: string): string[] =>
  [...html.matchAll(/<span class="typed num" data-form="money">([^<]*)<\/span>/gu)].map((m) => m[1]!.replace(/\s/gu, ' '));
const mirror = (opts: RenderOptions): string[] => typed(toHTML([block()], opts));
const drawer = (opts: RenderOptions): string[] => typed(render(Block, { props: { block: block(), opts } }).body);

test('told the home, a typed amount is said as the writer says it among words, in both drawers', () => {
  const home = { home: 'GBP' };
  assert.deepEqual(mirror(home), ['£41', '$1,299.50 USD']);
  assert.deepEqual(drawer(home), mirror(home));
});

test('a host that does not say draws the stored form, as before', () => {
  assert.deepEqual(mirror({}), ['GBP 41.00', 'USD 1,299.50']);
  assert.deepEqual(drawer({}), mirror({}));
});
