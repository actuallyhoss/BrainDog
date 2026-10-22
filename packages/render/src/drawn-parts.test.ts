/**
 * Inside a block, a part with no value is not drawn (PGS-A05: an empty or unused part is not drawn, so a page stays calm).
 *
 * The answers both drawers read (`unvalued` in `path.ts`, `drawnRows` and `emptied` in `html.ts`), held here without a
 * DOM; `parity.test.ts` holds the two trees equal over the same shapes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parse, type Block } from './parse.ts';
import { EMPTY_KEEP, describe, drawnRows, emptied, keepsNought, toHTML } from './html.ts';
import { pathPlan, unvalued } from './path.ts';
import { MISSING } from './format.ts';

const page = (src: string): Block => {
  const [seg] = parse(src, { page: true });
  assert.equal(seg?.type, 'block', `the fixture did not parse as a block: ${src}`);
  return seg as Block;
};

test('A VALUE IS MISSING WHEN IT IS NOTHING, BLANK OR THE DASH A READER PRINTS FOR NULL, and zero is a value', () => {
  for (const v of [undefined, null, '', '   ', MISSING, ` ${MISSING} `]) assert.equal(unvalued(v), true, String(v));
  for (const v of ['0', '£0', 'EGP 0', 'no', '-', '12', '— and more']) assert.equal(unvalued(v), false, v);
});

test('A STAT DRAWS ITS FIGURES THAT HOLD A VALUE, each at its place in the block, and counts its tiles after', () => {
  const b = page('```stat\nCosts a year | — | \nEarns a month | 0 | \nUsers | 41 | \n```');
  assert.deepEqual(drawnRows(b, {}).map(({ row, at }) => [row.cells[0], at]), [['Earns a month', 1], ['Users', 2]]);
  const html = toHTML([b]);
  assert.match(html, /style="--cells:2"/u);
  assert.doesNotMatch(html, /Costs a year|—/u);
  assert.match(html, /Earns a month/u, 'a figure of nought is a value, and stays');
});

test('A SPEC ROW AND A CHIP WITH NO VALUE ARE LEFT OUT, and so is a chip with no word', () => {
  const spec = page('```spec\nKeeping it alive: quietcart.example | — | \nDomain | quietcart.example | \n```');
  assert.deepEqual(drawnRows(spec, {}).map(({ row }) => row.cells[0]), ['Domain']);
  const chips = page('```chips\ndot | — | status\ndot | 2 | — \ndot | 3 | open\n```');
  assert.deepEqual(drawnRows(chips, {}).map(({ row }) => row.cells[2]), ['open']);
});

test('A STONE WITH NO STEP IS LEFT OUT OF THE PATH, and kept where the block keeps its noughts', () => {
  const rows = page('```steps path\nSample the fit | maker | done\n— | quoted | \nPick a board |  | next\n```').rows;
  assert.deepEqual(pathPlan(rows).stones.map((s) => s.row.cells[0]), ['Sample the fit', 'Pick a board']);
  assert.equal(pathPlan(rows, true).stones.length, 3);
});

test('`empty: keep` KEEPS EVERY PART, a missing one as a dash, and a chip still needs both its cells written', () => {
  const keep = { empty: () => EMPTY_KEEP };
  const stat = page('```stat\nCosts a year | — | \nEarns a month |  | \n```');
  assert.equal(keepsNought(stat, keep), true);
  assert.equal(drawnRows(stat, keep).length, 2);
  assert.equal(emptied(stat, keep), undefined, 'a block that keeps its noughts is never left with nothing');
  assert.equal((toHTML([stat], keep).match(/—/gu) ?? []).length, 2);
  const chips = page('```chips\ndot | — | status\ndot |  | lane\n```');
  assert.deepEqual(drawnRows(chips, keep).map(({ row }) => row.cells[2]), ['status']);
});

test('A BLOCK LEFT WITH NOTHING SAYS THE LINE ITS HOST NAMES, and is not drawn where the host names none', () => {
  const b = page('```stat | Running costs\nCosts a year | — | \n```');
  assert.equal(emptied(b, {}), null);
  assert.equal(emptied(b, { empty: () => null }), null);
  assert.equal(emptied(b, { empty: () => '  ' }), null, 'a blank line is no line');
  assert.equal(emptied(b, { empty: () => 'Nothing costs money yet.' }), 'Nothing costs money yet.');
  assert.equal(toHTML([b]), '');
  assert.equal(
    toHTML([b], { empty: () => 'Nothing costs money yet.' }),
    '<figure class="block block-grid" data-kind="stat" data-primitive="grid"><figcaption class="block-head">Running costs</figcaption><p class="block-empty">Nothing costs money yet.</p></figure>',
  );
  assert.equal(emptied(page('```stat\nUsers | 41 | \n```'), { empty: () => 'x' }), undefined, 'a block with a part left draws it');
});

test('A PATH WITH NO STONE LEFT BUT A COUNT OF THE REST STILL SAYS THE COUNT', () => {
  const b = page('```steps path\n— | maker | \nmore | 4\n```');
  assert.equal(emptied(b, {}), undefined);
  assert.match(toHTML([b]), /4 more/u);
});

test('A BLOCK THIS RULE DOES NOT READ IS DRAWN AS IT WAS: a card, a board, a list and a field to type into', () => {
  for (const src of [
    '```board\nDoing | — | Claude\n```',
    '```todo\n[ ] — | \n```',
    '```steps\n— | maker | \n```',
    '```bar\nRent | — | \n```',
  ]) {
    const b = page(src);
    assert.equal(emptied(b, {}), undefined, src);
    assert.equal(drawnRows(b, {}).length, b.rows.length, src);
    assert.notEqual(toHTML([b]), '', src);
  }
});

test('A FIGURE NOT DRAWN IS NOT SAID in its accessible name either', () => {
  const b = page('```stat | Costs\nCosts a year | — | \nUsers | 41 | \n```');
  assert.equal(describe(b), 'Costs. Users, 41');
});

test('EVERY DRAWER OF THE FOUR PARTS ASKS THE SAME ANSWERS, so the app cannot keep a part the mirror leaves out', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const [file, names] of [
    ['../svelte/p/Grid.svelte', ['drawnRows', 'emptied']],
    ['../svelte/p/Rows.svelte', ['drawnRows', 'emptied']],
    ['../svelte/p/Inline.svelte', ['drawnRows', 'emptied']],
    ['../svelte/Path.svelte', ['emptied', 'keepsNought']],
  ] as const) {
    const src = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const n of names) assert.match(src, new RegExp(`\\b${n}\\(block, opts\\)`, 'u'), `${file} does not ask ${n}`);
    assert.match(src, /class="block-empty"/u, `${file} does not draw the empty line`);
  }
});
