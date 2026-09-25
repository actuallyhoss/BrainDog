/**
 * A roadmap's drag, reached from where a host actually holds it: a page's `<Block>`, not the drawer on its own.
 *
 * THE DRAWER TOOK THE CALLBACK AND NOTHING HANDED IT ONE. `roadmap-drag.test.ts` renders `Roadmap.svelte` directly with
 * `onreschedule` and proves every bar a grip, and it passed while the app had no draggable bar anywhere: `Block.svelte`
 * did not declare the prop and `List.svelte` drew `<Roadmap {block} {opts} />`, so the callback a page passed stopped
 * at the first component it met. A test on the drawer alone could not see that, because it skips both layers.
 *
 * SO THIS ONE GOES IN AT THE TOP, through the two layers a page's block crosses, and asks the markup the drawer only
 * draws with a callback in hand. Run against the tree before `Block` and `List` passed it on, both grip tests here
 * failed with no bar and no date a grip (0 and 0 where 2 and 1 were expected), while `roadmap-drag.test.ts` stayed
 * green over the same drawer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block, type Row } from '../../src/parse.ts';

/* `parity.test.ts`'s hook. `Block` reaches `Table`, which reads a runes module, so both kinds of file are compiled. */
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

type Props = { block: Block; opts: { now: number }; onreschedule?: (row: Row, drop: unknown) => void };
/* By URL, so the type checker, which has no Svelte compiler here, does not look for the file. */
const load = async (path: string): Promise<Component<Props>> =>
  ((await import(new URL(path, import.meta.url).href)) as { default: Component<Props> }).default;

const NOW = Date.UTC(2026, 8, 22, 12);
const FENCE = '```roadmap | Autumn\nBuild the kiln page | 2026-09-10 | 10\nRegate window | 2026-10-05 | 3 | warn\nLaunch | 2026-09-30\n```';
const block = (): Block => parse(FENCE)[0] as Block;

/**
 * The marks a pointer can take: the windows, which are grips themselves, and the dates, each taken by a wide stroke
 * nobody sees laid over its hairline. The fence has two windows and one date.
 */
const grips = (html: string): { bars: number; stems: number } => ({
  bars: (html.match(/<rect[^>]*class="roadmap-bar"[^>]*data-grip=""[^>]*>/gu) ?? []).length,
  stems: (html.match(/<path[^>]*class="roadmap-grip"[^>]*>/gu) ?? []).length,
});

for (const [name, path] of [
  ['a page block', '../Block.svelte'],
  ['the list primitive', './List.svelte'],
] as const) {
  test(`${name} hands the host's callback on to the roadmap, so every bar and every date is a grip`, async () => {
    const html = render(await load(path), { props: { block: block(), opts: { now: NOW }, onreschedule: () => {} } }).body;
    assert.match(html, /class="roadmap-bar"/u);
    assert.deepEqual(grips(html), { bars: 2, stems: 1 });
  });

  test(`${name} with no callback still draws the picture it drew: nothing a pointer can take`, async () => {
    const html = render(await load(path), { props: { block: block(), opts: { now: NOW } } }).body;
    assert.match(html, /class="roadmap-bar"/u);
    assert.deepEqual(grips(html), { bars: 0, stems: 0 });
  });
}
