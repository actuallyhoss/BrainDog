/**
 * AN AMOUNT WITH A CODE IS ONE WORD, in both renderers. The skin's `.amount { white-space: nowrap }` holds a coded
 * figure on one line, and before this nothing carried `.amount`, so at 390 "EGP 1,350.00" broke after its code.
 *
 * Each drawer that writes a code in front of a figure wraps sign, code and figure in one `<span class="amount">`: the
 * table's cell (`Table.svelte`, the mirror's comparison), a stat's tile (`Grid.svelte`) and a card's figure
 * (`Cards.svelte`), with `toHTML` printing the same span in each place (the parity rule of `parity.test.ts`). A cell
 * that holds no coded amount gets none.
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
import { toHTML } from './html.ts';

/* The Svelte drawers compiled for the server on the way in, as `parity.test.ts` does it. */
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

const { default: Block } = (await import(new URL('../svelte/Block.svelte', import.meta.url).href)) as {
  default: Component<{ block: BlockSegment }>;
};

const page = (src: string): BlockSegment => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as BlockSegment;
};

/** The markup without hydration comments, with whitespace said once, as a browser builds it. */
const flat = (html: string): string =>
  html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/> </gu, '><')
    .replace(/&nbsp;| /gu, ' ');

/** Each `.amount` span, as its text reads. The span holds one inner span (the code), so the match stops at its end. */
const amounts = (html: string): string[] =>
  [...flat(html).matchAll(/<span class="amount">((?:[^<]|<span class="amount-code">[^<]*<\/span>)*)<\/span>/gu)].map(
    ([, inner]) => inner!.replace(/<[^>]+>/gu, '').replace(/&amp;/gu, '&').trim(),
  );

/** Both renderers' amounts for one block. */
function both(src: string): { svelte: string[]; html: string[] } {
  const block = page(src);
  return { svelte: amounts(render(Block, { props: { block } }).body), html: amounts(toHTML([block])) };
}

test('A TABLE CELL HOLDING "EGP 1,350.00" IS ONE AMOUNT, the same span in the app and the mirror', () => {
  const { svelte, html } = both('```comparison\nWhat | Paid | Hours\nRent | EGP 1,350.00 | 40\nPrinter | £190.00 | 2\n```');
  assert.deepEqual(html, ['EGP 1,350.00']);
  assert.deepEqual(svelte, html);
});

test('A STAT TILE\'S CODED FIGURE IS ONE AMOUNT in both renderers, and a count is not one', () => {
  const { svelte, html } = both('```stat\nRent | EGP 1,350.50\nUsers | 36\n```');
  /* SAID AS A TOTAL, whole from a thousand up (d9bab2403). */
  assert.deepEqual(html, ['EGP 1,351']);
  assert.deepEqual(svelte, html);
});

test('A CARD\'S CODED FIGURE IS ONE AMOUNT in both renderers, and a figure in a symbol needs none', () => {
  const { svelte, html } = both('```cards\ntitle | figure: Owed to you\nRent | EGP 1,350.50\nPrinter | £190.00\n```');
  assert.deepEqual(html, ['EGP 1,351']);
  assert.deepEqual(svelte, html);
});

test('A SIGN WRITTEN BEFORE THE CODE IS INSIDE THE AMOUNT, so it never stays behind on the line above', () => {
  const { svelte, html } = both('```comparison\nWhat | Moved\nRefund | −EGP 1,350.00\n```');
  assert.equal(html.length, 1);
  assert.match(html[0]!, /^−EGP 1,350\.00$/u);
  assert.deepEqual(svelte, html);
});

test('ONLY THE FIRST AMOUNT IS HELD: a figure in three currencies still wraps between its amounts, and a note wraps', () => {
  /* `stat.css`: a figure too long for its tile "wraps between its amounts (` · `) instead of shrinking further". A span
     round the whole figure held all three on one line and ran it out of its tile at 390. */
  const stat = both('```stat\nCash now | EGP 43,700.00 · £24,800.00 · USD 21,300.00\nUsers | 36\n```');
  assert.deepEqual(stat.html, ['EGP 43,700']);
  assert.deepEqual(stat.svelte, stat.html);
  const card = both('```cards\ntitle | figure: Owed to you\nRent | EGP 43,700.00 · USD 21,300.00\n```');
  assert.deepEqual(card.html, ['EGP 43,700']);
  assert.deepEqual(card.svelte, card.html);
  const cell = both('```comparison\nWhat | Paid\nRent | EGP 1,350.00 paid late in September\n```');
  assert.deepEqual(cell.html, ['EGP 1,350.00']);
  assert.deepEqual(cell.svelte, cell.html);
  assert.match(flat(toHTML([page('```comparison\nWhat | Paid\nRent | EGP 1,350.00 paid late in September\n```')])), /1,350\.00<\/span> paid late in September/u);
});

test('A CELL WITH NO CODED AMOUNT GETS NO SPAN in either renderer', () => {
  const { svelte, html } = both('```comparison\nWhat | Then | Now\nHours | 40 | 52\nWho | Mara Okafor | Wren\n```');
  assert.deepEqual(html, []);
  assert.deepEqual(svelte, []);
});

test('THE SKIN HOLDS AN AMOUNT ON ONE LINE: `.amount` does not wrap', () => {
  const css = readFileSync(new URL('../../skin/blocks.css', import.meta.url), 'utf8');
  assert.match(css, /\.amount\s*\{\s*white-space:\s*nowrap;?\s*\}/u);
});
