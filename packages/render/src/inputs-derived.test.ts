/**
 * A field the record works out from others on its row (`derive:`) in an `inputs` block: a figure with its label, never
 * a box. The record refuses a write to it, so a box over it took what was typed and dropped it.
 *
 * The kernel's inputs read marks such a row `derived: true`; a row a host marks nothing on is drawn as it always was.
 * Every figure here is invented: a price check of three costs and how many times them the price should be.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';
import type { Component } from 'svelte';

import { parse, type Block, type Row } from './parse.ts';
import { inputsPlan } from './inputs.ts';

registerHooks({
  load(url, context, next) {
    const filename = url.startsWith('file:') ? fileURLToPath(url) : '';
    if (url.endsWith('.svelte')) {
      const { js } = compile(readFileSync(filename, 'utf8'), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    if (url.endsWith('.svelte.ts')) {
      const { js } = compileModule(stripTypeScriptTypes(readFileSync(filename, 'utf8')), { generate: 'server', filename });
      return { format: 'module', source: js.code, shortCircuit: true };
    }
    return next(url, context);
  },
});

type Props = { block: Block; oninput?: (row: Row, value: string) => void };
const { default: BlockView } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as { default: Component<Props> };

const CHECK = '```inputs | The price check\nmaking | Making one | decimal | 4\ntimes_cost | Times cost | decimal | 2.5\ncost | Costs together | decimal | 7.5\n```';

/** The block as a page's evaluator hands it on, with `cost` marked as the kernel marks a field that declares `derive:`. */
function check(): Block {
  const [seg] = parse(CHECK, { page: true });
  assert.equal(seg?.type, 'block');
  const block = seg as Block;
  return { ...block, rows: block.rows.map((r) => (r.cells[0] === 'cost' ? Object.assign({ ...r }, { derived: true }) : r)) };
}

const flat = (html: string): string => html.replace(/<!--[\s\S]*?-->/gu, '').replace(/>\s+</gu, '><');

test('A DERIVED ROW PLANS READ-ONLY, and a plain row beside it plans as it always did', () => {
  const plan = inputsPlan(check().rows as (Row & { derived?: boolean })[]);
  assert.deepEqual(
    plan.fields.map((f) => [f.field, f.readonly, f.control.tag, f.control.inputmode ?? '']),
    [
      ['making', false, 'input', 'decimal'],
      ['times_cost', false, 'input', 'decimal'],
      ['cost', true, 'input', 'decimal'],
    ],
  );
  /* ONLY true COUNTS: a host that marks nothing, or marks it with something else, gets every field as a box. */
  const unmarked = inputsPlan([{ cells: ['cost', 'Costs together', 'decimal', '7.5'] }, { cells: ['least', 'Least', 'decimal', ''], derived: false }]);
  assert.deepEqual(unmarked.fields.map((f) => f.readonly), [false, false]);
});

test('WITH A HOST TO WRITE, THE DERIVED FIELD IS A FIGURE WITH ITS LABEL, and nobody can type into it', () => {
  const html = flat(render(BlockView, { props: { block: check(), oninput: () => {} } }).body);
  assert.match(html, /<div class="inputs-field inputs-worked[^"]*"><span class="inputs-label[^"]*">Costs together<\/span><span class="inputs-figure num[^"]*">7\.5<\/span><\/div>/u);
  assert.doesNotMatch(html, /name="cost"/u, 'the worked-out figure was drawn as a box');
  /* The two a person types stay boxes. */
  assert.match(html, /<input class="inputs-box[^"]*" type="text" name="making"/u);
  assert.match(html, /<input class="inputs-box[^"]*" type="text" name="times_cost"/u);
});

test('A DERIVED FIELD WITH NO VALUE YET READS AS MISSING, never as an empty box', () => {
  const block = check();
  const empty = { ...block, rows: block.rows.map((r) => (r.cells[0] === 'cost' ? Object.assign({ ...r, cells: ['cost', 'Costs together', 'decimal', ''] }, { derived: true }) : r)) };
  const html = flat(render(BlockView, { props: { block: empty, oninput: () => {} } }).body);
  assert.match(html, /<span class="inputs-figure num[^"]*">[^<]+<\/span>/u);
  assert.doesNotMatch(html, /name="cost"/u);
});
